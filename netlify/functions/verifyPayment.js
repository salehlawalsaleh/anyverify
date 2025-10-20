import axios from "axios";
import { db } from "./config.js";

export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const ref = body.reference || (event.queryStringParameters && event.queryStringParameters.reference);

    if (!ref) return { statusCode: 400, body: "Missing reference" };

    // Verify Paystack transaction
    const verify = await axios.get(`https://api.paystack.co/transaction/verify/${ref}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` }
    });

    const data = verify.data.data;
    const uid = data.customer.email.split("@")[0];
    const userDepositRef = db.ref(`deposits/${uid}/${ref}`);

    const status = data.status === "success" ? "approved" : "cancelled";
    await userDepositRef.update({ status, verifiedAt: Date.now() });

    if (status === "approved") {
      const userBalanceRef = db.ref(`users/${uid}/balance`);
      const snapshot = await userBalanceRef.once("value");
      const oldBalance = snapshot.val() || 0;
      await userBalanceRef.set(oldBalance + data.amount / 100);
    }

    if (event.httpMethod === "GET") {
      return {
        statusCode: 302,
        headers: { Location: `/deposit.html?reference=${ref}` }
      };
    }

    return { statusCode: 200, body: JSON.stringify({ status }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
