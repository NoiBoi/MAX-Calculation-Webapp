# Cloud Accounts Architecture — Milestone 1

## Scope and boundary

Milestone 1 added optional Supabase identity. Milestone 2 adds a separate explicit synchronization subsystem. The calculator, comparison workspace, notes, settings, backup, print, and recovery remain available while signed out. Signing in alone still never uploads or claims anonymous records.

Implemented:

- Supabase email/password authentication and provider-managed recovery tokens.
- Cookie-backed SSR sessions refreshed by the Next.js 16 root `proxy.ts`.
- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/auth/error`, and `/account`.
- One `AuthProvider` initialized from a server-derived user summary.
- Private `profiles`, `labs`, and `lab_members` foundations protected by RLS.
- A stable future ownership discriminator:

```ts
type LocalDataOwner =
  | { kind: "anonymous"; installationId: string }
  | { kind: "account"; userId: string };
```

Milestone 2 synchronization details are defined in `CLOUD_SYNC_ARCHITECTURE.md`. Routes, automatic/background synchronization, realtime subscriptions, lab management/sharing, and administrative membership writes remain unimplemented.

## Request and session flow

1. The root Server Component reads the public cloud configuration.
2. When configured, the server client reads the Supabase cookie session and validates the current user.
3. `AuthProvider` receives only the summarized identity needed by the application shell.
4. The browser client is a module singleton used for sign-in, reset requests, password updates, sign-out, and auth-state events.
5. `proxy.ts` calls the supported SSR refresh operation and returns any refreshed cookies. Refresh failure returns the ordinary application response so local-only work is not blocked.
6. The callback exchanges a one-time PKCE authorization code for a cookie session and redirects only to a validated internal path.

The application does not put auth tokens in its own localStorage records. Supabase SSR owns session-cookie formatting and rotation.

## Profile behavior

`create_profile_after_auth_user` creates a profile after a new `auth.users` row. `ensure_own_profile()` is an idempotent recovery path for invited users or a prior partial failure. It accepts no user identifier and binds exclusively to `auth.uid()`.

The profile API:

- checks same-origin POST context;
- verifies the server-side Supabase user;
- accepts only a bounded display name;
- derives `user_id` from the verified session;
- updates only the permitted RLS-protected profile field;
- mirrors the label into Supabase Auth metadata through the provider API.

Email and password are never changed by direct application-database writes.

## Local ownership preparation

Anonymous browser state has a stable random installation ID. An authenticated cloud identity has the Supabase user ID. These identifiers remain outside scientific records. Milestone 2 partitions IndexedDB by user ID, stores cloud mapping/status in separate sync tables, and requires explicit anonymous-data review before copying any record into an account scope.

## Failure domains

- Authentication failures stay on authentication surfaces.
- Profile/RLS failures stay on the account surface and report that local data is unaffected.
- Supabase unavailability degrades to local-only operation.
- Local workspace corruption continues through the existing IndexedDB recovery boundary.
- Scientific calculation errors remain chemistry-engine results.

No cloud failure is routed into local workspace recovery.

## Milestone 3 boundary

The recommended next milestone is controlled lab-library sharing with explicit publish/copy semantics, retention controls, audit history, and role-specific RLS. It must not silently turn private synced records into shared records.
