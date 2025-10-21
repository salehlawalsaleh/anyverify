// autoCancel.js
const { getDb } = require('./config');

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async () => {
  try {
    const db = getDb();
    const depositsRef = db.ref('deposits');
    const snapshot = await depositsRef.once('value');
    const now = Date.now();
    const THIRTY_MIN = 30 * 60 * 1000;
    let count = 0;

    snapshot.forEach((child) => {
      const dep = child.val();
      if (dep && dep.status === 'pending' && now - (dep.createdAt || 0) > THIRTY_MIN) {
        child.ref.update({
          status: 'cancelled',
          timestamp: now,
          timeTxt: new Date().toLocaleTimeString(),
          date: new Date().toISOString().split('T')[0],
        });
        count++;
      }
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ cancelled: count }) };
  } catch (err) {
    console.error('autoCancel error:', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};