# Lab retention and purge

Retention applies only to shared lab-library payloads. Personal recipes, personal notes, comparisons, local backups, and personal copies made from a lab publication are separate records and are never cascade-purged by a lab action.

- Active entries are not purge eligible.
- Archiving preserves every immutable version and computes eligibility from the lab's current `null`, 30, 90, or 365 day policy.
- A retention hold blocks purge and requires a non-empty reason.
- Restore returns the entry to active and clears purge eligibility.
- Removing a hold returns the entry to archived and recomputes eligibility.
- Purge requires an active admin, elapsed eligibility, no hold, the exact entry title, and a server authorization check.

The purge RPC deletes the entry's lab versions and publication-note payloads under a narrowly scoped database purge context, then retains an append-only audit tombstone. There is no automatic scheduled purge in this milestone. Administrators should export authorized lab data before destructive retention changes and verify any institution-specific records policy independently.
