const fetch = global.fetch || require('node-fetch');
const PAYSTACK_INIT_URL = "https://api.paystack.co/transaction/initialize";

exports.handler = async (event, context) => {
  try{
    const body = JSON.parse(event.body);
    const { amount, uid, email } = body;
    if(!amount || !uid) return { statusCode: 400, body: 'Missing amount or uid' };

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET;
    if(!PAYSTACK_SECRET) return { statusCode: 500, body: 'Paystack secret not configured' };

    const metadata = { uid, email };

    const resp = await fetch(PAYSTACK_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount * 100,
        email: email || 'no-email@unknown.com',
        metadata
      })
    });

    const data = await resp.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  }catch(err){
    console.error('init error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
