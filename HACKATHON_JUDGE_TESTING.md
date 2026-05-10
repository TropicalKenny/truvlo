# Truvlo Hackathon Judge Testing Guide

## What Truvlo Demonstrates

Truvlo is escrow infrastructure for agentic commerce on Solana devnet. It provides programmable escrow for AI agents, freelancers, and cross-border internet work: a creator creates an invoice, a client or scoped agent funds escrow, the creator submits proof, and disputed work moves through human-reviewed evidence handling before final resolution.

The agent flow is invoice-scoped. Truvlo Agent can pay a specific invoice and request approval only under the invoice rules. It is not a general wallet controller and it does not require the client to paste a private key.

## Demo Accounts

Prepare three browser sessions:

- Creator account: creates invoices, submits proof, withdraws.
- Client account: pays directly or enables Truvlo Agent.
- Admin account: reviews disputes and signs final resolutions.

Use devnet wallets funded with enough SOL and USDC for the demo.

## Exact Agent-Assisted Workflow

### 1. Creator Creates the Invoice

Creator opens `/create` and fills the invoice fields.

Use:

```text
Amount: 2 USDC
Invoice title: Research delivery demo
Description: Research and summarize Solana digital asset account UX.
```

In the `Agent-assisted escrow` panel:

```text
Agent-assisted escrow: On
Job type: Research task
Verification mode: Agent-assisted
```

Use this success criteria:

```text
Deliver a concise research summary with at least 5 relevant sources, key findings, and a final recommendation. The work is complete when the client can open the submitted link and confirm the summary matches the agreed scope.
```

Click `Create Invoice`, then copy the payment link.

Expected result:

- Invoice is created.
- Payment link opens for the client.
- Invoice carries agent-assisted verification criteria.

### 2. Client Uses Truvlo Agent

Client opens the payment link in another browser or incognito session.

Click:

```text
Use Truvlo Agent
Enable agent and pay escrow
```

Expected language on the page:

```text
invoice-only
verification passes
automatically approve release
```

Explain to judges:

```text
The client delegates this invoice-specific payment and later approval rule to Truvlo Agent. The normal path is a secure Truvlo wallet, not private key import.
```

Expected result:

- Escrow is paid.
- Client payment history includes the invoice.
- The payment history/detail label says `Paid by Truvlo Agent on your behalf`.

### 3. Creator Submits Proof

Creator returns to `/dashboard`.

Expected invoice action after agent payment:

```text
Submit proof
```

Click `Submit proof`.

Inside the proof action, the final button should say:

```text
Request approval
```

Use this proof note:

```text
I completed the research summary. It includes 5 sources, key findings, and a final recommendation as requested.
```

Use this deliverable link:

```text
https://example.com/truvlo-demo-research
```

Click `Request approval`.

Expected result:

- `Submit proof` disappears.
- The invoice moves to `Proof submitted`, `Client approval pending`, `Withdraw to Wallet`, or `Disputed`.

### 4. Dispute Evidence Flow

Use a disputed invoice row.

Expected row labels:

```text
Disputed
Evidence due
Submit evidence
```

Click `Submit evidence`.

Expected route:

```text
/disputes/:invoiceId/:creator/evidence
```

Use this evidence note:

```text
The submitted work does not match the agreed success criteria. The research summary is missing sources and does not include a final recommendation.
```

Use this evidence URL:

```text
https://example.com/truvlo-demo-evidence
```

Negative tests:

- Empty evidence should be rejected.
- `javascript:alert(1)` should be rejected.
- Non-http/https URLs should be rejected.

### 5. Admin Dispute Review

Admin opens `/admin`, then opens the disputes section.

Expected actions:

```text
Generate recommendation
Save decision only
Resolve and move funds
```

Expected copy:

```text
USDC or SOL escrow resolutions
```

Explain to judges:

```text
The recommendation is off-chain decision support. Funds move only when the admin signs the final on-chain resolution.
```

## Wallet Comfort Test

Judges should verify:

- `Create secure Truvlo wallet` is the normal path.
- Private key import is reachable only from `Advanced import`.
- Clients can avoid private key import by using the secure wallet path or Truvlo Agent.

## Refresh UX Test

Open `/dashboard`.

Expected:

- The refresh icon stays static while idle.
- It animates only after a manual refresh click.
- Background data sync does not flash the whole dashboard.

## Exact UI Terms Judges Should Look For

```text
Agent-assisted escrow
Verification mode
Agent-assisted
Success criteria
Use Truvlo Agent
Enable agent and pay escrow
Paid by Truvlo Agent on your behalf
Submit proof
Request approval
Proof submitted
Client approval pending
Withdraw to Wallet
Disputed
Evidence due
Submit evidence
```

## Pre-Demo Verification

Run:

```powershell
npm test
npm run build
npm run lint
npm audit --audit-level=high
```

Expected:

- Tests pass.
- Build passes.
- Audit reports 0 high vulnerabilities.
- Lint may show existing Fast Refresh warnings, but no errors.
