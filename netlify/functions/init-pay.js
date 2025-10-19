// netlify/functions/init-pay.js
const fetch = require('node-fetch');
const admin = require('firebase-admin');

exports.handler = async (event, context) => {
  console.log('DEBUG: init-pay received request');
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { uid, email, amount } = body;
    if (!uid || !amount) return { statusCode: 400, body: JSON.stringify({ error: 'uid and amount required' }) };

    // Init firebase-admin if not initialized
    if (!admin.apps.length) {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(svc),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    const db = admin.database();

    // Create a unique reference (Paystack also returns one, but we set ours to keep match)
    const reference = `REF_${Date.now()}_${Math.floor(Math.random()*10000)}`;

    // Initialize Paystack transaction
    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email || 'no-reply@local',
        amount: Math.round(amount * 100),
        reference,
        metadata: { uid }
      })
    });

    const initData = await initRes.json();
    if (!initRes.ok) {
      console.error('Paystack init error', initData);
      return { statusCode: 500, body: JSON.stringify({ error: 'Paystack initialization failed', details: initData }) };
    }

    // Save a deposit record with status 'initiated'
    const depRef = db.ref(`deposits/${uid}`).push();
    const depositObj = {
      amount,
      reference,
      status: 'initiated',
      timestamp: Date.now(),
      updatedAt: Date.now(),
      payment_init: initData.data || {}
    };
    await depRef.set(depositObj);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: initData.data, depositKey: depRef.key })
    };
  } catch (err) {
    console.error('init-pay error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
