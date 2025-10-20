import fetch from "node-fetch";
import admin from "firebase-admin";

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, amount, email } = body;

    if (!uid || !amount || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing uid, amount, or email" }),
      };
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Math.round(Number(amount) * 100),
        callback_url: "https://anyverified.netlify.app/deposit.html",
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
      console.error("Paystack error:", data);
      return { statusCode: 500, body: JSON.stringify(data) };
    }

    const ref = db.ref(`deposits`).push();
    const depositData = {
      uid,
      email,
      amount,
      status: "pending",
      reference: data.data.reference,
      createdAt: Date.now(),
      date: new Date().toISOString().split("T")[0],
      timeTxt: new Date().toLocaleTimeString(),
    };

    await ref.set(depositData);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "initialized",
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
      }),
    };
  } catch (err) {
    console.error("init error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
