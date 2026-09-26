"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaxStoichDatabase } from "@/lib/persistence/database";
import { XRDAnalysisRepository, type StoredExperimentalXRDMeasurement, type StoredProcessedXRDRepresentation, type StoredXRDPeakAnalysis } from "@/lib/xrd/persistence";
import {
  defaultFittingConfig, defaultProcessingConfig, peakAnalysisSchema, peakDetectionResultSchema, processedRepresentationSchema,
  type ProcessedXRDRepresentation, type XRDPeakAnalysis, type XRDPeakCandidate, type XRDPeakDetectionConfig, type XRDPeakDetectionResult, type XRDProcessingConfig,
} from "@/lib/xrd/stage3";

function fmt(value: number | null | undefined, digits = 4): string { return value === null || value === undefined ? "Not available" : value.toFixed(digits).replace(/\.?0+$/, ""); }
function apiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown; detail?: unknown } }).error;
    if (typeof error?.message === "string") return typeof error.detail === "string" ? `${error.message} ${error.detail}` : error.message;
  }
  return fallback;
}
async function postJson(path: string, payload: unknown): Promise<unknown> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiError(body, "The scientific operation failed."));
  return body;
}

function AnalysisPlot({ processed, detection, analysis, showRaw, showBaseline, showProcessed }: {
  readonly processed: ProcessedXRDRepresentation; readonly detection?: XRDPeakDetectionResult; readonly analysis?: XRDPeakAnalysis;
  readonly showRaw: boolean; readonly showBaseline: boolean; readonly showProcessed: boolean;
}) {
  const width = 900, height = 310, left = 68, right = 22, top = 20, bottom = 45;
  const xs = processed.twoThetaDeg, arrays = [showRaw ? processed.rawIntensity : [], showBaseline ? processed.estimatedBaseline ?? [] : [], showProcessed ? processed.analysisIntensity : []].filter((item) => item.length);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...arrays.flat()), maxY = Math.max(...arrays.flat()), xSpan = maxX - minX || 1, ySpan = maxY - minY || 1;
  const px = (value: number) => left + ((value - minX) / xSpan) * (width - left - right);
  const py = (value: number) => top + (height - top - bottom) - ((value - minY) / ySpan) * (height - top - bottom);
  const path = (values: readonly number[]) => {
    const stride = Math.max(1, Math.ceil(values.length / 12_000));
    return xs.filter((_value, index) => index % stride === 0 || index === xs.length - 1).map((value, visibleIndex) => {
      const index = Math.min(visibleIndex * stride, values.length - 1); return `${px(value)},${py(values[index]!)}`;
    }).join(" ");
  };
  return <svg aria-label="Processed XRD pattern with candidate and fitted peak markers" className="xrd-stick-plot" role="img" viewBox={`0 0 ${width} ${height}`}>
    <line className="xrd-axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} /><line className="xrd-axis" x1={left} x2={left} y1={top} y2={height - bottom} />
    {showRaw && <polyline className="xrd-analysis-raw" fill="none" points={path(processed.rawIntensity)} />}
    {showBaseline && processed.estimatedBaseline && <polyline className="xrd-analysis-baseline" fill="none" points={path(processed.estimatedBaseline)} />}
    {showProcessed && <polyline className="xrd-raw-line" fill="none" points={path(processed.analysisIntensity)} />}
    {detection?.candidates.filter((item) => item.status !== "EXCLUDED").map((item) => <line className={item.status === "MANUAL_ADDED" ? "xrd-marker-manual" : "xrd-marker-candidate"} key={item.candidateId} x1={px(item.approximateTwoThetaDeg)} x2={px(item.approximateTwoThetaDeg)} y1={top} y2={height - bottom} />)}
    {analysis?.fittedPeaks.filter((item) => item.included && item.fittedCenterTwoThetaDeg !== null).map((item) => <circle className="xrd-marker-fitted" cx={px(item.fittedCenterTwoThetaDeg!)} cy={py(item.height ?? maxY)} key={item.peakId} r="4" />)}
    <text className="xrd-axis-label" textAnchor="middle" x={(left + width - right) / 2} y={height - 4}>2θ (degrees)</text>
  </svg>;
}

function FitInspectionPlot({ group, processed }: { readonly group: XRDPeakAnalysis["fitGroups"][number]; readonly processed: ProcessedXRDRepresentation }) {
  const width = 900, height = 330, left = 64, right = 20, top = 18, residualTop = 245;
  const xs = group.twoThetaDeg, series = [group.observedIntensity, group.bestFit ?? [], group.localBackground ?? [], ...Object.values(group.componentCurves)].filter((item) => item.length);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...series.flat()), maxY = Math.max(...series.flat()), xSpan = maxX - minX || 1, ySpan = maxY - minY || 1;
  const px = (value: number) => left + ((value - minX) / xSpan) * (width - left - right), py = (value: number) => top + (residualTop - top - 18) - ((value - minY) / ySpan) * (residualTop - top - 18);
  const residual = group.residual ?? [], residualAbs = Math.max(...residual.map(Math.abs), 1e-12), pry = (value: number) => residualTop + 25 - (value / residualAbs) * 22;
  const points = (values: readonly number[], y: (value: number) => number = py) => xs.map((value, index) => `${px(value)},${y(values[index]!)}`).join(" ");
  const rawLocal = xs.map((value) => {
    let best = 0; for (let index = 1; index < processed.twoThetaDeg.length; index += 1) if (Math.abs(processed.twoThetaDeg[index]! - value) < Math.abs(processed.twoThetaDeg[best]! - value)) best = index;
    return processed.rawIntensity[best]!;
  });
  return <svg aria-label="Selected local peak fit with components and residuals" className="xrd-stick-plot" role="img" viewBox={`0 0 ${width} ${height}`}>
    <line className="xrd-axis" x1={left} x2={width - right} y1={residualTop - 8} y2={residualTop - 8} /><line className="xrd-axis" x1={left} x2={width - right} y1={residualTop + 25} y2={residualTop + 25} />
    <polyline className="xrd-analysis-raw" fill="none" points={points(rawLocal)} />
    <polyline className="xrd-raw-line" fill="none" points={points(group.observedIntensity)} />
    {group.bestFit && <polyline className="xrd-fit-best" fill="none" points={points(group.bestFit)} />}
    {group.localBackground && <polyline className="xrd-analysis-baseline" fill="none" points={points(group.localBackground)} />}
    {Object.entries(group.componentCurves).map(([name, values]) => <polyline className="xrd-fit-component" fill="none" key={name} points={points(values)} />)}
    {residual.length > 0 && <polyline className="xrd-fit-residual" fill="none" points={points(residual, pry)} />}
    <text className="xrd-axis-label" x={left} y={height - 4}>Local 2θ (degrees) · residual below</text>
  </svg>;
}

export function XrdPeakAnalysisWorkspace({ database, measurementRecord, onAnalysisChange }: { readonly database: MaxStoichDatabase; readonly measurementRecord: StoredExperimentalXRDMeasurement; readonly onAnalysisChange?: (analysis: XRDPeakAnalysis | null) => void }) {
  const repository = useMemo(() => new XRDAnalysisRepository(database), [database]);
  const measurement = measurementRecord.measurement;
  const [processingConfig, setProcessingConfig] = useState<XRDProcessingConfig>(defaultProcessingConfig);
  const [preview, setPreview] = useState<ProcessedXRDRepresentation>();
  const [savedProcessed, setSavedProcessed] = useState<readonly StoredProcessedXRDRepresentation[]>([]);
  const [activeProcessed, setActiveProcessed] = useState<ProcessedXRDRepresentation>();
  const [detection, setDetection] = useState<XRDPeakDetectionResult>();
  const [analysis, setAnalysis] = useState<XRDPeakAnalysis>();
  const [savedAnalyses, setSavedAnalyses] = useState<readonly StoredXRDPeakAnalysis[]>([]);
  const [prominence, setProminence] = useState(Math.max(1e-9, (measurement.characterization.maxIntensity - measurement.characterization.minIntensity) * 0.05));
  const [minimumDistance, setMinimumDistance] = useState(0.1);
  const [manualCenter, setManualCenter] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Baseline and smoothing are off. Create a preview without changing the raw measurement.");
  const [showRaw, setShowRaw] = useState(true), [showBaseline, setShowBaseline] = useState(true), [showProcessed, setShowProcessed] = useState(true);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>();

  const refreshProcessed = useCallback(async () => setSavedProcessed(await repository.listProcessed(measurement.measurementId)), [repository, measurement.measurementId]);
  const refreshAnalyses = useCallback(async (processedId?: string) => setSavedAnalyses(processedId ? await repository.listAnalyses(processedId) : []), [repository]);
  useEffect(() => { queueMicrotask(() => { void refreshProcessed(); void refreshAnalyses(); }); }, [refreshProcessed, refreshAnalyses]);

  const createPreview = async () => {
    setPending(true); setMessage("Computing an unsaved processing preview…");
    try {
      const body = await postJson("/api/xrd/data/process", { parentMeasurementId: measurement.measurementId, rawArtifactSha256: measurement.rawArtifactSha256, twoThetaDeg: measurement.twoThetaDeg, intensity: measurement.intensity, processingConfig });
      const result = processedRepresentationSchema.parse(body); setPreview(result); setActiveProcessed(undefined); setDetection(undefined); setAnalysis(undefined); setMessage("Unsaved preview ready. Raw measurement arrays remain unchanged.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Processing failed."); } finally { setPending(false); }
  };
  const savePreview = async () => {
    if (!preview) return; setPending(true);
    try { await repository.saveProcessed(preview); setActiveProcessed(preview); setPreview(undefined); await refreshProcessed(); await refreshAnalyses(preview.processedRepresentationId); setMessage("Processing run saved as an immutable derived record."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Processing run could not be saved."); } finally { setPending(false); }
  };
  const openProcessed = async (stored: StoredProcessedXRDRepresentation) => { setActiveProcessed(stored.representation); setPreview(undefined); setDetection(undefined); setAnalysis(undefined); await refreshAnalyses(stored.id); setMessage("Saved processing run opened."); };
  const detectionConfig: XRDPeakDetectionConfig = { schemaVersion: "1.0.0", minimumProminence: prominence, minimumHeight: null, minimumDistanceDeg: minimumDistance, minimumWidthDeg: null, maximumWidthDeg: null };
  const runDetection = async () => {
    if (!activeProcessed) return; setPending(true);
    try {
      const body = await postJson("/api/xrd/peaks/detect", { processedRepresentationId: activeProcessed.processedRepresentationId, twoThetaDeg: activeProcessed.twoThetaDeg, analysisIntensity: activeProcessed.analysisIntensity, detectionConfig });
      const result = peakDetectionResultSchema.parse(body); setDetection(result); setAnalysis(undefined); setMessage(`Detected ${result.candidates.length} candidate peak${result.candidates.length === 1 ? "" : "s"}. Candidate positions are fitting seeds, not final centers.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Peak detection failed."); } finally { setPending(false); }
  };
  const fit = async (candidateOverride?: readonly XRDPeakCandidate[], edit?: string) => {
    if (!activeProcessed || !detection) return; setPending(true);
    const candidates = [...(candidateOverride ?? detection.candidates)];
    try {
      const body = await postJson("/api/xrd/peaks/fit", { parentProcessedRepresentationId: activeProcessed.processedRepresentationId, parentMeasurementId: measurement.measurementId, rawArtifactSha256: measurement.rawArtifactSha256, twoThetaDeg: activeProcessed.twoThetaDeg, analysisIntensity: activeProcessed.analysisIntensity, detectionConfig: detection.detectionConfig, fittingConfig: defaultFittingConfig, candidates, manualEdits: edit ? [edit] : [] });
      const result = peakAnalysisSchema.parse(body); setDetection({ ...detection, candidates }); setAnalysis(result); setMessage(`Fit ${result.fittedPeaks.filter((item) => item.diagnostics.success).length} of ${result.fittedPeaks.length} active candidate peaks. Inspect diagnostics before saving.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Peak fitting failed."); } finally { setPending(false); }
  };
  const addManual = () => {
    if (!detection || !activeProcessed) return; const center = Number(manualCenter); if (!Number.isFinite(center)) return;
    const sourceIndex = activeProcessed.twoThetaDeg.reduce((best, value, index) => Math.abs(value - center) < Math.abs(activeProcessed.twoThetaDeg[best]! - center) ? index : best, 0);
    const candidate: XRDPeakCandidate = { candidateId: `manual-${crypto.randomUUID()}`, approximateTwoThetaDeg: activeProcessed.twoThetaDeg[sourceIndex]!, approximateIntensity: activeProcessed.analysisIntensity[sourceIndex]!, prominence: 0, estimatedWidthDeg: null, sourceIndex, detectionConfigId: detection.detectionConfigId, status: "MANUAL_ADDED", manualWindowMinDeg: null, manualWindowMaxDeg: null };
    const candidates = [...detection.candidates, candidate]; setDetection({ ...detection, candidates }); setManualCenter(""); setMessage("Manual candidate added to unsaved editor state. Refit to estimate its center and width.");
  };
  const toggleExcluded = (candidate: XRDPeakCandidate) => {
    if (!detection) return; const status: XRDPeakCandidate["status"] = candidate.status === "EXCLUDED" ? "MANUAL_EDITED" : "EXCLUDED";
    const candidates = detection.candidates.map((item) => item.candidateId === candidate.candidateId ? { ...item, status } : item); setDetection({ ...detection, candidates }); setAnalysis(undefined);
  };
  const changeWindow = (candidate: XRDPeakCandidate) => {
    if (!detection) return; const lower = window.prompt("Fit-window minimum 2theta:", fmt(candidate.manualWindowMinDeg ?? candidate.approximateTwoThetaDeg - 0.5)); if (lower === null) return;
    const upper = window.prompt("Fit-window maximum 2theta:", fmt(candidate.manualWindowMaxDeg ?? candidate.approximateTwoThetaDeg + 0.5)); if (upper === null) return;
    const min = Number(lower), max = Number(upper); if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) { setMessage("A valid increasing fit window is required."); return; }
    const candidates = detection.candidates.map((item) => item.candidateId === candidate.candidateId ? { ...item, status: "MANUAL_EDITED" as const, manualWindowMinDeg: min, manualWindowMaxDeg: max } : item); setDetection({ ...detection, candidates }); setAnalysis(undefined);
  };
  const removeCandidate = (candidateId: string) => { if (!detection) return; setDetection({ ...detection, candidates: detection.candidates.filter((item) => item.candidateId !== candidateId) }); setAnalysis(undefined); setMessage("Candidate removed from unsaved editor state. Saved analyses remain unchanged."); };
  const saveAnalysis = async () => { if (!analysis) return; try { await repository.saveAnalysis(analysis); await refreshAnalyses(analysis.parentProcessedRepresentationId); onAnalysisChange?.(analysis); setMessage("Peak analysis saved as a new immutable record and is available for reference matching."); } catch (error) { setMessage(error instanceof Error ? error.message : "Analysis could not be saved."); } };
  const displayed = preview ?? activeProcessed;
  const selectedPeak = analysis?.fittedPeaks.find((item) => item.candidateId === selectedCandidateId);
  const selectedGroup = analysis?.fitGroups.find((item) => item.groupId === selectedPeak?.groupId);

  return <section className="xrd-panel" aria-labelledby="xrd-processing-title">
    <div className="xrd-section-heading"><div><h2 id="xrd-processing-title">Process and fit peaks</h2><p>Every saved result is a new derived record. Automatic peaks remain researcher-correctable.</p></div></div>
    <p aria-live="polite" className="xrd-status">{message}</p>
    <div className="xrd-stage3-grid"><fieldset><legend>Processing</legend>
      <label>Baseline <span aria-label="Baseline help: estimates a slowly varying background for subtraction from the derived signal." className="xrd-info" role="img">i</span><select aria-label="Baseline" value={processingConfig.baseline.enabled ? processingConfig.baseline.algorithm : "off"} onChange={(event) => setProcessingConfig({ ...processingConfig, baseline: { ...processingConfig.baseline, enabled: event.target.value !== "off", algorithm: event.target.value === "asls" ? "asls" : "arpls" } })}><option value="off">Off</option><option value="arpls">arPLS</option><option value="asls">AsLS</option></select><span className="xrd-help-text">Optional background estimate. Raw intensity is never overwritten.</span></label>
      <label>Smoothing <span aria-label="Smoothing help: reduces local noise in the derived signal and may change peak shape." className="xrd-info" role="img">i</span><select aria-label="Smoothing" value={processingConfig.smoothing.enabled ? "savitzky-golay" : "off"} onChange={(event) => setProcessingConfig({ ...processingConfig, smoothing: { ...processingConfig.smoothing, enabled: event.target.value !== "off" } })}><option value="off">Off</option><option value="savitzky-golay">Savitzky-Golay</option></select><span className="xrd-help-text">Optional Savitzky-Golay filter applied after baseline subtraction.</span></label>
      <details><summary>Advanced parameters</summary><label>Baseline λ<input min="1" onChange={(event) => setProcessingConfig({ ...processingConfig, baseline: { ...processingConfig.baseline, lam: Number(event.target.value) } })} type="number" value={processingConfig.baseline.lam} /></label>{processingConfig.baseline.algorithm === "asls" && <label>AsLS p<input max="0.999" min="0.001" onChange={(event) => setProcessingConfig({ ...processingConfig, baseline: { ...processingConfig.baseline, p: Number(event.target.value) } })} step="0.001" type="number" value={processingConfig.baseline.p} /></label>}<label>Smoothing window<input min="3" onChange={(event) => setProcessingConfig({ ...processingConfig, smoothing: { ...processingConfig.smoothing, windowLength: Number(event.target.value) } })} step="2" type="number" value={processingConfig.smoothing.windowLength} /></label><label>Polynomial order<input min="0" onChange={(event) => setProcessingConfig({ ...processingConfig, smoothing: { ...processingConfig.smoothing, polynomialOrder: Number(event.target.value) } })} type="number" value={processingConfig.smoothing.polynomialOrder} /></label></details>
      <div className="xrd-library-actions"><button className="ui-button" disabled={pending} onClick={() => void createPreview()} type="button">Preview processing</button>{preview && <button className="ui-button ui-button-primary" disabled={pending} onClick={() => void savePreview()} type="button">Save processing run</button>}</div>
      {preview && <strong className="xrd-unsaved">Unsaved preview</strong>}
    </fieldset><fieldset><legend>Saved processing runs</legend>{savedProcessed.length === 0 ? <p>None yet.</p> : savedProcessed.map((item) => <div className="xrd-saved-row" key={item.id}><button className="ui-button" onClick={() => void openProcessed(item)} type="button">Open {new Date(item.createdAt).toLocaleString()}</button><span>{item.representation.transformationOrder.join(" → ")}</span></div>)}</fieldset></div>
    {displayed && <><div className="xrd-overlay-controls"><label><input checked={showRaw} onChange={(event) => setShowRaw(event.target.checked)} type="checkbox" /> Raw</label><label><input checked={showBaseline} onChange={(event) => setShowBaseline(event.target.checked)} type="checkbox" /> Baseline</label><label><input checked={showProcessed} onChange={(event) => setShowProcessed(event.target.checked)} type="checkbox" /> Processed</label></div><AnalysisPlot analysis={analysis} detection={detection} processed={displayed} showBaseline={showBaseline} showProcessed={showProcessed} showRaw={showRaw} /></>}
    {activeProcessed && <div className="xrd-stage3-grid"><fieldset><legend>Peak detection</legend><label>Minimum prominence <span aria-label="Prominence help: minimum vertical separation between a candidate peak and its surrounding baseline context." className="xrd-info" role="img">i</span><input min="0" onChange={(event) => setProminence(Number(event.target.value))} step="any" type="number" value={prominence} /><span className="xrd-help-text">Higher values reject more low-contrast candidates.</span></label><label>Minimum spacing (degrees 2θ)<input min="0.000001" onChange={(event) => setMinimumDistance(Number(event.target.value))} step="any" type="number" value={minimumDistance} /></label><button className="ui-button" disabled={pending} onClick={() => void runDetection()} type="button">Detect peaks</button></fieldset><fieldset><legend>Manual correction</legend><label>Add peak at 2θ<input onChange={(event) => setManualCenter(event.target.value)} step="any" type="number" value={manualCenter} /></label><button className="ui-button" disabled={!detection} onClick={addManual} type="button">Add manual peak</button>{detection && <button className="ui-button ui-button-primary" disabled={pending || detection.candidates.every((item) => item.status === "EXCLUDED")} onClick={() => void fit(undefined, "Fit or refit current candidate editor state.")} type="button">Fit active peaks</button>}</fieldset></div>}
    {detection && <div className="xrd-peak-table-wrap"><h3>Peak candidates and fits</h3><table className="xrd-peak-table"><thead><tr><th>Status</th><th>Center 2θ</th><th>Center uncertainty</th><th>FWHM</th><th>Amplitude</th><th>Prominence</th><th>Fit quality</th><th>Source</th><th>Include</th><th>Window</th><th>Remove</th></tr></thead><tbody>{detection.candidates.map((candidate) => { const fitted = analysis?.fittedPeaks.find((item) => item.candidateId === candidate.candidateId); return <tr className={selectedCandidateId === candidate.candidateId ? "is-selected" : ""} key={candidate.candidateId} onClick={() => setSelectedCandidateId(candidate.candidateId)}><td>{candidate.status}</td><td>{fmt(fitted?.fittedCenterTwoThetaDeg ?? candidate.approximateTwoThetaDeg, 5)}</td><td>{fmt(fitted?.centerStderrDeg, 5)}</td><td>{fmt(fitted?.fwhmDeg, 5)}</td><td>{fmt(fitted?.amplitude, 4)}</td><td>{fmt(candidate.prominence, 4)}</td><td>{fitted ? fitted.diagnostics.success ? `Fit · R² ${fmt(fitted.diagnostics.rSquared, 4)}` : "Failed" : "Candidate"}</td><td>{candidate.status === "AUTO" ? "Automatic" : "Manual"}</td><td><input aria-label={`Include peak at ${fmt(candidate.approximateTwoThetaDeg)}`} checked={candidate.status !== "EXCLUDED"} onChange={() => toggleExcluded(candidate)} onClick={(event) => event.stopPropagation()} type="checkbox" /></td><td><button className="ui-button" onClick={(event) => { event.stopPropagation(); changeWindow(candidate); }} type="button">Edit</button></td><td><button className="ui-button" onClick={(event) => { event.stopPropagation(); removeCandidate(candidate.candidateId); }} type="button">Remove</button></td></tr>; })}</tbody></table>{analysis && <div className="xrd-library-actions"><button className="ui-button ui-button-primary" onClick={() => void saveAnalysis()} type="button">Save peak analysis</button></div>}</div>}
    {selectedGroup && activeProcessed && <div className="xrd-fit-inspection"><h3>Selected local fit</h3><FitInspectionPlot group={selectedGroup} processed={activeProcessed} /><dl className="xrd-pattern-metadata"><div><dt>Window</dt><dd>{fmt(selectedPeak?.fitWindowMinDeg)}° – {fmt(selectedPeak?.fitWindowMaxDeg)}°</dd></div><div><dt>Points</dt><dd>{selectedPeak?.pointCount}</dd></div><div><dt>Optimizer</dt><dd>{selectedPeak?.diagnostics.method ?? "Not available"}</dd></div><div><dt>Reduced χ²</dt><dd>{fmt(selectedPeak?.diagnostics.reducedChiSquare, 6)}</dd></div><div><dt>Components</dt><dd>{selectedGroup.candidateIds.length} peak{selectedGroup.candidateIds.length === 1 ? "" : "s"} + {analysis?.fittingConfig.localBackground} background</dd></div><div><dt>Result</dt><dd>{selectedPeak?.diagnostics.message}</dd></div></dl></div>}
    {savedAnalyses.length > 0 && <div><h3>Saved analysis revisions</h3><div className="xrd-results-list">{savedAnalyses.map((item) => <article key={item.id}><div><h3>{new Date(item.createdAt).toLocaleString()}<small>{item.analysis.fittedPeaks.length} fitted records · {item.analysis.excludedCandidateIds.length} excluded</small></h3></div><button className="ui-button" onClick={() => { setAnalysis(item.analysis); onAnalysisChange?.(item.analysis); setDetection({ schemaVersion: "1.0.0", processedRepresentationId: item.analysis.parentProcessedRepresentationId, detectionConfig: item.analysis.detectionConfig, detectionConfigId: item.analysis.candidatePeaks[0]?.detectionConfigId ?? "saved", candidates: item.analysis.candidatePeaks, warnings: item.analysis.warnings, scientificProvenance: item.analysis.scientificProvenance }); }} type="button">Open analysis</button></article>)}</div></div>}
  </section>;
}
