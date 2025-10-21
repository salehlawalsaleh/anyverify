// config.js (CommonJS)
const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin;

  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  const dbUrl = process.env.FIREBASE_DATABASE_URL;

  if (!sa || !dbUrl) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_URL');
  }

  let cred;
  try {
    cred = JSON.parse(sa);
  } catch (err) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT JSON');
  }

  admin.initializeApp({
    credential: admin.credential.cert(cred),
    databaseURL: dbUrl,
  });

  return admin;
}

function getDb() {
  const a = initFirebaseAdmin();
  return a.database();
}

module.exports = { initFirebaseAdmin, getDb };