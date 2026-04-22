-- Migration: enforce one pending payout request per user per token type
-- This index is the race-safe backend for the existence check in api/payout-requests.ts.
-- Without it, two concurrent POST requests can both pass the check and both insert.
-- Apply via: supabase db push  OR  run in the Supabase SQL editor.

CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_one_pending_per_user
  ON payout_requests (privy_id, token_type)
  WHERE (status = 'pending');

-- Also required for disputes.ts fix #3 (insert instead of upsert on dispute_cases):
-- Confirm this unique constraint already exists; if not, add it.
-- The upsert was relying on it implicitly — make it explicit.
ALTER TABLE dispute_cases
  ADD CONSTRAINT IF NOT EXISTS dispute_cases_invoice_id_key UNIQUE (invoice_id);
