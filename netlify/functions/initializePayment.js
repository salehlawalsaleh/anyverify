import axios from "axios";
import { db } from "./config.js";

export async function handler(event) {
  try {
    const { uid, amount } = JSON.parse(event.body);

    // Check active deposits (max 3)
    const userDepositsRef = db.ref(`deposits/${uid}`);
    const snapshot = await userDepositsRef.once("value");
    const deposits = snapshot.val() || {};
    const active = Object.values(deposits).filter(
      d => ["submitted", "processing"].includes(d.status)
    );
    if (active.length >= 3) {
      return { statusCode: 400, body: JSON.stringify({ error: "Max 3 active deposits allowed" }) };
    }

    // Create Paystack transaction
    const response = await axios.post("https://api.paystack.co/transaction/initialize", {
      amount: amount * 100,
      email: `${uid}@anyverified.app`,
      callback_url: "https://anyverified.netlify.app/.netlify/functions/verifyPayment"
    }, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` }
    });

    const data = response.data.data;
    const ref = data.reference;

    await userDepositsRef.child(ref).set({
      amount,
      status: "submitted",
      createdAt: Date.now()
    });

    return { statusCode: 200, body: JSON.stringify({ authorization_url: data.authorization_url }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
