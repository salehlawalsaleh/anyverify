import fetch from "node-fetch";
import admin from "firebase-admin";

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
    const { reference } = body;

    if (!reference) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing reference" }) };
    }

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status) {
      return { statusCode: 400, body: JSON.stringify({ error: "Verification failed" }) };
    }

    if (verifyData.data.status === "success") {
      const depositsRef = db.ref("deposits");
      const snapshot = await depositsRef
        .orderByChild("reference")
        .equalTo(reference)
        .once("value");

      snapshot.forEach((child) => {
        child.ref.update({
          status: "approved",
          timestamp: Date.now(),
          timeTxt: new Date().toLocaleTimeString(),
          date: new Date().toISOString().split("T")[0],
        });
      });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("verify error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
