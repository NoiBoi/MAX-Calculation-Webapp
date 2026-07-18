# Local backup, restore, and cloud sync

These are separate safety tools:

- **Local backup** creates a portable, manifest- and digest-verified file controlled by the user.
- **Cloud synchronization** copies reviewed saved record categories into one private account and automatically reconciles later durable changes while a signed-in page is open.
- **Downloaded cloud cache** is an account-scoped IndexedDB copy that permits offline reopening after a successful download.

Sync status, outbox and lease records, cloud UUID mappings, conflict UI state, device diagnostics, auth sessions, recovery errors, and transient workspace state are excluded from portable backup scientific records. Recipe revisions and snapshots remain immutable and retain their original engine/data versions.

Restore still previews limits, digests, references, and stable-ID conflicts before a transaction. In an account database, records not already tracked after restore are marked `local-only`. They do not upload during the next sync until the user reviews and explicitly prepares selected categories. Merge keeps the existing stable-ID conflict choices; replace still creates a safety backup.

Removing downloaded cloud cache deletes only records known to be safely downloaded and currently synchronized. Pending changes, restored local-only records, errors/conflicts, and anonymous data are preserved. It never sends a cloud deletion.

Private lab libraries are not silently merged into personal portable backups. An admin may explicitly export authorized lab metadata, memberships, entries, immutable versions, selected publication notes, and redacted audit. Invitation secrets and members' unrelated personal data are excluded. A personal copy made from a lab publication is an ordinary independent personal recipe and is included in personal backup with its provenance.
