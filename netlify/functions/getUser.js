// getUser.js
const { getDb } = require('./config');

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const uid = event.queryStringParameters && event.queryStringParameters.uid;
    if (!uid) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing uid' }) };

    const db = getDb();
    const snap = await db.ref(`users/${uid}`).once('value');
    const val = snap.val() || {};
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ user: val }) };
  } catch (err) {
    console.error('getUser error', err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};