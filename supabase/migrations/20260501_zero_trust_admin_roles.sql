create extension if not exists pgcrypto;

create table if not exists admin_members (
  id uuid primary key default gen_random_uuid(),
  privy_id text,
  wallet_address text not null unique,
  role text not null check (role in ('owner', 'dispute_admin', 'payout_admin', 'support_admin')),
  active boolean not null default true,
  notification_email text,
  dispute_alerts_enabled boolean not null default true,
  webhook_alerts_enabled boolean not null default true,
  created_by_privy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_members enable row level security;

create index if not exists admin_members_active_role_idx
  on admin_members (active, role);

create index if not exists admin_members_privy_idx
  on admin_members (privy_id);

insert into admin_members (
  privy_id,
  wallet_address,
  role,
  active,
  notification_email,
  dispute_alerts_enabled,
  webhook_alerts_enabled
)
select
  w.privy_id,
  'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn',
  'owner',
  true,
  p.notification_email,
  true,
  true
from wallets w
left join profiles p on p.privy_id = w.privy_id
where w.wallet_address = 'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn'
on conflict (wallet_address) do update
set role = 'owner',
    active = true,
    privy_id = coalesce(admin_members.privy_id, excluded.privy_id),
    notification_email = coalesce(admin_members.notification_email, excluded.notification_email),
    updated_at = now();

insert into admin_members (
  wallet_address,
  role,
  active,
  dispute_alerts_enabled,
  webhook_alerts_enabled
)
select
  'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn',
  'owner',
  true,
  true,
  true
where not exists (
  select 1 from admin_members
  where wallet_address = 'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn'
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_privy_id text not null,
  admin_wallet text not null,
  admin_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table admin_audit_log enable row level security;

create index if not exists admin_audit_log_admin_created_idx
  on admin_audit_log (admin_wallet, created_at desc);

create index if not exists admin_audit_log_action_created_idx
  on admin_audit_log (action, created_at desc);
