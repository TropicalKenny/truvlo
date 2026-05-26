# PRD: Autonomous Escrow for Agentic Commerce

## Self-Clarification

1. **Problem/Goal:** Truvlo already proves programmable escrow on Solana devnet for humans and assisted agents, but agents still depend on human-driven UI flows and manual approvals, and external developers do not yet have a clear API platform to embed Truvlo into their own products. The next product goal is to let trusted agents and third-party developers use escrow end to end through policy-bounded APIs, while humans keep clear ownership, limits, auditability, and emergency control.
2. **Core Functionality:** Agents, humans, and developers must be able to create escrow agreements, fund or request funding, submit and verify proof, release or dispute funds, and observe state through APIs, SDKs, UI, webhooks, and logs.
3. **Scope/Boundaries:** Autonomy means operating inside pre-authorized policies, budgets, counterparties, and risk limits. It does not mean autonomous legal arbitration, unrestricted mainnet fund movement, unbounded wallet access, or agents binding humans to unknown commercial terms.
4. **Success Criteria:** A policy-approved agent can complete a low-risk escrow lifecycle on devnet through APIs without browser UI interaction; a developer can integrate the same lifecycle from a sandbox app using documented API keys, SDKs, webhooks, and stable errors; and a human can inspect, pause, override, or revoke that autonomy from the dashboard.
5. **Constraints:** Current app is Cloudflare Pages, React/Vite, Privy, Supabase, Resend, Solana devnet/Anchor, and existing x402/agent-policy experiments. Public developer APIs require auth, rate limits, idempotency, docs, sandbox/devnet examples, observability, and usage limits before broad release. Mainnet and fully autonomous dispute settlement require separate security, legal, wallet, and compliance gates.

## Introduction

Truvlo should become programmable escrow infrastructure for agentic commerce: a system where AI agents and humans can safely exchange work, services, digital assets, or tasks using escrow primitives that are policy-controlled, auditable, and recoverable.

The product must serve three first-class audiences:

- **Agents:** autonomous software actors that need APIs, payment intents, machine-readable terms, proof submission, event callbacks, and policy-scoped authority.
- **Humans:** clients, creators, operators, and admins who need simple workflows, clear risk controls, dashboards, notifications, and final override authority.
- **Developers and platform builders:** teams embedding Truvlo escrow into marketplaces, SaaS products, bots, freelance platforms, agent frameworks, and commerce workflows. They need API keys, SDKs, webhooks, sandbox/devnet examples, documentation, stable errors, usage limits, and production onboarding.

The desired end state is not "agents can do anything." The desired end state is "humans, agents, and external developers can run approved commerce through Truvlo without per-action handholding inside explicit limits."

## Product Goals

- Enable an agent to create, fund, monitor, and settle escrow through machine interfaces without using the browser.
- Enable third-party developers to integrate escrow into their own products through stable APIs, SDKs, webhooks, sandbox environments, and production usage controls.
- Enable humans to define agent permissions, spending limits, counterparties, allowed actions, dispute thresholds, and emergency stops.
- Preserve the current human escrow flow while making every state and action available through durable APIs and event streams.
- Support both SOL and USDC on devnet first, with a security-reviewed path to production mainnet later.
- Make every autonomous action explainable: who/what acted, under which policy, with what evidence, and with what wallet authority.
- Separate human login from autonomous wallet authority: Privy remains the human account anchor, while agents authenticate to Truvlo and act only through policy-bound server-side wallet authority.
- Reform the product experience so humans, developers, and agents each get a clear control surface instead of one dashboard stretched across every use case.
- Move from "AI-assisted trust workflow" to "policy-bounded autonomous escrow" without claiming autonomous legal arbitration.

## Roadmap Overview

### Phase 0: Stabilize the Current Demo Surface

Objective: make the existing Cloudflare/devnet product reliable enough to serve as the base for autonomous workflows.

- Reduce Solana RPC 429 noise and improve fallback behavior.
- Verify Resend email delivery with a real domain or document test-sender limits.
- Keep Cloudflare Pages, Supabase, Privy, and devnet env configuration reproducible without exposing secrets.
- Add demo health checks for auth, profile, invoice creation, payment, withdrawal, dispute, and agent-policy routes.

### Phase 1: Policy and Identity Foundation

Objective: introduce durable identities and permissions for humans, agents, and developer apps.

- Create explicit actor types: human owner, human counterparty, delegated agent, service agent, developer/platform builder, developer app, admin.
- Add agent identities with owner binding, auth credentials, status, spending limits, and revocation state.
- Add developer app identities with project ownership, scoped credentials, allowed environments, usage limits, webhook settings, and revocation state.
- Convert current agent policies into enforceable server-side capability policies.
- Define the wallet authority model: Truvlo agent API credential -> Truvlo server policy -> Privy server wallet or user-delegated signer -> Solana escrow program validation.
- Add dashboard controls for creating, editing, pausing, and revoking agent authority.

### Phase 2: Agent and Developer API with Machine-Readable Escrow Terms

Objective: let agents and third-party developers use escrow through APIs and schemas instead of browser flows.

- Add API endpoints for escrow intent creation, quote/fee preview, invoice creation, proof submission, release request, release approval, dispute creation, and status lookup.
- Define a machine-readable escrow agreement schema with milestones, acceptance criteria, deadlines, proof requirements, release rules, and dispute fallback.
- Extend x402 escrow-intent support so agents can negotiate payment-required workflows.
- Add webhooks or event subscriptions so agents can react to invoice funded, proof requested, release ready, disputed, resolved, and withdrawn events.
- Add developer onboarding: sandbox projects, API credentials, idempotency keys, rate limits, webhook signing, usage logs, SDK examples, and versioned docs.

### Phase 3: Autonomous Milestones and Proof Verification

Objective: let policy-approved agents advance escrow states when objective criteria are satisfied.

- Add milestone escrow support where partial releases can happen against milestone-specific proof.
- Add proof bundles with hashes, metadata, URLs, files, signatures, and reviewer output.
- Build server-side verification records that separate agent claims from trusted policy checks.
- Allow low-risk auto-release when proof, policy, amount, counterparty, timeout, and dispute windows all pass.

### Phase 4: Guarded Autonomous Settlement

Objective: allow end-to-end autonomous settlement inside strict safety envelopes.

- Add policy-bound wallet delegation or transaction sponsorship with amount caps, expiry, and allowed instruction sets.
- Support agent-initiated funding, release, and dispute actions on devnet through Truvlo-controlled server-side signing first.
- Add user-owned wallet delegation later only after explicit opt-in, revoke UX, audit history, and high-risk escalation are reliable.
- Add risk scoring for unusual counterparties, repeated disputes, high-value invoices, suspicious proof, and policy drift.
- Require human approval for actions outside policy, high-risk scores, production mainnet movements, or disputed evidence.

### Phase 5: Production Mainnet Readiness

Objective: graduate from devnet autonomy to a limited, audited mainnet beta.

- Complete external security review of Anchor program, API trust boundaries, wallet delegation, and Supabase RLS.
- Add operational monitoring, incident response, replayable audit logs, and rollback procedures.
- Add legal/compliance positioning that describes Truvlo as escrow infrastructure and workflow tooling, not an autonomous court.
- Launch a capped mainnet beta with conservative limits and human override.

### Cross-Cutting Workstream: UI/UX Reform for Human, Agent, and Developer Commerce

Objective: make autonomous escrow understandable, controllable, and integration-ready across the human app, developer portal, and agent-facing surfaces.

- Clean up the current human escrow flow before adding more autonomous controls: create, fund, proof, release, dispute, withdraw, and history should remain simple without requiring agent concepts.
- Add a policy command center where humans can create agents, set limits, pause/revoke authority, inspect decisions, and see what each agent is allowed to do next.
- Add a developer portal for sandbox projects, API keys, webhook endpoints, request logs, rate-limit status, SDK/docs links, and linked escrow objects.
- Add a unified activity and audit timeline that clearly labels human-created, agent-created, developer-created, policy-denied, disputed, and auto-released events.
- Add agent-readable and human-readable status states for delayed RPC, stale cache, webhook retry, pending proof, policy denial, and devnet-only restrictions.
- Apply the Truvlo design system consistently: dark fintech UI, restrained teal accents, specific financial data, compact controls, mobile/desktop verification, and no hidden or decorative autonomy.
- Treat UI/UX reform as a parallel track in every phase, with browser checks before calling a phase demo-ready.

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

### T-003: Agent and Developer App Identity Model
**Description:** Add persistent agent and developer app identity models bound to a human owner, organization, or developer project.

**Acceptance Criteria:**
- [ ] Schema stores agent id, owner id, display name, auth method, status, created time, last-used time, and revocation time.
- [ ] Schema stores developer app id, developer account/project id, environment, credential status, webhook status, usage tier, created time, last-used time, and revocation time.
- [ ] Agents can be active, paused, revoked, or expired.
- [ ] Developer apps can be active, test-only, paused, revoked, or production-gated.
- [ ] Server-side writes always link autonomous actions to both agent identity and human owner, and API-driven actions to developer app/project identity where applicable.
- [ ] Tests cover revoked and expired agents, revoked API credentials, and production-gated developer apps being denied.

### T-004: Policy-Bounded Agent Permissions
**Description:** Convert current agent policy concepts into enforceable capability policies used by every agent and developer API action.

**Acceptance Criteria:**
- [ ] Policy supports allowed actions, max invoice amount, daily spend, token type, allowed counterparties, allowed developer apps, expiry, and dispute behavior.
- [ ] Policy decisions happen server-side before any database write or blockchain instruction.
- [ ] Denied actions return machine-readable errors with policy rule ids.
- [ ] Tests cover over-limit, expired, wrong-counterparty, disallowed-app, and disallowed-action cases.

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
- [ ] Schema includes parties, agent authority, developer app/client metadata, amount, token, milestones, acceptance criteria, proof requirements, release rule, dispute rule, deadlines, and metadata.
- [ ] Schema validates on server before invoice creation.
- [ ] Existing human invoice creation and developer API-created escrow map cleanly into the schema.
- [ ] Test fixtures include human-created, agent-created, developer-created, milestone, and single-release agreements.

### T-007: Agent and Developer Escrow API
**Description:** Add server-side API endpoints for autonomous and embedded escrow creation and lifecycle actions.

**Acceptance Criteria:**
- [ ] Endpoints support create intent, create invoice, get status, submit proof, request release, approve release, raise dispute, and list events.
- [ ] Every endpoint authenticates the caller as a human session, delegated agent, or registered developer app and checks the correct policy.
- [ ] Responses are JSON-first, versioned, stable, and suitable for non-browser clients.
- [ ] API supports idempotency keys for state-changing requests.
- [ ] Tests cover success, validation failure, idempotent replay, auth failure, rate-limit, and policy-denied paths.

### T-008: Developer Platform Onboarding
**Description:** Give external developers the minimum platform surface needed to build on Truvlo without private coordination.

**Acceptance Criteria:**
- [ ] Developers can create a sandbox project and receive scoped devnet API credentials.
- [ ] Developer dashboard shows API key status, webhook endpoints, recent requests, usage, rate-limit state, and linked escrow objects.
- [ ] API docs include quickstarts for create escrow, fund escrow, submit proof, listen for webhook events, and handle errors.
- [ ] SDK examples exist for a marketplace app, a freelance workflow, and an agent framework integration.
- [ ] No production mainnet credentials are issued until the mainnet beta gate is enabled.

### T-009: Event Stream and Webhooks
**Description:** Add event delivery so agents and humans can react to escrow state changes.

**Acceptance Criteria:**
- [ ] Events exist for created, funded, proof submitted, release requested, release approved, disputed, resolved, withdrawn, failed, and policy denied.
- [ ] Webhook delivery is signed, retried, and observable.
- [ ] Human dashboard and developer dashboard can show event history.
- [ ] Tests verify signature validation and retry state transitions.

### T-010: Proof Bundle System
**Description:** Introduce structured proof bundles for work completion and acceptance checks.

**Acceptance Criteria:**
- [ ] Proof bundle can include text, URLs, file references, hashes, signatures, and verifier output.
- [ ] Proof data is stored off-chain with immutable hashes available for audit.
- [ ] Agent-submitted proof is marked untrusted until server policy checks pass.
- [ ] Tests cover invalid proof type, missing required proof, and duplicate proof submission.

### T-011: Policy-Gated Auto-Release
**Description:** Allow low-risk release without per-action human input when all agreement and policy conditions pass.

**Acceptance Criteria:**
- [ ] Auto-release is available only for policies that explicitly enable it.
- [ ] Auto-release checks amount cap, token, counterparty, proof result, timeout, dispute window, and risk score.
- [ ] High-risk or disputed cases require human/admin review.
- [ ] Tests prove auto-release cannot bypass policy or proof requirements.

### T-012: Dispute Escalation Contract
**Description:** Define how autonomous flows stop and escalate when evidence conflicts or risk is high.

**Acceptance Criteria:**
- [ ] Agent can open a dispute inside policy but cannot autonomously force final legal judgment.
- [ ] Human/admin review is required for contested production disputes.
- [ ] Dispute record includes evidence, agent recommendation, policy decision, and final reviewer decision.
- [ ] Tests cover contested evidence and forced human escalation.

### T-013: Wallet Delegation and Transaction Sponsorship
**Description:** Add safe transaction authority for agent actions.

**Acceptance Criteria:**
- [ ] Devnet supports Truvlo-controlled Privy server wallets for agent actions with amount caps, expiry, idempotency, request expiry, and policy ids.
- [ ] Agent identities authenticate to Truvlo APIs and never receive human Privy access tokens, Privy app secrets, authorization private keys, service role keys, or raw wallet private keys.
- [ ] Allowed instruction set is explicit and enforced by Truvlo policy, Privy wallet policy, and the Solana escrow program.
- [ ] Funds are held by escrow program/PDA-controlled accounts where appropriate, not by a free-spending agent wallet.
- [ ] Agent cannot transfer arbitrary funds or change policy limits.
- [ ] User-owned wallet delegation is disabled until explicit opt-in, revoke UX, audit history, and human override paths exist.
- [ ] Security tests cover replay, duplicate idempotency, wrong signer, expired delegation, policy bypass, arbitrary transfer, and over-limit transaction attempts.

### T-014: Human-First Escrow UX
**Description:** Keep Truvlo useful for humans even as agent autonomy grows.

**Acceptance Criteria:**
- [ ] Human users can still create invoices, pay, submit proof, approve releases, dispute, and withdraw without using agent features.
- [ ] Agent-assisted flows are visible but not forced.
- [ ] Human dashboard explains autonomous actions as event history, not hidden magic.
- [ ] Browser verification covers desktop and mobile.

### T-015: Developer SDK, Agent SDK, and MCP Surface
**Description:** Provide SDKs and optional MCP tooling so developers and external agents can use Truvlo reliably.

**Acceptance Criteria:**
- [ ] SDK wraps auth, project/app selection, policy discovery, escrow creation, status polling, proof submission, idempotency, and webhook verification.
- [ ] MCP tools expose safe operations with schema validation.
- [ ] Docs include minimal examples for a buyer agent, seller agent, service agent, developer marketplace, and developer SaaS workflow.
- [ ] Tests cover SDK request signing and error handling.

### T-016: Observability, Usage, and Audit Trail
**Description:** Make autonomous and developer-embedded escrow behavior inspectable by humans, developers, operators, and agents.

**Acceptance Criteria:**
- [ ] Every autonomous or API-driven action has actor id, developer app id where applicable, owner id, policy id, request id, decision, evidence hash, and transaction signature where applicable.
- [ ] Dashboard, developer portal, and admin views can filter audit events by invoice, agent, app, policy, counterparty, and severity.
- [ ] Developer usage logs include request id, endpoint, status code, rate-limit bucket, idempotency key, and webhook delivery state.
- [ ] Logs never include secrets, private keys, or raw API credentials.
- [ ] Tests cover audit event creation for allow, deny, fail, and override paths.

### T-017: Mainnet Beta Gate
**Description:** Define and enforce the checklist required before any autonomous mainnet settlement.

**Acceptance Criteria:**
- [ ] Mainnet autonomous actions remain disabled until the checklist passes.
- [ ] Checklist includes security review, env hardening, rate-limit plan, wallet authority review, monitoring, incident response, and capped beta limits.
- [ ] UI and API clearly report devnet-only status until mainnet is enabled.
- [ ] Tests prove mainnet actions fail closed when the gate is disabled.

### T-018: UI/UX Reform Track
**Description:** Redesign the Truvlo experience around three first-class surfaces: human escrow workflows, human control of agent authority, and developer/API operations.

**Acceptance Criteria:**
- [ ] Current human escrow flow is mapped into create, fund, proof, release, dispute, withdraw, and history states with no forced agent setup.
- [ ] Human dashboard includes a policy command center for agent creation, limits, pause/revoke, recent decisions, and next allowed actions.
- [ ] Developer portal includes sandbox project setup, API credential status, webhook configuration, recent requests, rate-limit state, usage logs, docs links, and linked escrow records.
- [ ] Unified activity timeline labels actor type, developer app where applicable, policy result, escrow state, evidence/proof state, and transaction/event references.
- [ ] Empty, loading, stale, denied, disputed, webhook retry, devnet-only, and high-risk escalation states are designed before implementation.
- [ ] Mobile and desktop browser checks verify that controls fit, text does not overlap, and primary workflows remain usable.
- [ ] Public UI copy avoids internal implementation language, hidden autonomy claims, and unsupported legal/arbitration promises.

## Functional Requirements

- FR-1: The system must support human and agent actors as first-class identities.
- FR-2: The system must bind every agent to a human owner or organization.
- FR-3: The system must require server-side policy checks before any agent-created escrow, proof, release, dispute, or wallet action.
- FR-4: The system must let humans create, pause, revoke, and inspect agent policies.
- FR-5: The system must expose machine-readable escrow agreement schemas.
- FR-6: The system must expose versioned API endpoints for the full escrow lifecycle.
- FR-7: The system must preserve the existing human UI lifecycle.
- FR-8: The system must record audit events for every autonomous allow, deny, fail, and override decision.
- FR-9: The system must support low-risk auto-release only when explicit policy and agreement conditions pass.
- FR-10: The system must escalate high-risk, disputed, or out-of-policy cases to human/admin review.
- FR-11: The system must support webhook or event-stream delivery for escrow state changes.
- FR-12: The system must prevent agents from moving funds outside delegated authority.
- FR-13: The system must keep service role keys, wallet secrets, webhook secrets, and private API credentials server-side only.
- FR-14: The system must provide devnet-first autonomy and keep mainnet autonomy gated until security and operational readiness checks pass.
- FR-15: The system must provide agent-readable errors with stable codes for policy denial, validation failure, auth failure, rate limit, and chain failure.
- FR-16: The system must support developer accounts/projects/apps with scoped API credentials, sandbox/devnet access, rate limits, and revocation.
- FR-17: The system must provide signed webhooks, idempotency, stable request ids, usage logs, and versioned docs for third-party integrations.
- FR-18: The system must let developers embed Truvlo escrow without gaining access to other users' private data, wallet authority, or platform secrets.
- FR-19: The system must provide separate but connected UI surfaces for human escrow workflows, agent policy control, developer operations, and admin review.
- FR-20: The system must show autonomous and API-driven actions as explicit, filterable history rather than hidden background behavior.
- FR-21: The system must expose clear UI states for stale data, policy denial, webhook retry, dispute escalation, devnet-only operation, and human override requirements.
- FR-22: The system must keep developer and agent concepts optional for ordinary human escrow users.
- FR-23: The system must keep human Privy login separate from agent API authentication and autonomous wallet authority.
- FR-24: The system must execute agent wallet actions only after Truvlo policy, Privy wallet policy, and Solana escrow-program validation all pass.
- FR-25: The system must keep raw signing authority server-side and must never expose Privy app secrets, authorization private keys, human access tokens, service role keys, or private wallet keys to agents or browsers.

## Capability Contract

### Actors

- **Human owner:** creates account, owns policies, delegates to agents, can pause or revoke authority.
- **Human client:** funds escrow, approves release, disputes, or delegates those actions to an agent.
- **Human creator/provider:** creates work offers, submits proof, requests release, disputes non-payment.
- **Developer/platform builder:** embeds Truvlo escrow into an external product, marketplace, bot, or agent workflow using API credentials, SDKs, and webhooks.
- **Delegated agent:** acts for a human owner inside an explicit policy.
- **Service agent:** performs narrow platform work such as verification, notifications, or risk scoring.
- **Admin/operator:** handles disputes, abuse, incidents, and production risk gates.

### Surfaces

- Human dashboard and admin dashboard.
- Developer dashboard and API key management.
- Agent policy command center.
- Unified activity and audit timeline.
- Public payment and invoice links.
- Agent and developer REST API.
- Public API docs and SDK examples.
- x402 escrow-intent flow.
- SDK/MCP tools for agent and developer clients.
- Webhooks/event stream.
- Supabase-backed audit and metadata tables.
- Solana program and transaction layer.

### States and Transitions

- Draft agreement -> policy checked -> invoice created -> funded -> work/proof pending -> proof submitted -> verification pending.
- Verification passed -> release requested -> release approved or auto-release eligible -> released -> withdrawn.
- Verification failed or contested -> disputed -> review pending -> resolved -> withdrawn.
- Policy denied, expired, paused, revoked, rate limited, or chain failed states must be explicit and recoverable.

### Data and Interface Implications

- Add durable agents, agent_policies, developer_accounts, developer_apps, api_credentials, escrow_agreements, escrow_events, proof_bundles, webhook_endpoints, usage_events, and delegated_wallet_authority concepts.
- Keep funds and invoice state on-chain where appropriate; keep metadata, proof, policies, webhooks, and audit logs off-chain.
- Keep agent recommendations separate from trusted server-side decisions.
- Keep API contracts stable enough for non-browser agents and third-party developers to integrate without scraping UI behavior.

## Wallet Authority Model

Privy login is the human account layer, not the agent autonomy layer. Humans use Privy to authenticate, connect or create wallets, and authorize delegation. Agents use Truvlo-issued API credentials and never impersonate browser users.

### Recommended Phase 1 Model: Truvlo-Controlled Agent Wallets

- Human owner logs in with Privy and creates an agent policy in Truvlo.
- Truvlo creates or maps an agent identity and API credential.
- Truvlo provisions a Solana wallet through Privy server-side wallet infrastructure, owned by Truvlo authorization keys or a key quorum and bound to a Privy wallet policy.
- Agent calls Truvlo APIs to request escrow actions; Truvlo validates the request against internal policy, escrow state, counterparty, amount, token, risk score, expiry, and idempotency key.
- Truvlo builds the Solana transaction and sends it to Privy server-side for signing and broadcasting only after policy approval.
- Privy enforces wallet policy and authorization signatures/request expiry; the Solana escrow program enforces escrow state and allowed transitions.
- Truvlo records every attempt as an audit event with actor id, owner id, developer app id where applicable, policy id, request id, decision, transaction reference, and denial reason.

### Later Model: User-Owned Wallets With Delegated Agent Signers

- A human may explicitly add a scoped server/agent signer to a user-owned Privy wallet.
- Delegation must be optional, time-bound, amount-capped, action-scoped, visible in the policy command center, and revocable without deleting audit history.
- High-risk, disputed, mainnet, or out-of-policy actions must require fresh human/admin approval.
- This model should not launch until the Truvlo-controlled agent wallet model, audit trail, revoke UX, and security tests are stable.

### Execution Contract

- Agent API credential authorizes an agent to request an action; it does not authorize money movement by itself.
- Truvlo policy decides whether the requested action is allowed for the human owner or developer app.
- Privy wallet policy and authorization signatures decide whether the wallet may sign the requested transaction.
- The Solana escrow program decides whether the transaction is valid for the escrow state.
- Idempotency keys, request expiry, replay protection, and transaction reference ids are required for all state-changing wallet actions.

## Non-Goals

- No autonomous legal arbitration claim.
- No unrestricted mainnet agent wallet control.
- No production mainnet autonomous settlement before security review and beta gates.
- No hidden fund movement that humans cannot inspect or revoke.
- No storing private keys, service role keys, API keys, or webhook secrets in frontend code or public logs.
- No agents reusing stored human Privy access tokens, browser sessions, or raw wallet credentials.
- No agent direct access to Privy app secrets, authorization private keys, Supabase service role keys, or unrestricted wallet RPC signing.
- No replacing the human escrow flow with agent-only workflows.
- No public API access that bypasses policy checks, rate limits, audit logs, or human ownership controls.
- No unbounded free public API usage before pricing, abuse prevention, and operational limits are defined.
- No guarantee that proof verification equals legal completion of work.

## Technical Considerations

- **Cloudflare Pages Functions:** APIs must fit Cloudflare runtime constraints and avoid Node-only dependencies where possible.
- **Developer API platform:** APIs need versioning, API credential lifecycle, idempotency, stable error codes, request ids, rate limits, webhook signing, SDK compatibility, and backwards-compatibility policy.
- **Supabase:** Use server-side access for privileged writes; evaluate RLS for user-facing data paths before mainnet beta.
- **Privy:** Human auth remains the account anchor. Agent auth must be Truvlo API credentials or signed service identities, with server-side Privy wallet authority behind Truvlo policy checks.
- **Solana RPC:** Add caching, backoff, paid/fallback RPC planning, and read-model strategies before high-volume agent use.
- **Anchor program:** Future milestone and delegation features may require on-chain changes and migration strategy.
- **Wallet authority:** Start with Truvlo-controlled Privy server wallets for agents on devnet. Add user-owned delegated signers only after explicit opt-in, revocation, audit, and escalation UX exists. Delegation must be instruction-scoped, amount-capped, expiring, idempotent, and replay-resistant.
- **Email/webhooks:** Humans need email notifications; agents need signed webhook/event callbacks.
- **Billing and usage:** Developer-facing API usage should be measurable from the start, even if pricing is not launched yet.
- **Product experience:** Human escrow, agent control, developer operations, and admin review should share underlying events while using separate layouts optimized for each audience.
- **Testing:** Prioritize policy-denial, trust-boundary, replay, rate-limit, and fail-closed tests.
- **Compliance/positioning:** Market as programmable escrow and workflow infrastructure, not autonomous law or decentralized arbitration.

## Success Metrics

- A delegated agent completes a devnet escrow lifecycle through API only: create, fund/request funding, submit proof, trigger release path, and observe final status.
- A third-party developer completes the same lifecycle from a sandbox app using documented API credentials, SDK examples, idempotency keys, and signed webhooks.
- Human owner can pause or revoke that agent, and the next agent action fails with a stable policy-denied response.
- A developer can revoke an API credential, and the next API request using it fails with a stable auth error.
- An agent cannot use a human Privy session, Privy app secret, or raw private key to move funds; all money movement passes through Truvlo policy, Privy policy, and Solana escrow-program checks.
- 100 percent of autonomous and developer API lifecycle actions create audit events with actor/app, owner, policy, action, decision, and request id.
- Dashboard shows agent-created, developer-created, and human-created escrow records in a unified history.
- Human escrow tasks remain completable without creating an agent, API key, or developer project.
- Developer portal users can create a sandbox app, configure a webhook, inspect a failed request, and find the right SDK example without private onboarding.
- Mobile and desktop checks pass for the human dashboard, policy command center, developer portal, and unified activity timeline.
- Rate-limited Solana RPC does not break the dashboard or agent status polling when cached data exists.
- No server-only secret names or values appear in public HTML/JS bundles or browser console logs.
- Mainnet autonomous actions fail closed until the mainnet beta gate is explicitly enabled.

## Open Questions

- Which first agent customer should drive the API shape: buyer agent, seller/provider agent, marketplace agent, or internal Truvlo service agent?
- Which first developer customer should drive the platform API shape: marketplace, freelancer platform, SaaS workflow tool, Telegram/Discord bot, or agent framework?
- Should agent auth start with Truvlo API keys, signed wallet messages, OAuth-style client credentials, or signed service identities?
- Should developer auth start with API keys, OAuth client credentials, signed wallet auth, or project-scoped service accounts?
- What threshold should enable user-owned wallet delegation after the Truvlo-controlled agent wallet model works on devnet?
- What API pricing model should be tested first: per escrow, percentage fee, usage tiers, webhook/event volume, or enterprise platform agreements?
- What is the first safe maximum amount for autonomous devnet and future mainnet beta flows?
- Should milestone escrow be implemented on-chain first, or modeled off-chain with existing partial release primitives first?
- What evidence types should be accepted for initial proof verification: URLs, files, GitHub commits, signed delivery receipts, chat transcripts, or API callbacks?
- Which paid/fallback Solana RPC provider should be used before high-frequency agent demos?
- What legal/compliance copy is required before advertising agent-led autonomous settlement?
- Which UI surface should be built first after Phase 0: cleaned human escrow flow, policy command center, developer portal, or unified activity timeline?

## Handoff

This PRD is ready for implementation planning, but not for a single large build. Recommended execution order:

1. Finish Phase 0 reliability and verification.
2. Implement Phase 1 identity/policy enforcement before adding more agent money movement.
3. Build Phase 2 API contracts, developer onboarding, and schemas with tests before UI expansion.
4. Run the UI/UX reform track in parallel: clean human escrow first, then policy command center, developer portal, unified timeline, and mobile/desktop polish.
5. Add autonomous release only after proof, risk, audit, revocation, and inspection paths are reliable.
6. Treat mainnet autonomy as a separate security-gated program.

Next engineering lane: create a capability spec for Phase 1 Agent Identity and Policy Enforcement plus Developer App Identity, then implement it with TDD and trust-boundary tests.
