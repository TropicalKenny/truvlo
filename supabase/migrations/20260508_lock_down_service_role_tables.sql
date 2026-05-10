-- Make service-role-only tables explicit and remove public access to the
-- SECURITY DEFINER helper flagged by Supabase advisors.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

do $$
declare
  target_table text;
  service_role_tables text[] := array[
    'admin_audit_log',
    'admin_members',
    'agent_policies',
    'agent_verifications',
    'devnet_agent_actions',
    'dispute_cases',
    'dispute_evidence',
    'invoice_meta',
    'payout_requests',
    'profile_wallets',
    'profiles',
    'referral_rewards',
    'telegram_link_codes',
    'telegram_links',
    'wallets',
    'x402_escrow_intents'
  ];
begin
  foreach target_table in array service_role_tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = target_table
    ) and not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'direct_client_access_disabled'
    ) then
      execute format(
        'create policy direct_client_access_disabled on public.%I for all to anon, authenticated using (false) with check (false)',
        target_table
      );
    end if;

    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = target_table
    ) then
      execute format(
        'comment on table public.%I is %L',
        target_table,
        'Truvlo service-role-only table. Browser clients must use authenticated Vercel API routes instead of direct Supabase access.'
      );
    end if;
  end loop;
end $$;
