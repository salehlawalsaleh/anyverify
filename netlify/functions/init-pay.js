// netlify/functions/init-pay.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Allow CORS + preflight
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers
    };
  }

  try {
    // Ensure body exists
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing request body" })
      };
    }

    // Parse body safely
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON in request body", details: err.message })
      };
    }

    const { uid, email, amount } = body || {};

    if (!email || !amount || !uid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields: uid, email, amount" })
      };
    }

    // Read Paystack secret from env
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
    if (!PAYSTACK_SECRET) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Server misconfigured: PAYSTACK_SECRET not set" })
      };
    }

    const initializeUrl = "https://api.paystack.co/transaction/initialize";
    const amountKobo = Math.round(Number(amount) * 100);

    const initRes = await fetch(initializeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        metadata: { uid },
      })
    });

    const initJson = await initRes.json();

    if (!initRes.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Paystack initialize failed", details: initJson })
      };
    }

    // optionally: here you could write an "initiated" record to your DB.
    // For now, we just return initJson to client so it can open Paystack popup.

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: initJson.data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error", details: err.message })
    };
  }
};
