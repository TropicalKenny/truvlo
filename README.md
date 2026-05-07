# Truvlo

Truvlo is escrow infra for agentic commerce.

It is a Solana devnet escrow invoicing app for creators, freelancers, agencies, clients, and agent-mediated work. Creators send invoices in USDC or SOL, clients or approved agents pay into on-chain escrow, and funds are released after approval, schedule, timeout, or dispute resolution.

## Current Product

- Optional creator setup with display name, notification email, and wallet setup.
- Privy email login with automatically generated embedded Solana wallets and optional imported wallets.
- USDC and SOL invoice creation.
- Public invoice payment links for clients.
- Client guest flow for payment, release approval, and disputes without creator onboarding.
- Dashboard tabs for sent, received, and client-side invoices.
- Creator names on client invoice cards when metadata exists, with wallet fallback.
- Agent-assisted escrow metadata, proof verification records, scoped agent policies, and devnet agent actions.
- Admin-reviewed dispute recommendations with signed USDC and SOL on-chain resolution paths.
- Devnet x402 escrow-intent support for agentic payment experiments.
- Manual referral payout accounting based on completed transactions.
- Resend email notifications through Vercel API routes.

## Agentic Commerce Direction

Truvlo should focus first on agent-assisted dispute resolution and evidence evaluation, not autonomous negotiation.

The near-term product loop is:

1. A client or approved agent funds escrow.
2. The creator or provider submits proof of work.
3. Truvlo evaluates proof against the agreed criteria.
4. A passing review can recommend release.
5. A failed or contested review opens a dispute.
6. The dispute agent proposes a resolution, but a human/admin remains the final production authority.

Negotiation can come later as a scoped assistant that drafts milestones and acceptance criteria. It should not autonomously bind users to commercial terms until policy, consent, and audit controls are mature.

See [docs/AGENTIC_COMMERCE_STRATEGY.md](docs/AGENTIC_COMMERCE_STRATEGY.md) for the research-backed strategy, Colosseum Copilot review, implementation path, and copy guardrails.
See [docs/ONBOARDING_STRATEGY.md](docs/ONBOARDING_STRATEGY.md) for the non-blocking onboarding decision and future setup prompt rules.
See [docs/COMPLETION_AUDIT.md](docs/COMPLETION_AUDIT.md) for the current completion checklist and remaining launch blockers.
See [docs/DEVNET_DISPUTE_QA_CHECKLIST.md](docs/DEVNET_DISPUTE_QA_CHECKLIST.md) for the required USDC and SOL dispute QA pass.

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

For admin or dispute QA, run both local servers. Keep Vercel API routes on `http://127.0.0.1:3000`:

```bash
npm run dev:full -- --listen 127.0.0.1:3000
```

Then run the Vite frontend on `http://127.0.0.1:5173`:

```bash
npm run dev
```

Vite proxies `/api/*` to the Vercel server so Supabase-backed admin and dispute routes work without loading Vite development modules through Vercel.

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
- Treat agent recommendations as untrusted input until server-side policy checks and human/admin review approve the next action.
- Keep agent money movement devnet-first, amount-capped, policy-gated, and audit-logged.
- Keep onboarding non-blocking; use progressive setup prompts instead of forcing users away from core pages.
- Do not use memcmp filters for client invoice fetches; use full program fetch plus client-side filtering.
- Use BigInt/string-safe amount conversion for SOL and USDC precision.
- Public messaging must not claim decentralized arbitration or instant on-chain referral payouts.
- Public messaging must not claim autonomous legal arbitration or production mainnet agent settlement.

## Next Phase

The current implementation has passing source tests and a successful production build. The next step is manual QA on devnet/live deployment.

The agentic commerce next phase is deeper manual QA and deployment hardening for the admin-reviewed dispute flow: collect invoice terms, proof, and evidence; produce a recommended creator/client/split outcome; store the recommendation off-chain; record the reviewed decision; then resolve USDC or SOL escrow from the platform treasury signer.
