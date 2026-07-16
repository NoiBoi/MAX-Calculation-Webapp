"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { paginatePrintableRecipes, readPrintJob, type PrintJob, type PrintableRecipeEntry } from "@/lib/print/print-model";
import { CreatorCredit } from "@/components/site/creator-credit";
import { SiteBrand } from "@/components/site/site-brand";

function WrappedFormula({ value }: { value: string }) {
  const parts = value.split(/(?=[A-Z])/u);
  return <>{parts.map((part, index) => <span key={`${index}-${part}`}>{index > 0 && <wbr />}{part}</span>)}</>;
}

function FormulaBlock({ entry, job }: { entry: Extract<PrintableRecipeEntry, { summary: object }>; job: PrintJob }) {
  const { summary } = entry, style = job.settings.formulaStyle;
  return <div className="print-formulas">
    {style !== "adjusted-feed-only" && <p><span>Target</span><strong><WrappedFormula value={summary.targetFormula} /></strong></p>}
    {style === "all-formulas" && <><p><span>Ideal</span><strong><WrappedFormula value={summary.idealFormula} /></strong></p><p><span>Intended</span><strong><WrappedFormula value={summary.intendedFeedFormula} /></strong></p></>}
    <p className="adjusted"><span>Adjusted intended feed</span><strong><WrappedFormula value={summary.adjustedFeedFormula} /></strong></p>
    {style === "all-formulas" && <p><span>Realized after weighing</span><strong><WrappedFormula value={summary.realizedFormula} /></strong></p>}
  </div>;
}

function RecipeCard({ entry, job }: { entry: PrintableRecipeEntry; job: PrintJob }) {
  if (entry.unavailable) return <article className="print-recipe unavailable"><h2>{entry.unavailable.title}</h2><p>{entry.unavailable.sourceStatus} · {entry.unavailable.validationStatus}</p><strong>No valid weighing result</strong><p>{entry.unavailable.reason}</p></article>;
  const { summary } = entry, { fields } = job.settings;
  const warnings = [...(fields.actionRequiredWarnings ? summary.actionRequiredMessages : []), ...(fields.minorAdvisories && job.settings.warningDetail !== "action-required-only" ? summary.minorAdvisoryMessages : [])];
  return <article className="print-recipe">
    <header><h2>{summary.title}</h2>{fields.revision && <p>{summary.sourceStatus}</p>}</header>
    {fields.adjustedFeedFormula && <FormulaBlock entry={entry} job={job} />}
    {(fields.targetBatchMass || fields.batchBasis) && <p className="batch">{fields.targetBatchMass && <><strong>{summary.batchMass} g</strong>{fields.batchBasis && " · "}</>}{fields.batchBasis && summary.batchBasis}</p>}
    <table><thead><tr>{fields.precursorName && <th>Precursor</th>}{fields.precursorFormula && <th>Formula</th>}{fields.molarRatio && <th>Molar ratio</th>}{fields.purity && <th>Purity</th>}{fields.molarMass && <th>Molar mass</th>}{fields.atomicRadius && <th>Atomic radius</th>}<th className="mass">Final mass</th></tr></thead><tbody>{summary.precursors.map((item) => <tr key={item.id}>{fields.precursorName && <th>{item.displayName}</th>}{fields.precursorFormula && <td className="formula"><WrappedFormula value={item.formula} /></td>}{fields.molarRatio && <td>{item.molarQuantity}</td>}{fields.purity && <td>{item.purityPercent}%</td>}{fields.molarMass && <td>{item.molarMass} g/mol</td>}{fields.atomicRadius && <td>{item.atomicRadius}</td>}<td className="mass">{item.finalMass} g</td></tr>)}</tbody><tfoot><tr><th colSpan={Math.max(1, Number(fields.precursorName) + Number(fields.precursorFormula) + Number(fields.molarRatio) + Number(fields.purity) + Number(fields.molarMass) + Number(fields.atomicRadius))}>Total</th><td className="mass">{summary.totalMass} g</td></tr></tfoot></table>
    {fields.arithmeticVerificationStatus && <p className="verification"><strong>{summary.verificationSummary.statusLabel}</strong>{job.settings.verificationDetail !== "status" && <> · Largest residual {summary.verificationSummary.largestElementalResidual}</>}</p>}
    {warnings.length > 0 && <section className="warnings"><strong>Action / review</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}
    {fields.radiusSummary && summary.radiusSites.length > 0 && <p className="radius">Radius screening: {summary.radiusSites.map((site) => `${site.siteLabel} ${site.mismatchPercent ?? "unavailable"}%`).join(" · ")}</p>}
    {(fields.engineVersion || fields.datasetVersions) && <footer>{fields.engineVersion && `Engine ${summary.engineVersion}`}{fields.engineVersion && fields.datasetVersions && " · "}{fields.datasetVersions && `Atomic weights ${summary.atomicWeightDataVersion}`}</footer>}
    {fields.signatureLines && <div className="signatures"><span>Prepared by ____________________</span><span>Date __________</span><span>Checked by ____________________</span><span>Furnace / batch ID __________</span></div>}
  </article>;
}

export function PrintRoot() {
  const search = useSearchParams(), id = search.get("job") ?? "";
  const [job] = useState<PrintJob | undefined>(() => readPrintJob(id));
  const [ready, setReady] = useState(false);
  const pages = useMemo(() => job ? paginatePrintableRecipes(job) : [], [job]);
  useEffect(() => {
    if (!job) return;
    let active = true;
    void document.fonts.ready.then(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))).then(() => { if (!active) return; setReady(true); document.documentElement.dataset.printReady = "true"; window.print(); });
    const close = () => window.close(); window.addEventListener("afterprint", close);
    return () => { active = false; window.removeEventListener("afterprint", close); };
  }, [job]);
  if (!job) return <main className="print-error"><h1>Print content unavailable</h1><p>The print job expired or could not be read. Return to the calculator and try Print again.</p></main>;
  const configured = job.singleRecipeDetailed ? 1 : job.settings.recipesPerPage;
  const size = job.settings.paperSize === "letter" ? "Letter" : "A4";
  return <main className="dedicated-print-root" data-density={job.settings.density} data-orientation={job.settings.orientation} data-paper-size={job.settings.paperSize} data-print-ready={ready ? "true" : "false"} data-recipes-per-page={configured}>
    <style>{`@page { size: ${size} ${job.settings.orientation}; margin: 9mm; }`}</style>
    {pages.map((page) => <section className={`print-page print-grid-${page.entries.length} configured-${configured}`} key={page.index}>
      <div className="print-page-header">{job.settings.showApplicationName && <strong className="page-app"><SiteBrand variant="print" /></strong>}<span>{job.title}</span></div>
      {page.notice && <p className="packing-notice">{page.notice}</p>}
      <div className="print-recipe-grid">{page.entries.map((entry) => <RecipeCard entry={entry} job={job} key={entry.id} />)}</div>
      <div className="print-page-footer"><CreatorCredit className="print-credit" /><div className="page-meta">{job.settings.showPrintDate && <span>{new Date(job.createdAt).toLocaleDateString()}</span>}{job.settings.showPageNumbers && <span>Page {page.index} of {pages.length}</span>}</div></div>
    </section>)}
  </main>;
}
