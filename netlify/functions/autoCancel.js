import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();

export async function handler() {
  try {
    const depositsRef = db.ref("deposits");
    const snapshot = await depositsRef.once("value");
    const now = Date.now();
    const THIRTY_MIN = 30 * 60 * 1000;
    let count = 0;

    snapshot.forEach((child) => {
      const dep = child.val();
      if (dep.status === "pending" && now - dep.createdAt > THIRTY_MIN) {
        child.ref.update({ status: "cancelled" });
        count++;
      }
    });

    return { statusCode: 200, body: JSON.stringify({ cancelled: count }) };
  } catch (err) {
    console.error("cancel error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
