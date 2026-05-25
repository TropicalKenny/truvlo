-- Migration: enforce one pending payout request per user per token type
-- This index is the race-safe backend for the existence check in api/payout-requests.ts.
-- Without it, two concurrent POST requests can both pass the check and both insert.
-- Apply via: supabase db push  OR  run in the Supabase SQL editor.

CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_one_pending_per_user
  ON payout_requests (privy_id, token_type)
  WHERE (status = 'pending');

-- Disputes are scoped by invoice and creator wallet. Do not restore the older
-- invoice-only unique key, because the agent-commerce hardening migration
-- intentionally replaced it with this composite uniqueness rule.
CREATE UNIQUE INDEX IF NOT EXISTS dispute_cases_invoice_creator_key
  ON dispute_cases (invoice_id, creator_wallet);
