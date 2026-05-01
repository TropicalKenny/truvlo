create table if not exists x402_escrow_intents (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  creator_wallet text not null,
  payer_wallet text,
  amount numeric(20, 9) not null,
  token_type text not null check (token_type in ('USDC', 'SOL')),
  description text,
  x402_network text not null default 'solana:devnet',
  x402_scheme text not null default 'exact',
  x402_payment_payload text,
  status text not null default 'payment_required'
    check (status in ('payment_required', 'payment_submitted', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, creator_wallet)
);

create index if not exists x402_escrow_intents_invoice_idx
  on x402_escrow_intents (invoice_id, creator_wallet);

alter table x402_escrow_intents enable row level security;

create table if not exists devnet_agent_actions (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  creator_wallet text not null,
  agent_wallet text not null,
  action text not null check (action in ('pay_invoice', 'request_release', 'approve_release', 'raise_dispute')),
  amount numeric(20, 9),
  token_type text check (token_type in ('USDC', 'SOL')),
  signature text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists devnet_agent_actions_invoice_idx
  on devnet_agent_actions (invoice_id, creator_wallet, created_at);

alter table devnet_agent_actions enable row level security;
