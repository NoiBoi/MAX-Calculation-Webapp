# Test Instructions

- Scientific fixtures require an independent source/reviewer and explicit tolerance rationale.
- Keep expected scientific values as decimal strings.
- Prefer exact assertions until a documented numerical algorithm requires tolerance.
- Every warning test asserts stable code, actionable message, blocking flag, and preserved input.
- Every calculation-defect fix starts with a failing regression case.
- Playwright tests use roles/labels and keyboard interactions, never styling selectors.
- Performance assertions record reference hardware, dataset, warm-up, and sample count.
