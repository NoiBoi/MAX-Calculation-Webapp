# Laboratory acceptance plan

Status: **Laboratory validation in progress**. Engineering checks do not constitute laboratory approval.

## Participants and recordkeeping

Use five trained intended users where practical. Record a non-identifying participant code, role, experience level, spreadsheet familiarity, date, app/engine/dataset versions, browser/device, and observer. Use a controlled test browser profile and approved reference cases. The observer must not coach after initial onboarding except when recording “assistance required.”

## Tasks

| ID | Required workflow | Required observation |
|---|---|---|
| LAB-001 | Open a saved recipe, change batch mass, review final masses, save revision | Time and any transcription error |
| LAB-002 | Enter specified total aluminum coefficient, identify adjusted feed, confirm masses | Direct coefficient and explanatory relative percentage understood |
| LAB-003 | Add route precursors, resolve missing-source warning, obtain valid result | Warning comprehension |
| LAB-004 | Duplicate/load two routes, identify mass/warning differences, save preferred scenario | Sources remain unchanged; no “best route” inference |
| LAB-005 | Open old revision, identify engine version, recalculate explicitly | Historical/current outputs distinguished |
| LAB-006 | Enter invalid formula, observe stale state, correct it | Stale result never treated as current |
| LAB-007 | Create and preview backup, restore controlled database, verify records | No record loss |
| LAB-008 | Print preparation sheet and inspect balance-side content | Formula, masses, warnings, versions present |
| LAB-009 | Complete routine calculation without pointer | No focus trap |
| LAB-010 | Compare approved case with laboratory spreadsheet | Values, tolerances, and discrepancy disposition |

## Metrics and pass criteria

For every task record completion, seconds, error count, assistance, scientific misunderstanding, warning comprehension, incorrect mass-reading attempts, stale-result failures, confidence (1–5), feedback, and suggested change.

Release requires all of the following:

- LAB-001 completes within 30 seconds in at least four of five trained attempts.
- No stale result is treated as current and no approved reference task has a final-mass transcription discrepancy.
- Backup/restore completes without loss; historical and recalculated output are distinguishable.
- Every LAB-004 participant identifies which scenario contains each precursor.
- Keyboard workflow completes without a focus trap.
- Critical warnings are understood without observer explanation after onboarding.
- A named responsible reviewer signs the versioned record with the approved reference-case list and known limitations.

Any safety/scientific failure blocks approval. Usability failures require documented remediation or a reviewer-approved limitation followed by a focused retest.
