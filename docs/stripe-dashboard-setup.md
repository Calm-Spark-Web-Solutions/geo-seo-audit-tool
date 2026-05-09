# Stripe Dashboard setup (test mode first)

Do this in the [Stripe Dashboard](https://dashboard.stripe.com/test/) before production keys.

## 1. Products

Create four products (names are for your reference; prices carry the real amounts):

| Product              | Public marketing name |
|----------------------|------------------------|
| GEO Audit — Residence | **Residence**          |
| GEO Audit — Community | **Community**          |
| GEO Audit — Portfolio | **Portfolio**          |
| GEO Audit — Partner   | **Partner program** (invite-only in the app) |

## 2. Recurring prices

Attach **two** recurring prices to each of the three public products:

| Tier       | Monthly | Yearly |
|------------|---------|--------|
| Residence  | $79     | $790   |
| Community  | $199    | $1,990 |
| Portfolio  | $449    | $4,490 |

Attach **one** recurring price to Partner (e.g. **$20/month**). Yearly optional.

Copy each Price ID (`price_...`) — you will paste them into environment variables (see `.env.example`).

## 3. Customer portal

**Settings → Billing → Customer portal**

- Let customers cancel subscriptions.
- Let customers switch plans if you enable plan switching (optional).
- Set the **privacy policy** and **terms** links if required.

Set **Default redirect** / business URL to your production domain when you go live.

## 4. Webhooks

### Production / staging

**Developers → Webhooks → Add endpoint**

- URL: `https://<your-domain>/api/stripe/webhook`
- Events to send:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Reveal the **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

### Local development

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the CLI-printed webhook signing secret as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

## 5. API keys

**Developers → API keys**

- **Publishable** → optional `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (only needed for Stripe.js / Elements).
- **Secret** → `STRIPE_SECRET_KEY` (server-only; never commit).

Repeat for **Live mode** when you launch, with live Price IDs and a live webhook endpoint.

## 6. Partner program

Do **not** expose the Partner price on a public marketing site unless you intend to. In this app, Partner appears as a **by-invitation** callout; checkout still uses the same Stripe Price ID from `STRIPE_PRICE_PARTNER_MONTHLY`, configured only in your environment.
