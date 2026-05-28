# Stripe Dashboard setup (test mode first)

Do this in the [Stripe Dashboard](https://dashboard.stripe.com/test/) before production keys.

## 1. Products

Create **six** recurring products (names are for your reference; prices carry the real amounts):

| Product (internal)        | Public name |
|---------------------------|-------------|
| RankLume — Basic          | **Basic** (per community) |
| RankLume — Plus           | **Plus** (per community) |
| RankLume — Pro            | **Pro** (per community) |
| RankLume — Partner        | **Partner program** (invite-only in the app) |
| RankLume — Page Pack      | **Page Pack** add-on |
| RankLume — Run Pack       | **Run Pack** add-on |

## 2. Tier recurring prices (per community)

Attach **two** recurring prices to each of **Basic**, **Plus**, and **Pro**:

| Tier  | Monthly list (per community) | Yearly list (per community, ~17% off vs 12× monthly) |
|-------|------------------------------|--------------------------------------------------------|
| Basic | $29                          | $290                                                   |
| Plus  | $59                          | $590                                                   |
| Pro   | $99                          | $990                                                   |

**Volume discount (5–20% off the tier line):** for each tier Price below, set **Pricing model → Volume** (not graduated). Checkout and plan changes send **quantity = community count**; Stripe bills every seat at the unit price for the tier reached by total quantity.

Breakpoints and percents are defined in `VOLUME_DISCOUNT_TIERS` in `lib/billing/plan-limits.ts`. Use these **per-unit** amounts (USD) in Stripe — they match the app’s plan builder estimates:

| Total communities (qty) | % off list | Basic ($29 list) | Plus ($59 list) | Pro ($99 list) |
|-------------------------|------------|------------------|-----------------|----------------|
| 1–4 | 0% | $29.00 | $59.00 | $99.00 |
| 5–9 | 5% | $27.55 | $56.05 | $94.05 |
| 10–19 | 10% | $26.10 | $53.10 | $89.10 |
| 20–49 | 15% | $24.65 | $50.15 | $84.15 |
| 50+ | 20% | $23.20 | $47.20 | $79.20 |

In Stripe, create **five volume tiers** per Price with `up_to` = **4, 9, 19, 49**, then **∞** (leave last tier open-ended), and the unit amounts from the row for that product. Repeat for **yearly** Prices using the yearly list units ($290 / $590 / $990) with the same percents (e.g. Basic yearly at 50+ communities → $232.00/seat/yr).

The app shows the same tiers on **Settings → Billing** (`VolumeDiscountsPanel`) and applies estimates via `volumeDiscountedSubtotal` in `lib/billing/plan-limits.ts`. **Stripe remains the source of truth for charges.**

### Create volume prices via API (recommended)

Prices with tiers cannot be edited in place — create **new** Prices and update `.env`.

1. Ensure `.env` has `STRIPE_SECRET_KEY` and your current six tier `STRIPE_PRICE_*` IDs (used only to find each Product).
2. Dry run:
   ```bash
   npm run stripe:setup-volume-prices
   ```
3. Create on Stripe (test mode key first):
   ```bash
   npm run stripe:setup-volume-prices:apply
   ```
   Add `--deactivate-old` to set previous price IDs to `active: false`.
4. Paste the printed `STRIPE_PRICE_*=price_...` lines into `.env` and Vercel.

Tier amounts come from `buildStripeVolumeTierApiRows()` in `lib/billing/stripe-volume-price-payload.ts` (same math as `stripeVolumeTierRows` in `plan-limits.ts`). Page Pack / Run Pack stay **flat** — do not run this script for add-ons.

Attach **one** recurring price to Partner (e.g. placeholder **$20/month**). Yearly optional.

Copy each Price ID (`price_...`) into environment variables (see `.env.example`).

## 3. Add-on recurring prices

**Page Pack** — recurring, **$5/month** per pack per community (yearly: **$50/year** per pack per community, ~17% off 12× monthly). One unit = **+20** new pages per community per month (see `PACK_PRICING` in `lib/billing/plan-limits.ts`).

**Run Pack** — recurring, **$10/month** per pack per community (yearly: **$100/year** per pack per community). One unit = **+10** manual audit-starts per community per month (see `RUNS_PACK_PRICING`).

Checkout sends line item quantity = `packsPerCommunity × communityCount` for each add-on so Stripe bills correctly for every seat.

## 4. Checkout trial (14 days, no card required)

The app creates Checkout with `subscription_data.trial_period_days: 14` and `payment_method_collection: "if_required"`. In Stripe **Settings → Billing → Subscriptions and emails**, ensure trials can start **without** requiring a payment method if that matches your product policy.

During **trialing**, the app enforces **trial caps** (`TRIAL_PLAN_LIMITS`); PDF download stays locked until **active**. The webhook stores `billing_trial_start` / `billing_trial_end` on `subscriptions.plan_limits` for quota windows.

## 5. Customer portal

**Settings → Billing → Customer portal**

- Let customers **cancel** subscriptions and update **payment methods**.
- Open **invoices** / billing history.

**Plan changes (tier, community count, Page Packs)** are applied in the app via **Settings → Billing → Apply changes** on the selected tier card. That calls `stripe.subscriptions.update` on the existing subscription (proration on the next invoice). Do **not** rely on Checkout for upgrades — Checkout is for the first subscription only.

Optionally add all tier and pack Price IDs to the portal product catalog if you want Dashboard-based changes as a backup; the in-app plan builder is the primary path.

Set **Default redirect** / business URL to your production domain when you go live.

## 6. Webhooks

### Production / staging

**Developers → Webhooks → Add endpoint**

- URL: `https://<your-domain>/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Signing secret → `STRIPE_WEBHOOK_SECRET`.

### Local development

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the CLI-printed webhook signing secret as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

## 7. API keys

**Developers → API keys**

- **Publishable** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (if using Stripe.js).
- **Secret** → `STRIPE_SECRET_KEY` (server-only; never commit).

Repeat for **Live mode** with live Price IDs and a live webhook endpoint.

## 8. Partner program

Do **not** expose the Partner price publicly unless intended. In the app, Partner is a **by-invitation** callout; checkout uses `STRIPE_PRICE_PARTNER_MONTHLY` from the environment.

## 9. Env var checklist

See `.env.example` for:

- `STRIPE_PRICE_RESIDENCE_*`, `STRIPE_PRICE_COMMUNITY_*`, `STRIPE_PRICE_PORTFOLIO_*` (tier monthly/yearly)
- `STRIPE_PRICE_PAGES_PACK_MONTHLY` / `YEARLY`
- `STRIPE_PRICE_RUNS_PACK_MONTHLY` / `YEARLY`
- `STRIPE_PRICE_PARTNER_MONTHLY`
