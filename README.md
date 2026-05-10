# Truvlo

Truvlo is escrow infrastructure for agentic commerce.

It is a Solana devnet escrow app for AI agents, freelancers, cross-border teams, and internet-native work. Truvlo enables programmable USDC and SOL escrow, scoped agent-assisted payment workflows, proof submission, approval requests, and human-reviewed dispute handling.

## Current Product

- Privy email login with generated embedded Solana wallets and optional advanced wallet import.
- USDC and SOL invoice creation on Solana devnet.
- Public payment links for clients.
- Agent-assisted escrow metadata, proof verification records, scoped agent policies, and devnet agent actions.
- Dashboard views for sent, received, and client-side invoice history.
- Client guest flow for payment, release approval, and disputes.
- Human-reviewed dispute recommendations with signed USDC and SOL on-chain resolution paths.
- Devnet x402 escrow-intent support for agentic payment experiments.
- Manual referral payout accounting based on completed transactions.
- Resend email notifications through Vercel API routes.

## Product Direction

Truvlo focuses on programmable escrow and AI-assisted trust workflows, not fully autonomous settlement or legal arbitration.

The near-term product loop is:

1. A client or approved agent funds escrow.
2. The creator or provider submits proof of work.
3. Truvlo evaluates proof against the agreed criteria.
4. A passing review can recommend release.
5. A failed or contested review opens a dispute.
6. A human/admin remains the final authority for production dispute decisions.

Negotiation can come later as a scoped assistant that drafts milestones and acceptance criteria. It should not autonomously bind users to commercial terms until policy, consent, and audit controls are mature.

## Judge Demo

Use [HACKATHON_JUDGE_TESTING.md](HACKATHON_JUDGE_TESTING.md) for the full Colosseum judge testing workflow.

The shortest product explanation is:

```text
Programmable escrow for AI agents and cross-border internet work.
```

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

Run:

```bash
npm test
npm run build
npm run lint
npm audit --audit-level=high
```

## Operating Notes

- Keep Supabase service role access server-side only.
- Verify Privy JWTs before protected database writes.
- Keep invoice metadata, profile data, referrals, email state, and dispute evidence off-chain.
- Keep fund movement and invoice state on-chain.
- Treat agent recommendations as untrusted input until server-side policy checks and human/admin review approve the next action.
- Keep agent money movement devnet-first, amount-capped, policy-gated, and audit-logged.
- Keep onboarding non-blocking; use progressive setup prompts instead of forcing users away from core pages.
- Do not claim decentralized arbitration, autonomous legal arbitration, automatic referral payouts, or production mainnet agent settlement.
