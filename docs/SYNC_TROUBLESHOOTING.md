# Synchronization troubleshooting

## Status meanings

- **Pending**: the local record and durable outbox operation are safe in IndexedDB and have not been acknowledged by the server.
- **Syncing**: this tab owns the short account lease and is running the shared pull/merge/upload engine.
- **Offline**: no request is attempted. Reconnect schedules another pass.
- **Retrying**: a network, rate-limit, or server failure is waiting for bounded backoff. `Sync now` makes pending retry work eligible immediately.
- **Sign in again**: the local queue is retained; authenticate before retrying.
- **Conflict**: both versions are retained for explicit resolution. Automatic retries do not choose a winner.
- **Paused**: triggers are disabled until Resume; local writes continue to enter the durable queue.

## Recovery checks

1. Keep the affected browser profile and site data; do not clear IndexedDB.
2. Open Account → Cloud data and inspect status, pending count, conflicts, quarantine, last successful time, and next retry.
3. Confirm the expected account is signed in and the browser reports online.
4. Select **Sync now** to bypass a retry delay without bypassing validation or conflict rules.
5. If another tab is synchronizing, wait for that pass or close the duplicate tab. An abandoned lease expires automatically.
6. Export a verified local backup before destructive browser or deployment troubleshooting.

Refreshing, closing the tab, losing connectivity, receiving a stale Realtime hint, or retrying a request after an uncertain server response must not duplicate immutable revisions or discard pending work. An open calculator is never replaced by a downloaded revision; reopen the saved recipe deliberately after reviewing the notice.

Automatic synchronization requires an open signed-in page. MAXCalc has no service worker and cannot run after every application tab is closed.

## Lab-library cache

Lab sync is separate from personal sync. If a lab disappears, reconnect and open **Private lab libraries** to force a verified authorization refresh. A removed/suspended user loses server access immediately; the next verified refresh deletes that lab's local namespace. Do not clear the whole account database to repair one lab. Offline mode may show the last authorized cache but disables publish, invitation, membership, retention, and purge actions.
