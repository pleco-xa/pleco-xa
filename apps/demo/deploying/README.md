# Stripe Checkout Backend

This folder contains a minimal Stripe Checkout API used for premium features.
It exposes two endpoints:

- `POST /create-session` handled by `createSession.js`
- `GET /success` handled by `success.js`

The `server.js` file wires these handlers into a small Express app. Configure
the following environment variables before deployment:

- `STRIPE_SECRET_KEY` – your Stripe secret key
- `STRIPE_PRICE_ID` – price identifier for the product
- `BASE_URL` – base URL of your deployed site

To run locally:

```bash
npm ci
node deploying/railway-api/server.js
```

Railway or other serverless providers can use the included `.nixpacks.toml` to
install Node 20 and execute the server with `npm start`.
