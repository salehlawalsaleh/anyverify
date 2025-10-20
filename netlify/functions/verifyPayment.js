const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin lazily
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
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
    if(!PAYSTACK_SECRET) return { statusCode: 500, body: 'Paystack secret not configured' };

    const sigHeader = event.headers['x-paystack-signature'] || event.headers['X-Paystack-Signature'];
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(event.body).digest('hex');
    if(sigHeader !== hash){
      console.warn('Invalid signature', sigHeader, hash);
      return { statusCode: 400, body: 'Invalid signature' };
    }

    const payload = JSON.parse(event.body);
    if(payload.event === 'charge.success' || (payload.event && payload.event.toLowerCase().includes('charge.success'))){
      const data = payload.data;
      const amount = data.amount;
      const reference = data.reference;
      // metadata should contain uid and email
      const metadata = data.metadata || {};
      const uid = metadata.uid;
      const email = metadata.email || (data.customer && data.customer.email) || data.customer_email || data.customer?.email;

      if(!uid){
        console.warn('No uid in metadata - skipping');
        return { statusCode: 400, body: 'No uid in metadata' };
      }

      const admin = initFirebaseAdmin();
      const db = admin.database();

      // create deposit record and update user balance atomically
      const depositsRef = db.ref(`deposits/${uid}`);
      const userRef = db.ref(`users/${uid}`);

      // Read current balance
      const userSnap = await userRef.once('value');
      const currentBalance = (userSnap.val() && userSnap.val().balance) ? Number(userSnap.val().balance) : 0;
      const newBalance = currentBalance + (amount / 100);

      // push deposit record
      const depositData = {
        amount: amount / 100,
        reference,
        status: 'success',
        date: new Date().toISOString(),
        metadata,
        timestamp: Date.now()
      };
      const newDepRef = await depositsRef.push(depositData);
      // update user balance and add transaction
      await userRef.update({ balance: newBalance });
      const txRef = userRef.child('transactions').push();
      await txRef.set({
        type: 'deposit',
        amount: amount / 100,
        reference,
        date: new Date().toISOString()
      });

      console.log('Processed deposit for', uid, amount, 'newBalance', newBalance);
      return { statusCode: 200, body: 'Processed' };
    }

    return { statusCode: 200, body: 'Ignored event' };
  }catch(err){
    console.error('verify error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
