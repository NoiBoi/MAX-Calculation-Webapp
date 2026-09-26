import { expect, test } from "@playwright/test";

const sha = "c".repeat(64);

function parseResponse() {
  const artifactId = `xrd-artifact-sha256-${sha}`;
  return {
    schemaVersion: "1.0.0",
    rawArtifact: { schemaVersion: "1.0.0", artifactId, originalFilename: "sample.xy", byteLength: 24, mimeType: "text/plain", sha256: sha, importedAt: "2026-09-25T12:00:00Z", sourceMetadata: null },
    measurement: {
      schemaVersion: "1.0.0", measurementId: "measurement-e2e-1", rawArtifactId: artifactId, rawArtifactSha256: sha, sourceFilename: "sample.xy", importedAt: "2026-09-25T12:00:00Z", sampleName: null, maxcalcSampleId: null,
      acquisitionMetadata: { radiationSourceName: null, wavelengthAngstrom: null, instrumentManufacturer: null, instrumentModel: null, scanDate: null, operator: null, sampleName: null, notes: null },
      parserProvenance: { schemaVersion: "1.0.0", parserId: "maxcalc.generic-delimited-text", parserVersion: "1.0.0", detectedFormat: "whitespace-delimited text", detectionConfidence: "high", textEncoding: "utf-8", delimiter: "whitespace", decimalConvention: "period", headerRows: 1, commentPrefixes: ["#", ";", "//"], twoThetaColumn: { index: 0, name: "2theta" }, intensityColumn: { index: 1, name: "intensity" }, userOverrides: {}, warnings: ["Delimiter was detected heuristically with high confidence."], serviceVersion: "0.1.0" },
      twoThetaDeg: [10, 10.5, 11], intensity: [100, 250, 125], characterization: { pointCount: 3, minTwoThetaDeg: 10, maxTwoThetaDeg: 11, minIntensity: 100, maxIntensity: 250, allValuesFinite: true, ordering: "strictly-increasing", duplicateTwoThetaCount: 0, medianSpacingDeg: 0.5, spacingVariationDeg: 0, rejectedNumericalRowCount: 0 }, validationStatus: "warning", validationIssues: [],
    },
    availableColumns: [{ index: 0, name: "2theta" }, { index: 1, name: "intensity" }],
  };
}

test("imports, persists, reloads, and reopens an exact raw XRD measurement", async ({ page }) => {
  await page.route("**/api/xrd/data/parse", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(parseResponse()) }));
  await page.goto("/xrd");
  await page.getByLabel("Choose experimental XRD file").setInputFiles({ name: "sample.xy", mimeType: "text/plain", buffer: Buffer.from("2theta intensity\n10 100\n") });
  await expect(page.getByText("Import preview · not yet saved")).toBeVisible();
  await expect(page.getByText(/2θ: 2theta · intensity: intensity/)).toBeVisible();
  await expect(page.getByText(/Delimiter was detected heuristically/)).toBeVisible();
  await page.getByLabel("Display / sample name").fill("LMSL sample A");
  await page.getByRole("button", { name: "Import measurement" }).click();
  await expect(page.getByRole("img", { name: /raw experimental XRD pattern/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LMSL sample A", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Measurement library" })).toBeVisible();
  await expect(page.getByText("LMSL sample A")).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("img", { name: /raw experimental XRD pattern/i })).toBeVisible();
  await expect(page.getByText(/3 original points/)).toBeVisible();
});

test("saves and reopens immutable XRD processing and peak-analysis lineage", async ({ page }) => {
  const twoThetaDeg = Array.from({ length: 101 }, (_, index) => 20 + index * 0.1);
  const intensity = twoThetaDeg.map((value) => 5 + 100 * Math.exp(-((value - 25) ** 2) / 0.08));
  const fileBody = `2theta intensity\n${twoThetaDeg.map((value, index) => `${value} ${intensity[index]}`).join("\n")}\n`;
  const parsed = parseResponse();
  parsed.rawArtifact.byteLength = Buffer.byteLength(fileBody);
  parsed.measurement.twoThetaDeg = twoThetaDeg; parsed.measurement.intensity = intensity;
  parsed.measurement.characterization = { ...parsed.measurement.characterization, pointCount: 101, minTwoThetaDeg: 20, maxTwoThetaDeg: 30, minIntensity: Math.min(...intensity), maxIntensity: Math.max(...intensity), medianSpacingDeg: .1 };
  await page.route("**/api/xrd/data/parse", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(parsed) }));
  await page.route("**/api/xrd/data/process", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      schemaVersion: "1.0.0", processedRepresentationId: "processed-e2e-1", parentMeasurementId: "measurement-e2e-1", rawArtifactSha256: sha, createdAt: "2026-09-25T12:05:00Z",
      processingConfig: request.processingConfig, twoThetaDeg, rawIntensity: intensity, estimatedBaseline: intensity.map(() => 5), baselineCorrectedIntensity: intensity.map((value) => value - 5), smoothedIntensity: null, analysisIntensity: intensity.map((value) => value - 5),
      transformationOrder: ["raw", "baseline-subtraction"], warnings: [], diagnostics: { baselineAlgorithm: "arpls", converged: true, iterationCount: 8, finalTolerance: 0.0002 },
      scientificProvenance: { serviceVersion: "0.1.0", pythonVersion: "3.12", numpyVersion: "2.5.3", scipyVersion: "1.18.1", pybaselinesVersion: "1.2.1", lmfitVersion: "1.3.4" },
    }) });
  });
  await page.route("**/api/xrd/peaks/detect", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "1.0.0", processedRepresentationId: "processed-e2e-1", detectionConfig: request.detectionConfig, detectionConfigId: "detect-e2e", candidates: [{ candidateId: "candidate-e2e", approximateTwoThetaDeg: 25, approximateIntensity: 100, prominence: 100, estimatedWidthDeg: .47, sourceIndex: 50, detectionConfigId: "detect-e2e", status: "AUTO", manualWindowMinDeg: null, manualWindowMaxDeg: null }], warnings: [], scientificProvenance: { serviceVersion: "0.1.0", pythonVersion: "3.12", numpyVersion: "2.5.3", scipyVersion: "1.18.1", pybaselinesVersion: "1.2.1", lmfitVersion: "1.3.4" } }) });
  });
  await page.route("**/api/xrd/peaks/fit", async (route) => {
    const request = route.request().postDataJSON(), candidates = request.candidates.filter((item: { status: string }) => item.status !== "EXCLUDED");
    const diagnostics = { success: true, message: "Fit succeeded.", method: "leastsq", evaluations: 31, chiSquare: .02, reducedChiSquare: .0002, akaikeInformationCriterion: -100, bayesianInformationCriterion: -90, rSquared: .9999 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "1.0.0", peakAnalysisId: "analysis-e2e-1", revision: 1, parentProcessedRepresentationId: "processed-e2e-1", parentMeasurementId: "measurement-e2e-1", rawArtifactSha256: sha, createdAt: "2026-09-25T12:06:00Z", detectionConfig: request.detectionConfig, fittingConfig: request.fittingConfig, candidatePeaks: request.candidates,
      fittedPeaks: candidates.map((item: { candidateId: string; approximateTwoThetaDeg: number; status: string }, index: number) => ({ peakId: `peak-${index}`, candidateId: item.candidateId, fittedCenterTwoThetaDeg: item.approximateTwoThetaDeg, centerStderrDeg: .001, amplitude: 50, amplitudeStderr: .2, height: 100, fwhmDeg: .47, fwhmStderrDeg: .003, fraction: .5, fitWindowMinDeg: item.approximateTwoThetaDeg - 1, fitWindowMaxDeg: item.approximateTwoThetaDeg + 1, pointCount: 21, source: item.status === "AUTO" ? "AUTO" : "MANUAL_ADDED", included: true, groupId: `group-${index}`, diagnostics })),
      fitGroups: candidates.map((item: { candidateId: string; approximateTwoThetaDeg: number }, index: number) => ({ groupId: `group-${index}`, candidateIds: [item.candidateId], twoThetaDeg: [item.approximateTwoThetaDeg - .1, item.approximateTwoThetaDeg, item.approximateTwoThetaDeg + .1], observedIntensity: [50, 100, 50], bestFit: [50, 100, 50], localBackground: [0, 0, 0], componentCurves: { [`p${index}_`]: [50, 100, 50] }, residual: [0, 0, 0], diagnostics })),
      excludedCandidateIds: [], manualEdits: request.manualEdits, warnings: [], scientificProvenance: { serviceVersion: "0.1.0", pythonVersion: "3.12", numpyVersion: "2.5.3", scipyVersion: "1.18.1", pybaselinesVersion: "1.2.1", lmfitVersion: "1.3.4" } }) });
  });
  const reference = { sourceType: "cod", sourceId: "1234567", formula: "X", phaseName: "Synthetic cubic", spaceGroup: "P m -3 m", crystalSystem: "cubic", publication: null, doi: null, referenceStatus: "theoretical", retrievedAt: "2026-09-25T12:07:00Z", sourceRevision: "42", cifSha256: "d".repeat(64), sourceUrl: null };
  const lattice = { aAngstrom: 4, bAngstrom: 4, cAngstrom: 4, alphaDeg: 90, betaDeg: 90, gammaDeg: 90 };
  await page.route("**/api/xrd/references/search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "1.0.0", results: [{ sourceType: "cod", sourceId: "1234567", formula: "X", phaseName: "Synthetic cubic", spaceGroup: "P m -3 m", lattice, publication: null, doi: null, referenceStatus: "theoretical", sourceRevision: "42" }] }) }));
  await page.route("**/api/xrd/references/cod/1234567/pattern", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "1.0.0", reference, radiation: { kind: "preset", label: "Cu Kα", wavelengthAngstrom: 1.5406 }, twoThetaRange: { minDeg: 10, maxDeg: 90 }, lattice, crystalSystem: "cubic", spaceGroup: "P m -3 m", reflections: [{ twoThetaDeg: 25, relativeIntensity: 100, dAngstrom: 3.56, hkls: [{ h: 1, k: 1, l: 1, multiplicity: 8 }] }], calculationProvenance: { engine: "pymatgen.XRDCalculator", engineVersion: "test", serviceVersion: "test", calculatedAt: "2026-09-25T12:07:00Z", inputCifSha256: "d".repeat(64) } }) }));
  await page.route("**/api/xrd/reference/match", async (route) => { const request = route.request().postDataJSON(); const candidate = { referenceReflectionId: "reflection-0", referenceTwoThetaDeg: 25, deltaTwoThetaDeg: 0, absoluteDeltaTwoThetaDeg: 0, calculatedRelativeIntensity: 100, hkls: [{ h: 1, k: 1, l: 1, multiplicity: 8 }] }; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "1.0.0", matchingResultId: "matching-e2e-proposal", parentPeakAnalysisId: "analysis-e2e-1", parentProcessedRepresentationId: "processed-e2e-1", parentMeasurementId: "measurement-e2e-1", selectedReference: reference, referenceCifSha256: reference.cifSha256, rawArtifactSha256: sha, wavelengthAngstrom: 1.5406, config: request.config, proposedMatches: [{ matchId: "match-e2e-1", experimentalPeakId: "peak-0", referenceReflectionId: "reflection-0", experimentalTwoThetaDeg: 25, referenceTwoThetaDeg: 25, deltaTwoThetaDeg: 0, absoluteDeltaTwoThetaDeg: 0, experimentalFwhmDeg: .47, experimentalIntensity: 100, centerStderrDeg: .001, calculatedRelativeIntensity: 100, candidateHkls: candidate.hkls, selectedHkl: candidate.hkls[0], alternativeCandidates: [candidate], provenanceState: "AUTO_PROPOSED", accepted: true, includeInRefinement: true, ambiguous: false, notes: [] }], unmatchedExperimentalPeakIds: ["peak-1"], unmatchedReferenceReflectionIds: [], ambiguousMatchIds: [], warnings: [], scientificProvenance: { serviceVersion: "test", pythonVersion: "3.12", numpyVersion: "2.5.3", scipyVersion: "1.18.1", pybaselinesVersion: "1.2.1", lmfitVersion: "1.3.4" }, createdAt: "2026-09-25T12:08:00Z" }) }); });
  await page.route("**/api/xrd/lattice/refine", async (route) => { const request = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "1.0.0", refinementId: "refinement-e2e-1", parentMatchingResultId: request.matchingResult.matchingResultId, parentPeakAnalysisId: "analysis-e2e-1", parentProcessedRepresentationId: "processed-e2e-1", parentMeasurementId: "measurement-e2e-1", rawArtifactSha256: sha, selectedReference: reference, referenceCifSha256: reference.cifSha256, wavelengthAngstrom: 1.5406, crystalSystem: "cubic", config: request.config, referenceLattice: lattice, parameters: [{ name: "a", initialValue: 4, refinedValue: 4.01, standardError: null, unit: "angstrom" }], zeroShiftDeg: null, zeroShiftStandardErrorDeg: null, includedMatchIds: ["match-e2e-1"], excludedMatchIds: [], residuals: [{ matchId: "match-e2e-1", experimentalPeakId: "peak-0", referenceReflectionId: "reflection-0", hkl: { h: 1, k: 1, l: 1, multiplicity: 8 }, experimentalTwoThetaDeg: 25, predictedTwoThetaDeg: 25.01, deltaTwoThetaDeg: -.01, observedDAngstrom: 3.56, predictedDAngstrom: 3.55, included: true, centerStderrDeg: .001 }], diagnostics: { optimizerSuccess: true, optimizerMessage: "ok", rank: 1, parameterCount: 1, conditionNumber: 1, degreesOfFreedom: 0, rmsDeltaTwoThetaDeg: .01, meanDeltaTwoThetaDeg: -.01, maximumAbsoluteDeltaTwoThetaDeg: .01, rmsDSpacingResidualAngstrom: .01, covariance: null, correlation: null }, warnings: ["Fit covariance is unavailable; parameter standard errors are not reported."], scientificProvenance: { serviceVersion: "test", pythonVersion: "3.12", numpyVersion: "2.5.3", scipyVersion: "1.18.1", pybaselinesVersion: "1.2.1", lmfitVersion: "1.3.4" }, createdAt: "2026-09-25T12:09:00Z" }) }); });

  await page.goto("/xrd");
  await page.getByLabel("Choose experimental XRD file").setInputFiles({ name: "sample.xy", mimeType: "text/plain", buffer: Buffer.from(fileBody) });
  await page.getByRole("button", { name: "Import measurement" }).click();
  await expect(page.getByRole("heading", { name: "Process and fit peaks" })).toBeVisible();
  await page.getByRole("combobox", { name: /^Baseline$/ }).selectOption("arpls");
  await page.getByRole("button", { name: "Preview processing" }).click();
  await expect(page.getByText("Unsaved preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save processing run" }).click();
  await page.getByRole("button", { name: "Detect peaks" }).click();
  await expect(page.getByText(/Detected 1 candidate peak/)).toBeVisible();
  await page.getByLabel("Add peak at 2θ").fill("25.2");
  await page.getByRole("button", { name: "Add manual peak" }).click();
  await page.getByRole("button", { name: "Fit active peaks" }).click();
  await expect(page.getByRole("cell", { name: "MANUAL_ADDED" })).toBeVisible();
  await page.getByRole("button", { name: "Save peak analysis" }).click();
  await page.getByRole("button", { name: "References" }).click();
  await page.getByLabel("Reference name").fill("LMSL empirical sample A");
  await page.getByLabel("Composition / formula").fill("X");
  await page.getByRole("button", { name: "Save as LMSL empirical reference" }).click();
  await expect(page.getByText(/Empirical reference saved as UNREVIEWED/)).toBeVisible();
  await page.getByLabel("Formula or COD ID").fill("1234567");
  await page.getByRole("button", { name: "Search COD" }).click();
  await page.getByRole("button", { name: "Use reference" }).click();
  await expect(page.getByRole("heading", { name: "X theoretical powder pattern" })).toBeVisible();
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByLabel("Experimental wavelength (Å)").fill("1.5406");
  await page.getByRole("button", { name: "Propose matches" }).click();
  await expect(page.getByRole("table", { name: "Reference match review" })).toBeVisible();
  const accept = page.getByRole("table", { name: "Reference match review" }).locator('input[type="checkbox"]').first();
  await accept.uncheck(); await accept.check();
  await page.getByRole("button", { name: "Run and save lattice refinement" }).click();
  await expect(page.getByRole("heading", { name: "Reference vs refined lattice" })).toBeVisible();
  await expect(page.getByRole("table", { name: /Per-reflection residuals/ })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("img", { name: /raw experimental XRD pattern/i })).toBeVisible();
  await page.getByRole("button", { name: /Open 9\/25\/2026/ }).click();
  await expect(page.getByRole("heading", { name: "Saved analysis revisions" })).toBeVisible();
  await page.getByRole("button", { name: "Open analysis" }).click();
  await expect(page.getByRole("heading", { name: "Import → process → peaks → reference → match → lattice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved reference-matching analyses" })).toBeVisible();
  await page.getByRole("button", { name: "Open matching result" }).click();
  await page.getByRole("button", { name: "Open refinement result" }).click();
  await expect(page.getByRole("heading", { name: "Reference vs refined lattice" })).toBeVisible();
});
