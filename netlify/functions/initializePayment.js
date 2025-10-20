const axios = require("axios");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, amount } = body;

    // Validation
    if (!uid || !amount) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing uid or amount" }),
      };
    }

    // Example: Initialize Paystack payment (edit with your secret key)
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
    const headers = {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    };

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: `${uid}@example.com`,
        amount: amount * 100, // Paystack needs kobo
      },
      { headers }
    );

    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };
  } catch (error) {
    console.error("Payment Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error starting payment",
        message: error.message,
      }),
    };
  }
};
