const admin = require('firebase-admin');
function initFirebaseAdmin(){
  if(admin.apps && admin.apps.length) return admin;
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if(!serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  if(!databaseURL) throw new Error('FIREBASE_DATABASE_URL not set');
  const cred = JSON.parse(serviceAccount);
  admin.initializeApp({
    credential: admin.credential.cert(cred),
    databaseURL: databaseURL
  });
  return admin;
}
exports.handler = async (event, context) => {
  try{
    const uid = event.queryStringParameters && event.queryStringParameters.uid;
    if(!uid) return { statusCode: 400, body: 'Missing uid' };
    const admin = initFirebaseAdmin();
    const db = admin.database();
    const snap = await db.ref(`users/${uid}`).once('value');
    const val = snap.val() || {};
    return { statusCode: 200, body: JSON.stringify({ user: val }) };
  }catch(err){
    console.error('getUser error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
