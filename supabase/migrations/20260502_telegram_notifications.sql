create table if not exists telegram_links (
  privy_id text primary key,
  telegram_chat_id text not null unique,
  telegram_username text,
  telegram_first_name text,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  privy_id text not null,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telegram_link_codes_code_idx
  on telegram_link_codes (code);

create index if not exists telegram_link_codes_privy_idx
  on telegram_link_codes (privy_id, expires_at);

alter table telegram_links enable row level security;
alter table telegram_link_codes enable row level security;
