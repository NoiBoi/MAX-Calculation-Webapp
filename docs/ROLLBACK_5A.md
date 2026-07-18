# Milestone 5A rollback and forward-fix policy

## Application rollback

Vercel application deployments are immutable. If a release introduces an application defect, promote the last verified deployment. Keep cloud features disabled through missing/invalid public configuration only as an emergency degradation path; the local calculator must remain available.

Before rollback, determine whether the newer deployment wrote records with a newer supported schema. Older code must not be promoted if it would reject or misinterpret those records. Prefer a forward compatibility fix when newer records already exist.

## Supabase migrations

Applied migrations are append-only. Do not promise automatic SQL rollback. Migrations that create immutable history, audit, RLS policies, constraints, or authorization functions may not be safely reversible after writes.

For a database defect:

1. Disable the affected cloud UI/route while preserving signed-out local calculation.
2. Verify a Supabase backup exists and is restorable.
3. Capture schema and migration versions.
4. Create a reviewed forward-fix migration.
5. Replay all migrations into an empty disposable database and a supported prior-version fixture.
6. Re-run RLS isolation before re-enabling cloud operations.

Never drop immutable revisions or audit history as a rollback shortcut.

## Local data

IndexedDB migrations are append-only and cannot automatically reset on failure. Retry closes stale handles and reruns initialization. Safe-open skips transient recovery only. Settings reset affects settings only. Recovery reset affects the current transient workspace only. Full local reset remains separately confirmed and destructive.

Users should export a verified local backup before a planned rollback. Restore preview and safety backup precede replace restore; restored cloud-eligible records remain local-only until explicit synchronization review.

