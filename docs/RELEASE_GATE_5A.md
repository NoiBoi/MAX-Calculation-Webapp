# MAXCalc Milestone 5A release gate

## Baseline

| Field | Value |
| --- | --- |
| RC identifier | `v1.0.0-rc.1` |
| Baseline source commit | `8281ee1eadae0efc33b91d88af8a08c0bca736e1` |
| Chemistry engine | `0.6.1-rational-scalar-contract` |
| Scientific schema | `1.0.0` |
| IndexedDB version | `11` |
| Local record schema | `11.0.0` |
| Cloud/lab schemas | `1.0.0` / `1.0.0` |
| Supabase migration | `202607170004` |
| Atomic weights | `2024.2.0` |
| Production | `https://maxcalc.vercel.app` |
| Validation date | 2026-07-18 |
| Tester | Codex with Matthew Deng project access |

The baseline commit is the pre-hardening source commit. A final release commit must replace it before acceptance.

## Results

| Area | Status | Evidence / finding |
| --- | --- | --- |
| Provider signup policy | Passed | Public Auth settings now report signup disabled and match the application flag. |
| Migration alignment | Passed | Local and remote list migrations `202607170001` through `202607170004`. |
| Local type/unit/build gates | Passed | TypeScript, ESLint, 451 Vitest tests, and the production Next.js build passed. |
| Browser secret scan | Passed | Built browser assets contain no service-role marker or configured value. |
| Security/cache headers | Passed locally | CSP, frame, MIME, referrer, permissions, HSTS, and non-public cache behavior are covered by deployed-smoke assertions. |
| Payload/content-type guards | Implemented, unit tested | Cloud sync, lab actions, and profile writes now reject unsupported/oversized requests before JSON parsing. |
| Personal RLS isolation | Pending external gate | SQL fixture exists; requires disposable Auth users and local/dedicated test DB. |
| Cross-lab/role RLS | Pending external gate | Lab SQL fixture exists; full actor matrix requires disposable users. |
| Multi-device stress | Pending external gate | Unit sync tests exist; fresh deployed two-context run not yet completed. |
| Account switching | Pending external gate | Architecture is physically namespaced; deployed two-account run pending. |
| Membership revocation | Pending external gate | RLS and cache design exist; deployed multi-device run pending. |
| SMTP/live email | Pending | No actual production test email has been sent and received. |
| Local Supabase replay | Blocked locally | Docker engine unavailable in the current environment. |
| Backup/recovery | Existing automated coverage; final run pending | Transactional backup/restore and repeatable startup tests exist. |
| Full Playwright suite | Passed locally | 126 passed, 4 explicitly skipped, 0 failed, 0 retries in Chromium; 47.5 seconds. Live credential and deliberately unconfigured-cloud workflows were skipped. |
| Vercel preview build | Passed | Preview `max-calculation-webapp-6q8zwb9q0-md-eng.vercel.app` built successfully from the hardening working tree. |
| Preview smoke | Blocked by environment | Vercel deployment protection redirected anonymous Playwright traffic to Vercel login; no application result is claimed. |
| Production smoke | Passed on current production source | Four non-destructive tests passed: public calculator, invitation-only UI, non-public account caching, callback rejection, and destructive-test refusal. The hardening preview has not been promoted. |

## Findings

### Release blockers

- Disposable two-user personal and cross-lab RLS matrix has not yet been executed against a dedicated test database.
- Full deployed multi-device, account-switch, and membership-revocation workflows require disposable account credentials.
- Production SMTP has not been live-tested.
- The hardening source has not yet been committed and deployed as the final RC.

### Closed blocker

- Application invitation-only policy previously disagreed with Supabase, which allowed direct signup. Supabase signup is now disabled at the provider boundary and the automated policy check passes.

### High priority

- Local Supabase migration replay cannot run until Docker is available.
- Preview authentication requires an explicit preview callback or must remain intentionally disabled.

### Medium/low

- Operational status is split between Account and Cloud data rather than one complete diagnostic page.
- Automated disposable actor provisioning and cleanup should be finalized only for a dedicated test project; it must never target production.
- Development output reports a duplicate React warning key for repeated `ATOMIC_WEIGHT_INTERVAL` advisories. Values are unaffected, but the presentation key should be made unique.

## Recommendation

**Do not accept Milestone 5A yet.** The RC may proceed to a dedicated validation environment. Acceptance requires every blocker above to close with recorded evidence and a final commit/deployment identifier.

Milestone 5B remains limited to independent scientific reconciliation, dataset review, reference-case review, and laboratory acceptance. No Milestone 5B work is included here.
