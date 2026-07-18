# Vercel and Supabase Deployment

## Responsibility split

Vercel runs the Next.js application, route handlers, Server Components, and root proxy. Supabase provides Auth, private account storage, session refresh, confirmation/recovery email flows, transactional recipe-bundle writes, and RLS enforcement. IndexedDB remains the local working store and calculation path.

## Supabase setup

1. Create a Supabase project for the intended environment.
2. Apply migrations in order:
   - `supabase/migrations/202607170001_cloud_accounts.sql`
   - `supabase/migrations/202607170002_account_cloud_sync.sql`
   - `supabase/migrations/202607170003_account_sync_realtime_hints.sql`
3. In Auth URL configuration, set the production Site URL and allow:
   - `https://<production-domain>/auth/callback`
   - the corresponding Vercel preview pattern only if previews should authenticate;
   - `http://localhost:3000/auth/callback` for local development.
4. For the initial invitation-only release, disable public user signup in Supabase Auth. Keep `NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED=false`.
   Run `npm run security:auth-provider` and treat any application/provider mismatch as a release blocker.
5. Invite or administratively create test users through Supabase.
6. Configure custom SMTP before relying on invitations or password recovery in production.
7. Use disposable users to run the RLS isolation test.

The application flag controls whether the signup form is displayed. Supabase Auth configuration is the enforcement control.

## Vercel environment variables

Configure these for each intended Vercel environment:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<project-public-anon-key>
NEXT_PUBLIC_AUTH_SIGNUPS_ENABLED=false
```

Redeploy after changing public environment values because Next.js includes them in browser bundles.

`SUPABASE_SERVICE_ROLE_KEY` is not needed for authentication, profile updates, synchronization, or this deployment. The server route uses the signed-in user's cookie session so RLS remains the authorization boundary. If a service role is ever added for a future administration milestone, scope it only to server environments and never prefix it with `NEXT_PUBLIC_`.

## Local development

Copy `.env.example` to `.env.local` and fill only the public project values. With values absent, the application intentionally starts in local-only mode and shows a cloud-configuration message; scientific functionality continues.

```text
npm install
npm run dev
```

For a production-like check:

```text
npm run build
npm run start
```

## Release verification

- Confirm `/workspace` works signed out.
- Confirm sign-in, refresh persistence, navigation, sign-out, and password recovery with a disposable account.
- Confirm `/account` can update only the current display name.
- Confirm explicit first-upload review does not upload before confirmation.
- Confirm Device A automatically uploads a reviewed local change and Device B receives a Realtime hint, performs an authoritative pull, and can reopen the record offline.
- Confirm offline changes remain in the durable outbox, retry after reconnect, and survive refresh or abrupt tab closure.
- Confirm two open tabs produce one active synchronization pass and an expired lease permits takeover.
- Confirm simultaneous mutable edits create a visible conflict rather than silent overwrite.
- Confirm User B cannot read User A's profile, recipes, revisions, notes, comparisons, settings, devices, or lab.
- Confirm signing out keeps account cache by default and safe removal preserves unsynchronized work.
- Run `supabase/tests/rls-isolation.sql` against a disposable project after all migrations.
- Apply `202607170004_private_lab_libraries.sql`; verify admin/member/viewer isolation, invitation expiry/revocation/email matching, publication immutability, last-admin protection, cache revocation, and retention purge with disposable users.
- Configure a production mail provider and application-level invitation delivery before relying on lab invitations; the development UI returns a one-time secure link for manual delivery.
- Confirm Light, Dark, and Midnight authentication surfaces.
- Confirm Vercel logs and browser network payloads contain no passwords or service-role credentials.
- Run `npm run security:scan` after the production build.
- Follow `PRODUCTION_VALIDATION_5A.md` for target classification and production destructive-test refusal.
- Follow `ROLLBACK_5A.md`; applied database migrations use a reviewed forward-fix policy rather than an assumed automatic rollback.

If Supabase is unavailable, the correct degraded state is signed out/local-only—not the scientific workspace recovery screen.
