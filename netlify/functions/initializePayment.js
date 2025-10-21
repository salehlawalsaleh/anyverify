// initializePayment.js
const { getDb } = require('./config');

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    if (!process.env.PAYSTACK_SECRET) {
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Missing PAYSTACK_SECRET' }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { uid, amount, email } = body;

    if (!uid || !amount || !email) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing uid, amount, or email' }) };
    }

    const amountNum = Number(amount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid amount' }) };
    }

    // Initialize Paystack transaction
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amountNum * 100),
        callback_url: 'https://anyverified.netlify.app/deposit.html', // replace if needed
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
      console.error('Paystack initialize error:', data);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Paystack initialization failed', details: data }) };
    }

    // store deposit record (push)
    const db = getDb();
    const ref = db.ref('deposits').push();
    const depositData = {
      uid,
      email,
      amount: amountNum,
      status: 'pending',
      reference: data.data.reference,
      createdAt: Date.now(),
      date: new Date().toISOString().split('T')[0],
      timeTxt: new Date().toLocaleTimeString(),
    };

    await ref.set(depositData);

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        message: 'initialized',
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
      }),
    };
  } catch (err) {
    console.error('initializePayment error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};