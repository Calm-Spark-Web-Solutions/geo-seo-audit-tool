# App host: `app.ranklume.io`

This repository deploys the **RankLume product application** only.  
The public marketing website lives on **`ranklume.com`** in a separate project.

---

## Production canonical URL

Set in Vercel (Production environment):

```bash
NEXT_PUBLIC_SITE_URL=https://app.ranklume.io
```

Used for:

- Supabase auth redirects and email links  
- Stripe checkout return URLs  
- Audit runner kick URLs  
- Google OAuth callback base (see below)  
- Monthly report links in email (recipients configurable under Integrations → Google)  

**Do not** use `VERCEL_URL` (`*.vercel.app`) as the canonical URL in production.

---

## DNS

| Record | Points to |
|--------|-----------|
| `app.ranklume.io` | Vercel (CNAME to `cname.vercel-dns.com` or Vercel’s current target) |

Add the domain in **Vercel → Project → Settings → Domains**.  
SSL: Cloudflare **Full (strict)** if proxied.

---

## Supabase Auth

**Authentication → URL configuration**

| Setting | Value |
|---------|--------|
| Site URL | `https://app.ranklume.io` |
| Redirect URLs | `https://app.ranklume.io/**` |

Include preview URLs only if you use Supabase on preview deploys.

---

## Google OAuth

```bash
GOOGLE_OAUTH_REDIRECT_URI=https://app.ranklume.io/api/integrations/google/callback
```

Register the same URI in Google Cloud Console → OAuth client → Authorized redirect URIs.

---

## Stripe

- Webhook endpoint: `https://app.ranklume.io/api/stripe/webhook`  
- Checkout success/cancel URLs are built from `NEXT_PUBLIC_SITE_URL` (settings billing tab).

---

## Crawlers / SEO

[`app/robots.ts`](../app/robots.ts) disallows **all** paths on this deploy. The app should not be indexed.

Marketing SEO happens only on `ranklume.com`.

---

## Logged-out entry

[`app/page.tsx`](../app/page.tsx) — minimal sign-in / sign-up screen at `/`.  
Not a full marketing site. Visitors looking for product story should land on `ranklume.com`.

---

## Local development

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Auth and OAuth callbacks use localhost when developing locally.

---

## Related env (already in `.env.example`)

- `RESEND_FROM_EMAIL` — e.g. `Ranklume <contact@ranklume.io>`  
- `ALLOW_AUDITS_WITHOUT_SUBSCRIPTION=0` in production  
- `CRON_SECRET` — required for Vercel cron queue ticks  
