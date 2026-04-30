# Truvlo

Truvlo is a Solana devnet escrow invoicing app for creators, freelancers, agencies, and clients. Creators send invoices in USDC or SOL, clients pay into on-chain escrow, and funds are released after approval, schedule, timeout, or dispute resolution.

## Current Product

- Creator onboarding with display name, notification email, and wallet setup.
- Privy email login with automatically generated embedded Solana wallets and optional imported wallets.
- USDC and SOL invoice creation.
- Public invoice payment links for clients.
- Client guest flow for payment, release approval, and disputes without creator onboarding.
- Dashboard tabs for sent, received, and client-side invoices.
- Creator names on client invoice cards when metadata exists, with wallet fallback.
- Manual referral payout accounting based on completed transactions.
- Resend email notifications through Vercel API routes.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, React Router.
- Styling: Tailwind CSS and shadcn/ui.
- Auth and wallets: Privy.
- Blockchain: Solana devnet, Anchor, `@coral-xyz/anchor`.
- Database: Supabase Postgres.
- Email: Resend through Vercel serverless API routes.
- Hosting: Vercel.

## Local Development

```bash
npm install
npm run dev
```

For Vercel API routes locally:

```bash
npm run dev:full
```

Production build:

```bash
npm run build
```

## Environment Variables

Required for full app behavior:

```env
VITE_PRIVY_APP_ID=
PRIVY_APP_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
FROM_EMAIL=
APP_ORIGIN=
```

While Truvlo does not have a verified sending domain, `FROM_EMAIL` can use Resend's test sender. In that mode, email delivery is limited by Resend, and the app falls back to asking creators to copy and send the secure invoice link manually.

## Verification

Run the source tests:

```bash
Get-ChildItem tests -Filter *.mjs | ForEach-Object { node $_.FullName }
```

Then run:

```bash
npm run build
```

## Operating Notes

- Keep Supabase service role access server-side only.
- Verify Privy JWTs before any protected database write.
- Keep invoice metadata, profile data, referrals, email state, and dispute evidence off-chain.
- Keep fund movement and invoice state on-chain.
- Do not use memcmp filters for client invoice fetches; use full program fetch plus client-side filtering.
- Use BigInt/string-safe amount conversion for SOL and USDC precision.
- Public messaging must not claim decentralized arbitration or instant on-chain referral payouts.

## Next Phase

The current implementation has passing source tests and a successful production build. The next step is manual QA on devnet/live deployment. After that, Phase 2 is the visual rebrand and polish pass across the landing page and app surfaces, without changing working functionality.
