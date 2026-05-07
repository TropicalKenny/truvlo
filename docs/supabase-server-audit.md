# Supabase Server Audit

Date: 2026-05-07

## Scope

This pass is audit-only. Truvlo currently uses Vercel API routes with shared `@supabase/supabase-js` helpers and Privy bearer-token verification. No `@supabase/server` package was installed and no Supabase Edge Function migration was attempted.

References reviewed:

- https://supabase.com/blog/introducing-supabase-server
- https://supabase.github.io/server/

## Current Shape

- Server routes live under `api/` and keep privileged Supabase access server-side.
- Auth is request-scoped through Privy access tokens before wallet-owned records are read or mutated.
- Admin operations use the service-role key from server environment variables, not client code.
- The frontend calls Vercel routes for invoice metadata, disputes, agent policies, notifications, and admin review workflows.

## Audit Against `@supabase/server` Guidance

- Auth modes: `@supabase/server` is designed around explicit request context and auth-scoped clients. The current app already enforces request context at the Vercel route boundary through Privy, then applies wallet-level checks before data access.
- Admin client usage: service-role access is centralized in server routes. Keep that pattern; do not pass service-role keys to browser bundles or long-lived client state.
- RLS posture: current helpers should continue treating user-scoped reads and writes as wallet-bound operations. Any future Supabase-native auth migration should map Privy identity to row ownership before relying on RLS alone.
- CORS and runtime: Vercel API routes are same-origin for the app and do not currently need the explicit Edge Function CORS surface that a Supabase Edge Function would require.
- Request context: the current per-request token verification is compatible with the `@supabase/server` model, but moving piecemeal would add another runtime and duplicate auth glue.

## Recommendation

Stay on the current Vercel API helpers for now.

Pilot one new Supabase Edge Function only when there is a self-contained workflow that benefits from running closer to Postgres, such as dispute resolution finalization or admin evidence review. A broad migration to `@supabase/server` should be scheduled later, after the auth model is explicitly mapped from Privy wallet identity to Supabase request-scoped users and RLS policies.

