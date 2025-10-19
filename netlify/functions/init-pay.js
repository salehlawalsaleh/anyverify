// netlify/functions/init-pay.js
const crypto = require('crypto'); // not strictly needed here, left for parity
const admin = require('firebase-admin');

const PAYSTACK_INIT_URL = 'https://api.paystack.co/transaction/initialize';

function ensureFirebase() {
  if (!admin.apps.length) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saJson) throw new Error('FIREBASE_SERVICE_ACCOUNT env var not set');
    const sa = JSON.parse(saJson);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  }
}

exports.handler = async function(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // parse body safely
  let body;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch (e) {
    console.error('init-pay: invalid JSON body', e, 'raw:', event.body);
    return { statusCode: 400, body: JSON.stringify({ error: '"undefined" is not valid JSON' }) };
  }

  const { uid, email, amount } = body || {};
  if (!uid || !amount || isNaN(Number(amount))) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing uid or amount' }) };
  }

  try {
    ensureFirebase();
    const db = admin.database();

    // create deposit record and a ref map for reference -> uid/depId
    const depositsRef = db.ref(`deposits/${uid}`);
    const newDepRef = depositsRef.push();
    const depId = newDepRef.key;
    const now = Date.now();

    // We'll generate our own reference (unique) so we can pass to Paystack initialize
    const reference = `AMR-${Date.now().toString(36)}-${Math.floor(Math.random()*90000+10000)}`;

    const depositObj = {
      amount: Number(amount),
      status: 'initiated',
      timestamp: now,
      updatedAt: now,
      uid,
      reference,
      note: 'initiated via init-pay'
    };

    const txRef = db.ref(`users/${uid}/transactions`).push();
    const txId = txRef.key;
    const txObj = {
      type: 'credit',
      action: 'deposit',
      amount: Number(amount),
      status: 'initiated',
      timestamp: now,
      depositId: depId,
      updatedAt: now,
      createdBy: 'system'
    };

    // multi-path update: deposit and transaction and reference map
    const updates = {};
    updates[`deposits/${uid}/${depId}`] = depositObj;
    updates[`users/${uid}/transactions/${txId}`] = txObj;
    updates[`pay_references/${reference}`] = { uid, depId, txId, createdAt: now };

    await db.ref().update(updates);

    // Call Paystack initialize
    const secret = process.env.PAYSTACK_SECRET;
    if (!secret) {
      console.error('PAYSTACK_SECRET not set');
      return { statusCode: 500, body: JSON.stringify({ error: 'server misconfigured' }) };
    }

    const payload = {
      email: email || 'no-reply@ameertech.local',
      amount: Math.round(Number(amount) * 100), // in kobo
      reference,
      metadata: { uid, depId }
    };

    const psRes = await fetch(PAYSTACK_INIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`
      },
      body: JSON.stringify(payload)
    });

    const psJson = await psRes.json();

    if (!psRes.ok || !psJson || !psJson.data) {
      console.error('Paystack init failed', psJson);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Failed to initialize payment', raw: psJson })
      };
    }

    // Return Paystack init response to client
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: psJson.data })
    };

  } catch (err) {
    console.error('init-pay error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
