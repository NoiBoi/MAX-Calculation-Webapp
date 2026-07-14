# Print and summary architecture

Calculator and comparison printouts consume `WeighingSummary`, the same presentation model used by screen and clipboard output. The model is assembled from an existing `BatchCalculationResult` plus workspace input metadata; print components perform no formula parsing, balancing, adjustment, molar-mass, radius, or rounding arithmetic.

The ordinary model includes adjusted feed, batch basis, precursor formula, final intended molar quantity, exact solver quantity where relevant, purity, final rounded mass, status, actionable warnings, engine version, and atomic-weight version. The optional advanced projection adds descriptors only when a valid explicit site model and an exact usable dataset selection are present.

Print CSS targets Letter and A4 through 12 mm page margins, repeatable table headers, non-splitting rows, and compact type. The interactive application is hidden whenever the summary dialog is printed. Two scenarios may share a page in columns; other counts flow in scenario order. Expanded occupant-radius tables remain screen/copy material, while print uses one compact line per site and one shared disclaimer.
