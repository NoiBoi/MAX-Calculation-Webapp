# Security Architecture

## Authentication boundary

Supabase Auth owns passwords, password hashing, confirmation, recovery tokens, authentication rate limits, and session issuance. MAXCalc never receives password hashes and never stores passwords in Postgres, IndexedDB, application logs, or analytics events.

The browser uses only `NEXT_PUBLIC_SUPABASE_URL` and the public anon key. The reserved `SUPABASE_SERVICE_ROLE_KEY` is not used by this milestone and must never receive a `NEXT_PUBLIC_` prefix or enter browser code. The public anon key is not an authorization boundary; RLS and verified user identity are.

## Server trust

- Server mutations call Supabase Auth to verify the current user.
- The profile endpoint does not accept `user_id`.
- The cloud-sync endpoint does not accept `owner_id` as authority; it derives ownership from the server-verified user, applies that identity explicitly to account-owned reads, and rejects cross-origin POSTs.
- Callback return locations pass through `safeInternalPath`; external, protocol-relative, backslash, malformed, and control-character paths are rejected.
- The profile endpoint rejects cross-origin browser POSTs.
- Supabase SSR owns cookie creation and refresh. Application code does not manually serialize bearer tokens.
- Authentication errors never trigger destructive IndexedDB recovery.

## Database authorization

Migrations `supabase/migrations/202607170001_cloud_accounts.sql` and `supabase/migrations/202607170002_account_cloud_sync.sql` enable and force RLS on every application table. `202607170003_account_sync_realtime_hints.sql` publishes only private synchronized content tables to Supabase Realtime; subscriptions are opened after authentication with an owner filter and remain subject to RLS.

| Table | Ordinary authenticated read | Ordinary authenticated write |
| --- | --- | --- |
| `profiles` | Own row only | Own `display_name` only |
| `labs` | Labs where `auth.uid()` is a member | None |
| `lab_members` | Membership rows for labs where `auth.uid()` is a member | None |
| `recipes` | Own rows only | Own mutable metadata only |
| `recipe_revisions` | Own rows only | Insert only; updates and deletes are blocked |
| `recipe_notes` | Own rows only | Own rows only |
| `comparisons` | Own rows only | Own rows only |
| `user_settings` | Own singleton only | Own singleton only |
| `user_devices` | Own rows only | Own rows only |

Table-wide grants are revoked before the minimum column/table grants are added. `user_id`, creation timestamps, update timestamps, lab ownership, roles, and membership are not directly mutable by ordinary clients. No private policy uses `using (true)`.

`handle_new_auth_user()` and `ensure_own_profile()` are security-definer functions with an empty search path and fully qualified table references. The latter accepts no identity argument and uses only `auth.uid()`. `is_lab_member()` returns a membership boolean for the active user and avoids a recursive membership policy.

`apply_recipe_bundle()` derives the owner exclusively from `auth.uid()`, writes a recipe and all immutable revisions in one transaction, verifies optimistic versions, and rejects a reused scientific revision identity whose digest or payload differs. All cloud fetches and mutations run through the cookie-authenticated server route. The browser never receives a service-role key.

Realtime events and `BroadcastChannel` messages are hints only. Broadcast messages contain no note bodies, calculation snapshots, or credentials. A hint always triggers the authenticated server pull and full validation path. Account change or sign-out closes the channel, releases the local lease, and prevents one owner's outbox or cursor from being processed for another owner. Redacted diagnostics exclude account identity, installation identity, tokens, record payloads, and secret keys.

## Verification

- Unit tests scan both migrations for RLS on every app-owned table, authenticated ownership predicates, minimum grants, immutable revision protections, trigger/bootstrap behavior, and absence of permissive private policies.
- `supabase/tests/rls-isolation.sql` is a disposable-project pgTAP verification template using two real test Auth user IDs. It verifies own-profile access, protected identity fields, member lab access, private scientific records, revision immutability, and cross-user/nonmember isolation.
- Optional live browser tests require disposable credentials supplied outside the repository.

Do not run isolation fixtures against production data.

## Private lab authorization

Migration `202607170004_private_lab_libraries.sql` forces RLS on invitations, entries, versions, publication notes, and audit. Authenticated table grants are select-only; all mutation occurs through role-checking RPCs. Invitation token plaintext is never stored. Immutable publication/note triggers and append-only audit triggers reject ordinary update/delete. Composite foreign keys prevent cross-lab references, the last-admin rule prevents orphaned governance, and purge is restricted to eligible unheld entries in a narrow database context. Browser role checks are never treated as authority.

## Operational requirements

- Configure allowed redirect URLs precisely in Supabase.
- Enforce invite-only operation in Supabase Auth settings, not only by hiding `/signup`.
- Use a custom SMTP provider before production password recovery or invitations.
- Review Supabase Auth rate-limit and abuse-protection settings for the deployment.
- Apply migrations before enabling account UI in production.
- Never place test passwords, service-role keys, or access tokens in source control, browser storage, screenshots, or test artifacts.
- Cloud mutation routes require same-origin `application/json` requests and reject declared oversized payloads before parsing. Schema validators still enforce actual serialized size and per-record limits when `Content-Length` is absent.
- The production response policy sets CSP, frame denial, MIME sniffing prevention, referrer and permissions restrictions, HSTS, and non-public caching with no-store or mandatory revalidation for account, lab, Auth callback, and API surfaces.
- `npm run security:scan` inspects built browser assets for the service-role identifier and any configured service-role value. It never prints the value.
