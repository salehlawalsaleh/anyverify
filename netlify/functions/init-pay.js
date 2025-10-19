// netlify/functions/init-pay.js
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

if (!SERVICE_ACCOUNT_JSON) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT env var');
}

if (!admin.apps.length) {
  try {
    const sa = SERVICE_ACCOUNT_JSON ? JSON.parse(SERVICE_ACCOUNT_JSON) : null;
    admin.initializeApp({
      credential: sa ? admin.credential.cert(sa) : undefined,
      databaseURL: DATABASE_URL,
    });
  } catch (err) {
    console.error('Failed to init firebase-admin', err);
  }
}
const db = admin.database();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { uid, email, amount } = body;
    if (!uid || !email || !amount) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing uid/email/amount' }) };
    }

    const amountKobo = Math.round(Number(amount) * 100);

    // Initialize Paystack transaction
    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        metadata: { uid, purpose: 'deposit' },
      }),
    });

    const initJson = await initRes.json();
    if (!initRes.ok || !initJson || !initJson.data || !initJson.data.reference) {
      console.error('Paystack initialize error', initJson);
      return { statusCode: 502, body: JSON.stringify({ message: 'Paystack initialize failed', detail: initJson }) };
    }

    const reference = initJson.data.reference;

    // Store deposit in Firebase under deposits/{uid}/{pushId}
    const depositsRef = db.ref(`deposits/${uid}`);
    const newRef = depositsRef.push();
    const depositObj = {
      reference,
      amount: Number(amount),
      amountKobo,
      uid,
      email,
      status: 'initiated',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await newRef.set(depositObj);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: initJson.data }),
    };
  } catch (err) {
    console.error('init-pay handler error', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
