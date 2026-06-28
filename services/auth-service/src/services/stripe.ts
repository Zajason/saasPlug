import Stripe from 'stripe';

// Lazy initialization to allow server startup without Stripe key
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(secretKey);
  }
  return _stripe;
}

// Proxy that lazily initializes Stripe on first use
const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
});

export default stripe;
