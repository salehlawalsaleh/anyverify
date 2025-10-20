import { db } from "./config.js";

export async function handler() {
  try {
    const depositsRef = db.ref("deposits");
    const snapshot = await depositsRef.once("value");
    const deposits = snapshot.val() || {};
    const now = Date.now();
    let cancelled = 0;

    for (const uid in deposits) {
      for (const ref in deposits[uid]) {
        const dep = deposits[uid][ref];
        if (["submitted", "processing"].includes(dep.status) && now - dep.createdAt > 30 * 60 * 1000) {
          await depositsRef.child(`${uid}/${ref}`).update({ status: "cancelled", autoCancelledAt: now });
          cancelled++;
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ cancelled }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
