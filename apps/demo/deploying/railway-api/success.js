import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function success(req, res) {
  try {
    const sessionId = req.query.session_id;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      res.send('Payment verified');
    } else {
      res.status(400).send('Payment not complete');
    }
  } catch (err) {
    console.error('Error verifying Stripe session:', err);
    res.status(500).send('Unable to verify session');
  }
}
