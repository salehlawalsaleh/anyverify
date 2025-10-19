// netlify/functions/paystack-webhook.js
const crypto = require('crypto');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;

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
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sigHeader = event.headers['x-paystack-signature'] || event.headers['X-Paystack-Signature'] || '';
  const body = event.body || '';

  // verify signature
  const computed = crypto.createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');
  if (computed !== sigHeader) {
    console.warn('Invalid signature', { computed, sigHeader });
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let payload;
  try { payload = JSON.parse(body); } catch (e) {
    console.error('Invalid JSON webhook body', e);
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  try {
    const eventName = payload.event;
    const trx = payload.data;

    // handle successful charge
    if (eventName === 'charge.success' || (trx && trx.status === 'success')) {
      const reference = trx.reference;

      // optional: verify with Paystack for extra safety
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
      });
      const verifyJson = await verifyRes.json();

      if (!verifyRes.ok || !verifyJson || !verifyJson.data || verifyJson.data.status !== 'success') {
        console.warn('Paystack verify issue', verifyJson);
      } else {
        // Update matching deposit records (search deposits/{uid}/{pushId})
        const depositsRoot = db.ref('deposits');
        const snap = await depositsRoot.once('value');
        const updates = {};
        snap.forEach(userSnap => {
          userSnap.forEach(depSnap => {
            const d = depSnap.val();
            if (d && d.reference === reference) {
              const path = `deposits/${userSnap.key}/${depSnap.key}`;
              updates[`${path}/status`] = 'approved';
              updates[`${path}/updatedAt`] = Date.now();
              updates[`${path}/paystackData`] = verifyJson.data;
            }
          });
        });
        if (Object.keys(updates).length) await db.ref().update(updates);

        // also insert transaction under user
        const uid = verifyJson.data && verifyJson.data.metadata && verifyJson.data.metadata.uid;
        if (uid) {
          const txRef = db.ref(`users/${uid}/transactions`).push();
          await txRef.set({
            amount: verifyJson.data.amount / 100,
            action: 'deposit',
            status: 'approved',
            reference,
            timestamp: Date.now(),
            paystack: verifyJson.data
          });
        }
      }
    }

    // handle charge failed
    if (eventName === 'charge.failed' || (trx && trx.status === 'failed')) {
      const reference = trx.reference;
      const depositsRoot = db.ref('deposits');
      const snap = await depositsRoot.once('value');
      const updates = {};
      snap.forEach(userSnap => {
        userSnap.forEach(depSnap => {
          const d = depSnap.val();
          if (d && d.reference === reference) {
            const path = `deposits/${userSnap.key}/${depSnap.key}`;
            updates[`${path}/status`] = 'declined';
            updates[`${path}/updatedAt`] = Date.now();
            updates[`${path}/paystackData`] = trx;
          }
        });
      });
      if (Object.keys(updates).length) await db.ref().update(updates);
    }

    return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
  } catch (err) {
    console.error('Webhook processing error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
