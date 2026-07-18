# Milestone 5A production validation procedure

## Target classification

Set:

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
TEST_TARGET=local
ALLOW_PRODUCTION_DESTRUCTIVE_TESTS=false
```

Valid targets are `local`, `preview`, and `production`. The configured label must match the URL. Production destructive tests require both:

```text
ALLOW_PRODUCTION_DESTRUCTIVE_TESTS=true
CONFIRM_PRODUCTION_TEST_RUN=MAXCALC_DISPOSABLE_DATA_ONLY
```

This confirmation is not permission to use real records. Destructive tests remain restricted to a dedicated remote test project and run-tagged disposable identities.

## Disposable run convention

Use `e2e-YYYY-MM-DD-<random>` as the run ID. Put the exact ID in every disposable profile label, local record ID, recipe/comparison name, lab description, invitation request ID, and device name. Maintain a manifest containing project ref, actor IDs, lab IDs, record IDs, creation time, and cleanup status. Never put passwords, tokens, note bodies, or scientific payloads in the manifest.

Required actors are User A, User B, Lab A admin/member/viewer, Lab B admin/member, suspended member, removed member, and pending invitee. Provision them only in local Supabase or a dedicated remote test project.

Cleanup is a separate confirmed operation. It must verify the dedicated-test project marker, exact run prefix, manifest project ref, and every target identity before deleting. A dry-run report is mandatory. Production project cleanup is prohibited.

## Commands

1. `npm run release:baseline`
2. `npm run security:auth-provider`
3. `npm run check`
4. `npm run build`
5. `npm run security:scan`
6. `npm run test:e2e`
7. Run `supabase/tests/rls-isolation.sql` and `supabase/tests/lab-library-rls.sql` with disposable Auth UUIDs.
8. `PLAYWRIGHT_BASE_URL=<preview> TEST_TARGET=preview npm run test:deployed`
9. `PLAYWRIGHT_BASE_URL=https://maxcalc.vercel.app TEST_TARGET=production npm run test:deployed`
10. `npm audit --omit=dev`

Local Supabase database tests require a running Docker engine. Do not substitute production records when Docker or disposable credentials are unavailable; record the gate as pending.

## Evidence

Record commit, URL, start/end time, browser version, test counts, skips, retries, traces, screenshots, migration list, provider-policy output, bundle secret scan, SMTP receipt evidence, and cleanup report. No unconditional retries are permitted.

