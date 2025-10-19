// netlify/functions/init-pay.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing request body" }) };
    }

    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON in request body", details: err.message }) };
    }

    const { uid, email, amount } = body || {};
    if (!uid || !email || !amount) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields: uid, email, amount" }) };
    }

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
    if (!PAYSTACK_SECRET) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfigured: PAYSTACK_SECRET not set" }) };
    }

    const initializeUrl = "https://api.paystack.co/transaction/initialize";
    const amountKobo = Math.round(Number(amount) * 100);

    const initRes = await fetch(initializeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, amount: amountKobo, metadata: { uid } })
    });

    const initJson = await initRes.json();

    if (!initRes.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Paystack initialize failed", details: initJson }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: initJson.data }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error", details: err.message }) };
  }
};
