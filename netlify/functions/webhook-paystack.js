// netlify/functions/webhook-paystack.js
const crypto = require('crypto');
const admin = require('firebase-admin');

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
  // Paystack sends POST with raw JSON body; Netlify gives body string in event.body
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const signature = (event.headers && (event.headers['x-paystack-signature'] || event.headers['X-Paystack-Signature'])) || '';
  const secret = process.env.PAYSTACK_SECRET;
  if (!secret) {
    console.error('PAYSTACK_SECRET missing');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  // compute hmac of raw body
  const rawBody = event.body || '';
  const hmac = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

  if (hmac !== signature) {
    console.warn('Invalid Paystack signature', { hmac, signature });
    // return 401 or 400 so Paystack may retry? We'll 400
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // parse JSON safely
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    console.error('webhook parse error', e);
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  try {
    ensureFirebase();
    const db = admin.database();

    const eventType = payload.event || '';
    const data = payload.data || {};
    const reference = data.reference;

    if (!reference) {
      console.error('no reference in webhook payload', payload);
      return { statusCode: 400, body: 'Missing reference' };
    }

    // lookup mapping
    const mapSnap = await db.ref(`pay_references/${reference}`).get();
    if (!mapSnap.exists()) {
      // If mapping not found, try to search deposits (less ideal). For now log and store webhook raw
      console.warn('reference mapping not found for', reference);
      await db.ref(`webhook_misses/${reference}/${Date.now()}`).set({ payload, receivedAt: Date.now() });
      return { statusCode: 200, body: 'ok' }; // ack
    }

    const { uid, depId, txId } = mapSnap.val();

    // Determine status mapping from Paystack status/gateway_response
    // Example: data.status === 'success'
    const psStatus = (data.status || '').toString().toLowerCase();
    let newStatus = 'processing';
    if (psStatus === 'success' || psStatus === 'paid') newStatus = 'approved';
    else if (psStatus === 'failed' || psStatus === 'declined') newStatus = 'declined';
    else if (psStatus === 'abandoned' || psStatus === 'cancelled') newStatus = 'cancelled';
    else newStatus = psStatus || 'processing';

    const updates = {};
    updates[`deposits/${uid}/${depId}/status`] = newStatus;
    updates[`deposits/${uid}/${depId}/updatedAt`] = Date.now();
    updates[`deposits/${uid}/${depId}/reference`] = reference;
    updates[`deposits/${uid}/${depId}/paystack_raw`] = data;

    if (txId) {
      updates[`users/${uid}/transactions/${txId}/status`] = newStatus;
      updates[`users/${uid}/transactions/${txId}/updatedAt`] = Date.now();
    }

    // If payment success, you may also increment user balance or create credit record — do that here if desired.

    await db.ref().update(updates);

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('webhook processing error', err);
    return { statusCode: 500, body: 'server error' };
  }
};
