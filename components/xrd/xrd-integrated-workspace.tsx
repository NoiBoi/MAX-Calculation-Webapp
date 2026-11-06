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

export function XrdIntegratedWorkspace() {
  const [analysis, setAnalysis] = useState<XRDPeakAnalysis | null>(null);
  const [pattern, setPattern] = useState<CalculatedXRDPattern | null>(null);
  const [libraryReference, setLibraryReference] = useState<z.infer<typeof xrdReferenceIdentitySchema> | null>(null);
  const [area, setArea] = useState<"measurements" | "references" | "analyze">("measurements");
  return <div className="xrd-workspace">
    <nav aria-label="XRD workspace areas" className="section-index"><button aria-current={area==="measurements"?"page":undefined} onClick={()=>setArea("measurements")} type="button">Measurements</button><button aria-current={area==="references"?"page":undefined} onClick={()=>setArea("references")} type="button">References</button><button aria-current={area==="analyze"?"page":undefined} onClick={()=>setArea("analyze")} type="button">Analysis</button></nav>
    {area==="measurements"&&<XrdExperimentalWorkspace onAnalysisChange={(value)=>{setAnalysis(value);if(value)setArea("analyze");}} />}
    {area==="references"&&<><section className="xrd-workspace-divider" aria-labelledby="xrd-reference-area-title"><h2 className="sr-only" id="xrd-reference-area-title">References</h2><XrdReferenceWorkspace onPatternChange={(value)=>{setPattern(value);setLibraryReference(null);}} /></section><XrdReferenceLibrary activeAnalysis={analysis} candidatePattern={pattern} onSelect={(selection)=>{setPattern(selection.pattern);setLibraryReference({referenceId:selection.referenceId,revisionId:selection.revisionId,revisionNumber:selection.revisionNumber});setArea("analyze");}} /></>}
    {area==="analyze"&&<><section className="xrd-panel xrd-lineage"><h2>Analysis lineage</h2><dl className="xrd-pattern-metadata xrd-analysis-inputs"><div><dt>Peak analysis</dt><dd title={analysis?.peakAnalysisId}>{analysis?`${analysis.fittedPeaks.length} fitted peaks · ${new Date(analysis.createdAt).toLocaleString()}`:"Select a saved peak analysis in Measurements"}</dd></div><div><dt>Reference</dt><dd>{pattern?`${pattern.reference.formula} · ${libraryReference?`library revision ${libraryReference.revisionNumber}`:`${pattern.reference.sourceType} ${pattern.reference.sourceId}`}`:"Select a reference structure in References"}</dd></div>{pattern && <div><dt>Reference wavelength</dt><dd>{pattern.radiation.wavelengthAngstrom} Å</dd></div>}</dl></section><XrdReferenceAnalysisWorkspace analysis={analysis} key={`${analysis?.peakAnalysisId ?? "none"}:${pattern?.reference.cifSha256 ?? "none"}:${libraryReference?.revisionId ?? "direct"}`} libraryReference={libraryReference} pattern={pattern} /><XrdStage6Workspace analysis={analysis} onImportedAnalysis={(value)=>setAnalysis(value)} pattern={pattern} /></>}
  </div>;
}
