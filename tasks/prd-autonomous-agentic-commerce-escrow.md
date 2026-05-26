# PRD: Autonomous Escrow for Agentic Commerce

## Self-Clarification

1. **Problem/Goal:** Truvlo already proves programmable escrow on Solana devnet for humans and assisted agents, but agents still depend on human-driven UI flows and manual approvals. The next product goal is to let trusted agents use escrow end to end without per-transaction human input, while humans keep clear ownership, limits, auditability, and emergency control.
2. **Core Functionality:** Agents and humans must be able to create escrow agreements, fund or request funding, submit and verify proof, release or dispute funds, and observe state through APIs, UI, webhooks, and logs.
3. **Scope/Boundaries:** Autonomy means operating inside pre-authorized policies, budgets, counterparties, and risk limits. It does not mean autonomous legal arbitration, unrestricted mainnet fund movement, unbounded wallet access, or agents binding humans to unknown commercial terms.
4. **Success Criteria:** A policy-approved agent can complete a low-risk escrow lifecycle on devnet through APIs without browser UI interaction, and a human can inspect, pause, override, or revoke that autonomy from the dashboard.
5. **Constraints:** Current app is Cloudflare Pages, React/Vite, Privy, Supabase, Resend, Solana devnet/Anchor, and existing x402/agent-policy experiments. Mainnet and fully autonomous dispute settlement require separate security, legal, wallet, and compliance gates.

## Introduction

Truvlo should become programmable escrow infrastructure for agentic commerce: a system where AI agents and humans can safely exchange work, services, digital assets, or tasks using escrow primitives that are policy-controlled, auditable, and recoverable.

The product must serve two first-class audiences:

- **Agents:** autonomous software actors that need APIs, payment intents, machine-readable terms, proof submission, event callbacks, and policy-scoped authority.
- **Humans:** clients, creators, operators, and admins who need simple workflows, clear risk controls, dashboards, notifications, and final override authority.

The desired end state is not "agents can do anything." The desired end state is "agents can do approved commerce without human input inside explicit limits."

## Product Goals

- Enable an agent to create, fund, monitor, and settle escrow through machine interfaces without using the browser.
- Enable humans to define agent permissions, spending limits, counterparties, allowed actions, dispute thresholds, and emergency stops.
- Preserve the current human escrow flow while making every state and action available through durable APIs and event streams.
- Support both SOL and USDC on devnet first, with a security-reviewed path to production mainnet later.
- Make every autonomous action explainable: who/what acted, under which policy, with what evidence, and with what wallet authority.
- Move from "AI-assisted trust workflow" to "policy-bounded autonomous escrow" without claiming autonomous legal arbitration.

## Roadmap Overview

### Phase 0: Stabilize the Current Demo Surface

Objective: make the existing Cloudflare/devnet product reliable enough to serve as the base for autonomous workflows.

- Reduce Solana RPC 429 noise and improve fallback behavior.
- Verify Resend email delivery with a real domain or document test-sender limits.
- Keep Cloudflare Pages, Supabase, Privy, and devnet env configuration reproducible without exposing secrets.
- Add demo health checks for auth, profile, invoice creation, payment, withdrawal, dispute, and agent-policy routes.

### Phase 1: Policy and Identity Foundation

Objective: introduce durable identities and permissions for both humans and agents.

- Create explicit actor types: human owner, human counterparty, delegated agent, service agent, admin.
- Add agent identities with owner binding, auth credentials, status, spending limits, and revocation state.
- Convert current agent policies into enforceable server-side capability policies.
- Add dashboard controls for creating, editing, pausing, and revoking agent authority.

### Phase 2: Agent API and Machine-Readable Escrow Terms

Objective: let agents use escrow through APIs and schemas instead of browser flows.

- Add API endpoints for escrow intent creation, quote/fee preview, invoice creation, proof submission, release request, release approval, dispute creation, and status lookup.
- Define a machine-readable escrow agreement schema with milestones, acceptance criteria, deadlines, proof requirements, release rules, and dispute fallback.
- Extend x402 escrow-intent support so agents can negotiate payment-required workflows.
- Add webhooks or event subscriptions so agents can react to invoice funded, proof requested, release ready, disputed, resolved, and withdrawn events.

### Phase 3: Autonomous Milestones and Proof Verification

Objective: let policy-approved agents advance escrow states when objective criteria are satisfied.

- Add milestone escrow support where partial releases can happen against milestone-specific proof.
- Add proof bundles with hashes, metadata, URLs, files, signatures, and reviewer output.
- Build server-side verification records that separate agent claims from trusted policy checks.
- Allow low-risk auto-release when proof, policy, amount, counterparty, timeout, and dispute windows all pass.

### Phase 4: Guarded Autonomous Settlement

Objective: allow end-to-end autonomous settlement inside strict safety envelopes.

- Add policy-bound wallet delegation or transaction sponsorship with amount caps, expiry, and allowed instruction sets.
- Support agent-initiated funding, release, and dispute actions on devnet.
- Add risk scoring for unusual counterparties, repeated disputes, high-value invoices, suspicious proof, and policy drift.
- Require human approval for actions outside policy, high-risk scores, production mainnet movements, or disputed evidence.

### Phase 5: Production Mainnet Readiness

Objective: graduate from devnet autonomy to a limited, audited mainnet beta.

- Complete external security review of Anchor program, API trust boundaries, wallet delegation, and Supabase RLS.
- Add operational monitoring, incident response, replayable audit logs, and rollback procedures.
- Add legal/compliance positioning that describes Truvlo as escrow infrastructure and workflow tooling, not an autonomous court.
- Launch a capped mainnet beta with conservative limits and human override.

## Tasks

### T-001: Demo Health and Resource Baseline
**Description:** Add a lightweight verification script that checks production routes, authenticated API readiness where possible, Solana RPC status, and current demo blockers.

**Acceptance Criteria:**
- [ ] Script checks /, /create, /dashboard, /api/sol-price, /api/agent-policies, and /api/profile behavior without printing secrets.
- [ ] Script records whether Solana RPC is healthy, rate limited, or unavailable.
- [ ] Script exits non-zero only for real blockers, not expected unauthenticated 401/400 responses.
- [ ] Quality checks pass.

### T-002: Stable RPC and Read Model Layer
**Description:** Move dashboard and API reads toward a rate-limited read model so user and agent flows do not spam public devnet RPC.

**Acceptance Criteria:**
- [ ] Invoice list reads use cache, backoff, and explicit force refresh only after state-changing actions.
- [ ] Agent API status lookups do not trigger duplicate program-account scans for the same actor/request.
- [ ] UI shows stale-but-safe data when RPC is temporarily rate limited.
- [ ] Test covers 429 backoff and cache reuse.

### T-003: Agent Identity Model
**Description:** Add a persistent agent identity model bound to a human owner or organization.

**Acceptance Criteria:**
- [ ] Schema stores agent id, owner id, display name, auth method, status, created time, last-used time, and revocation time.
- [ ] Agents can be active, paused, revoked, or expired.
- [ ] Server-side writes always link autonomous actions to both agent identity and human owner.
- [ ] Tests cover revoked and expired agents being denied.

### T-004: Policy-Bounded Agent Permissions
**Description:** Convert current agent policy concepts into enforceable capability policies used by every agent action.

**Acceptance Criteria:**
- [ ] Policy supports allowed actions, max invoice amount, daily spend, token type, allowed counterparties, expiry, and dispute behavior.
- [ ] Policy decisions happen server-side before any database write or blockchain instruction.
- [ ] Denied actions return machine-readable errors with policy rule ids.
- [ ] Tests cover over-limit, expired, wrong-counterparty, and disallowed-action cases.

### T-005: Human Policy Control Dashboard
**Description:** Give humans a dashboard to create, pause, revoke, and inspect agent authority.

**Acceptance Criteria:**
- [ ] Humans can view all agents linked to their account.
- [ ] Humans can set limits using form controls with clear units and token types.
- [ ] Humans can pause or revoke an agent without deleting audit history.
- [ ] UI includes mobile and desktop browser verification.

### T-006: Machine-Readable Escrow Agreement Schema
**Description:** Define a durable escrow agreement schema for agents and humans.

**Acceptance Criteria:**
- [ ] Schema includes parties, agent authority, amount, token, milestones, acceptance criteria, proof requirements, release rule, dispute rule, deadlines, and metadata.
- [ ] Schema validates on server before invoice creation.
- [ ] Existing human invoice creation maps cleanly into the schema.
- [ ] Test fixtures include human-created, agent-created, milestone, and single-release agreements.

### T-007: Agent Escrow API
**Description:** Add server-side API endpoints for autonomous escrow creation and lifecycle actions.

**Acceptance Criteria:**
- [ ] Endpoints support create intent, create invoice, get status, submit proof, request release, approve release, raise dispute, and list events.
- [ ] Every endpoint authenticates agent identity and checks policy.
- [ ] Responses are JSON-first, stable, and suitable for non-browser clients.
- [ ] Tests cover success and policy-denied paths.

### T-008: Event Stream and Webhooks
**Description:** Add event delivery so agents and humans can react to escrow state changes.

**Acceptance Criteria:**
- [ ] Events exist for created, funded, proof submitted, release requested, release approved, disputed, resolved, withdrawn, failed, and policy denied.
- [ ] Webhook delivery is signed, retried, and observable.
- [ ] Human dashboard can show event history.
- [ ] Tests verify signature validation and retry state transitions.

### T-009: Proof Bundle System
**Description:** Introduce structured proof bundles for work completion and acceptance checks.

**Acceptance Criteria:**
- [ ] Proof bundle can include text, URLs, file references, hashes, signatures, and verifier output.
- [ ] Proof data is stored off-chain with immutable hashes available for audit.
- [ ] Agent-submitted proof is marked untrusted until server policy checks pass.
- [ ] Tests cover invalid proof type, missing required proof, and duplicate proof submission.

### T-010: Policy-Gated Auto-Release
**Description:** Allow low-risk release without per-action human input when all agreement and policy conditions pass.

**Acceptance Criteria:**
- [ ] Auto-release is available only for policies that explicitly enable it.
- [ ] Auto-release checks amount cap, token, counterparty, proof result, timeout, dispute window, and risk score.
- [ ] High-risk or disputed cases require human/admin review.
- [ ] Tests prove auto-release cannot bypass policy or proof requirements.

### T-011: Dispute Escalation Contract
**Description:** Define how autonomous flows stop and escalate when evidence conflicts or risk is high.

**Acceptance Criteria:**
- [ ] Agent can open a dispute inside policy but cannot autonomously force final legal judgment.
- [ ] Human/admin review is required for contested production disputes.
- [ ] Dispute record includes evidence, agent recommendation, policy decision, and final reviewer decision.
- [ ] Tests cover contested evidence and forced human escalation.

### T-012: Wallet Delegation and Transaction Sponsorship
**Description:** Add safe transaction authority for agent actions.

**Acceptance Criteria:**
- [ ] Devnet supports sponsored or delegated transactions with amount caps and expiry.
- [ ] Allowed instruction set is explicit and enforced.
- [ ] Agent cannot transfer arbitrary funds or change policy limits.
- [ ] Security tests cover replay, wrong signer, expired delegation, and over-limit transaction attempts.

### T-013: Human-First Escrow UX
**Description:** Keep Truvlo useful for humans even as agent autonomy grows.

**Acceptance Criteria:**
- [ ] Human users can still create invoices, pay, submit proof, approve releases, dispute, and withdraw without using agent features.
- [ ] Agent-assisted flows are visible but not forced.
- [ ] Human dashboard explains autonomous actions as event history, not hidden magic.
- [ ] Browser verification covers desktop and mobile.

### T-014: Agent SDK and MCP Surface
**Description:** Provide an agent-friendly SDK and optional MCP server so external agents can use Truvlo reliably.

**Acceptance Criteria:**
- [ ] SDK wraps auth, policy discovery, escrow creation, status polling, proof submission, and webhook verification.
- [ ] MCP tools expose safe operations with schema validation.
- [ ] Docs include minimal examples for a buyer agent, seller agent, and service agent.
- [ ] Tests cover SDK request signing and error handling.

### T-015: Observability and Audit Trail
**Description:** Make autonomous escrow behavior inspectable by humans, operators, and agents.

**Acceptance Criteria:**
- [ ] Every autonomous action has actor id, owner id, policy id, request id, decision, evidence hash, and transaction signature where applicable.
- [ ] Dashboard and admin views can filter audit events by invoice, agent, policy, counterparty, and severity.
- [ ] Logs never include secrets, private keys, or raw API credentials.
- [ ] Tests cover audit event creation for allow, deny, fail, and override paths.

### T-016: Mainnet Beta Gate
**Description:** Define and enforce the checklist required before any autonomous mainnet settlement.

**Acceptance Criteria:**
- [ ] Mainnet autonomous actions remain disabled until the checklist passes.
- [ ] Checklist includes security review, env hardening, rate-limit plan, wallet authority review, monitoring, incident response, and capped beta limits.
- [ ] UI and API clearly report devnet-only status until mainnet is enabled.
- [ ] Tests prove mainnet actions fail closed when the gate is disabled.

## Functional Requirements

- FR-1: The system must support human and agent actors as first-class identities.
- FR-2: The system must bind every agent to a human owner or organization.
- FR-3: The system must require server-side policy checks before any agent-created escrow, proof, release, dispute, or wallet action.
- FR-4: The system must let humans create, pause, revoke, and inspect agent policies.
- FR-5: The system must expose machine-readable escrow agreement schemas.
- FR-6: The system must expose API endpoints for the full escrow lifecycle.
- FR-7: The system must preserve the existing human UI lifecycle.
- FR-8: The system must record audit events for every autonomous allow, deny, fail, and override decision.
- FR-9: The system must support low-risk auto-release only when explicit policy and agreement conditions pass.
- FR-10: The system must escalate high-risk, disputed, or out-of-policy cases to human/admin review.
- FR-11: The system must support webhook or event-stream delivery for escrow state changes.
- FR-12: The system must prevent agents from moving funds outside delegated authority.
- FR-13: The system must keep service role keys, wallet secrets, webhook secrets, and private API credentials server-side only.
- FR-14: The system must provide devnet-first autonomy and keep mainnet autonomy gated until security and operational readiness checks pass.
- FR-15: The system must provide agent-readable errors with stable codes for policy denial, validation failure, auth failure, rate limit, and chain failure.

## Capability Contract

### Actors

- **Human owner:** creates account, owns policies, delegates to agents, can pause or revoke authority.
- **Human client:** funds escrow, approves release, disputes, or delegates those actions to an agent.
- **Human creator/provider:** creates work offers, submits proof, requests release, disputes non-payment.
- **Delegated agent:** acts for a human owner inside an explicit policy.
- **Service agent:** performs narrow platform work such as verification, notifications, or risk scoring.
- **Admin/operator:** handles disputes, abuse, incidents, and production risk gates.

### Surfaces

- Human dashboard and admin dashboard.
- Public payment and invoice links.
- Agent REST API.
- x402 escrow-intent flow.
- SDK/MCP tools for agent clients.
- Webhooks/event stream.
- Supabase-backed audit and metadata tables.
- Solana program and transaction layer.

### States and Transitions

- Draft agreement -> policy checked -> invoice created -> funded -> work/proof pending -> proof submitted -> verification pending.
- Verification passed -> release requested -> release approved or auto-release eligible -> released -> withdrawn.
- Verification failed or contested -> disputed -> review pending -> resolved -> withdrawn.
- Policy denied, expired, paused, revoked, rate limited, or chain failed states must be explicit and recoverable.

### Data and Interface Implications

- Add durable agents, agent_policies, escrow_agreements, escrow_events, proof_bundles, webhook_endpoints, and delegated_wallet_authority concepts.
- Keep funds and invoice state on-chain where appropriate; keep metadata, proof, policies, webhooks, and audit logs off-chain.
- Keep agent recommendations separate from trusted server-side decisions.
- Keep API contracts stable enough for non-browser agents to integrate without scraping UI behavior.

## Non-Goals

- No autonomous legal arbitration claim.
- No unrestricted mainnet agent wallet control.
- No production mainnet autonomous settlement before security review and beta gates.
- No hidden fund movement that humans cannot inspect or revoke.
- No storing private keys, service role keys, API keys, or webhook secrets in frontend code or public logs.
- No replacing the human escrow flow with agent-only workflows.
- No guarantee that proof verification equals legal completion of work.

## Technical Considerations

- **Cloudflare Pages Functions:** APIs must fit Cloudflare runtime constraints and avoid Node-only dependencies where possible.
- **Supabase:** Use server-side access for privileged writes; evaluate RLS for user-facing data paths before mainnet beta.
- **Privy:** Human auth remains the account anchor; agent auth should not depend on browser-only login.
- **Solana RPC:** Add caching, backoff, paid/fallback RPC planning, and read-model strategies before high-volume agent use.
- **Anchor program:** Future milestone and delegation features may require on-chain changes and migration strategy.
- **Wallet authority:** Delegation must be instruction-scoped, amount-capped, expiring, and replay-resistant.
- **Email/webhooks:** Humans need email notifications; agents need signed webhook/event callbacks.
- **Testing:** Prioritize policy-denial, trust-boundary, replay, rate-limit, and fail-closed tests.
- **Compliance/positioning:** Market as programmable escrow and workflow infrastructure, not autonomous law or decentralized arbitration.

## Success Metrics

- A delegated agent completes a devnet escrow lifecycle through API only: create, fund/request funding, submit proof, trigger release path, and observe final status.
- Human owner can pause or revoke that agent, and the next agent action fails with a stable policy-denied response.
- 100 percent of autonomous lifecycle actions create audit events with actor, owner, policy, action, decision, and request id.
- Dashboard shows agent-created and human-created escrow records in a unified history.
- Rate-limited Solana RPC does not break the dashboard or agent status polling when cached data exists.
- No server-only secret names or values appear in public HTML/JS bundles or browser console logs.
- Mainnet autonomous actions fail closed until the mainnet beta gate is explicitly enabled.

## Open Questions

- Which first agent customer should drive the API shape: buyer agent, seller/provider agent, marketplace agent, or internal Truvlo service agent?
- Should agent auth start with API keys, signed wallet messages, OAuth-style client credentials, or Privy-linked service identities?
- What is the first safe maximum amount for autonomous devnet and future mainnet beta flows?
- Should milestone escrow be implemented on-chain first, or modeled off-chain with existing partial release primitives first?
- What evidence types should be accepted for initial proof verification: URLs, files, GitHub commits, signed delivery receipts, chat transcripts, or API callbacks?
- Which paid/fallback Solana RPC provider should be used before high-frequency agent demos?
- What legal/compliance copy is required before advertising agent-led autonomous settlement?

## Handoff

This PRD is ready for implementation planning, but not for a single large build. Recommended execution order:

1. Finish Phase 0 reliability and verification.
2. Implement Phase 1 identity/policy enforcement before adding more agent money movement.
3. Build Phase 2 API contracts and schemas with tests before UI expansion.
4. Add autonomous release only after proof, risk, audit, and revocation paths are reliable.
5. Treat mainnet autonomy as a separate security-gated program.

Next engineering lane: create a capability spec for Phase 1 Agent Identity and Policy Enforcement, then implement it with TDD and trust-boundary tests.
