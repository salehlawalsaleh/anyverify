// verifyPayment.js
const { getDb } = require('./config');

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    if (!process.env.PAYSTACK_SECRET) {
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Missing PAYSTACK_SECRET' }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { reference } = body;

    if (!reference) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing reference' }) };
    }

    // Verify with Paystack
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData || verifyData.status !== true) {
      console.error('Paystack verify failed:', verifyData);
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Verification failed', details: verifyData }) };
    }

    if (verifyData.data && verifyData.data.status === 'success') {
      const db = getDb();
      const depositsRef = db.ref('deposits');
      const snapshot = await depositsRef.orderByChild('reference').equalTo(reference).once('value');

      if (!snapshot.exists()) {
        // nothing to update but still return success
        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, message: 'Verified but no local record found' }) };
      }

      const updates = [];
      snapshot.forEach((child) => {
        updates.push(child.ref.update({
          status: 'approved',
          timestamp: Date.now(),
          timeTxt: new Date().toLocaleTimeString(),
          date: new Date().toISOString().split('T')[0],
        }));
      });

      await Promise.all(updates);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('verifyPayment error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};