"use client";

import { useState } from "react";
import type { CalculatedXRDPattern } from "@/lib/xrd/schemas";
import type { XRDPeakAnalysis } from "@/lib/xrd/stage3";
import { XrdExperimentalWorkspace } from "./xrd-experimental-workspace";
import { XrdReferenceWorkspace } from "./xrd-reference-workspace";
import { XrdReferenceAnalysisWorkspace } from "./xrd-reference-analysis-workspace";
import { XrdReferenceLibrary } from "./xrd-reference-library";
import type { z } from "zod";
import { xrdReferenceIdentitySchema } from "@/lib/xrd/references";
import { XrdStage6Workspace } from "./xrd-stage6-workspace";
import Link from "next/link";

export function XrdIntegratedWorkspace() {
  const [analysis, setAnalysis] = useState<XRDPeakAnalysis | null>(null);
  const [pattern, setPattern] = useState<CalculatedXRDPattern | null>(null);
  const [libraryReference, setLibraryReference] = useState<z.infer<typeof xrdReferenceIdentitySchema> | null>(null);
  const [area, setArea] = useState<"measurements" | "references" | "analyze">("measurements");
  return <div className="xrd-workspace">
    <nav aria-label="XRD workspace areas" className="xrd-workspace-tabs"><button aria-current={area==="measurements"?"page":undefined} className="ui-button" onClick={()=>setArea("measurements")} type="button">Measurements</button><button aria-current={area==="references"?"page":undefined} className="ui-button" onClick={()=>setArea("references")} type="button">References</button><button aria-current={area==="analyze"?"page":undefined} className="ui-button" onClick={()=>setArea("analyze")} type="button">Analyze</button><Link className="ui-button" href="/xrd/guide">Guide</Link></nav>
    {area==="measurements"&&<XrdExperimentalWorkspace onAnalysisChange={(value)=>{setAnalysis(value);if(value)setArea("analyze");}} />}
    {area==="references"&&<><section className="xrd-workspace-divider" aria-labelledby="xrd-reference-area-title"><div><span className="xrd-step-kicker">Reference workflow</span><h2 id="xrd-reference-area-title">Search, import, and curate references</h2><p>COD and CIF structures provide calculated hkl data. Empirical records preserve measured patterns and can link to a structure explicitly.</p></div><XrdReferenceWorkspace onPatternChange={(value)=>{setPattern(value);setLibraryReference(null);}} /></section><XrdReferenceLibrary activeAnalysis={analysis} candidatePattern={pattern} onSelect={(selection)=>{setPattern(selection.pattern);setLibraryReference({referenceId:selection.referenceId,revisionId:selection.revisionId,revisionNumber:selection.revisionNumber});setArea("analyze");}} /></>}
    {area==="analyze"&&<><section className="xrd-panel"><span className="xrd-step-kicker">Selected lineage</span><h2>Import → process → peaks → reference → match → lattice → figure</h2><dl className="xrd-pattern-metadata"><div><dt>Peak analysis</dt><dd>{analysis?`${analysis.fittedPeaks.length} fitted peak record(s) · ${new Date(analysis.createdAt).toLocaleString()}`:"Select a saved peak analysis in Measurements"}</dd></div><div><dt>Reference</dt><dd>{pattern?`${pattern.reference.formula} · ${libraryReference?`library revision ${libraryReference.revisionNumber}`:`direct ${pattern.reference.sourceType}`}`:"Select a direct or saved structure in References"}</dd></div></dl><p className="xrd-plot-note">Exact IDs, hashes, configurations, library versions, and timestamps remain available in saved result details.</p></section><XrdReferenceAnalysisWorkspace analysis={analysis} key={`${analysis?.peakAnalysisId ?? "none"}:${pattern?.reference.cifSha256 ?? "none"}:${libraryReference?.revisionId ?? "direct"}`} libraryReference={libraryReference} pattern={pattern} /><XrdStage6Workspace analysis={analysis} onImportedAnalysis={(value)=>setAnalysis(value)} pattern={pattern} /></>}
  </div>;
}
