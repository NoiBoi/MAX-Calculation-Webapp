import { useId } from "react";
import { DEFAULT_ATOMIC_RADIUS_REGISTRY, RADIUS_DESCRIPTOR_DISCLAIMER, RADIUS_SITE_MODEL_REQUIRED_MESSAGE, calculateSiteRadiusDescriptor, type RadiusDescriptorConfig, type SiteComposition } from "@max-stoich/chemistry-engine";
import { formatDescriptor, formatPercent, formatRadiusPm } from "@/lib/presentation/scientific-format";

export function AtomicRadiusPanel({ siteModel, config, onConfigChange, onConfigureSites }: { readonly siteModel?: SiteComposition; readonly config?: RadiusDescriptorConfig; readonly onConfigChange: (config: RadiusDescriptorConfig) => void; readonly onConfigureSites: () => void }) {
  const panelId = useId();
  const selectDataset = (siteId: string, datasetId: string) => {
    const remaining = (config?.siteDatasets ?? []).filter((item) => item.siteId !== siteId);
    const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === datasetId);
    onConfigChange({ schemaVersion: "2.0.0", enabled: true, siteDatasets: dataset ? [...remaining, { siteId, datasetId, datasetVersion: dataset.datasetVersion, datasetDigest: dataset.digest, overrides: [] }] : remaining });
  };

  return <section aria-labelledby={`${panelId}-heading`} className="radius-descriptors">
    <h2 className="font-semibold" id={`${panelId}-heading`}>Site descriptors</h2>
    {!siteModel && <div className="mt-2 rounded border border-blue-300 bg-blue-50 p-3 text-sm"><p>{RADIUS_SITE_MODEL_REQUIRED_MESSAGE}</p><button className="mt-2 rounded bg-blue-800 px-3 py-2 font-semibold text-white" onClick={onConfigureSites}>Configure sites</button></div>}
    {siteModel && <div className="radius-site-list">{siteModel.sites.map((site) => {
      const selection = config?.siteDatasets.find((item) => item.siteId === site.id);
      const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === selection?.datasetId);
      const result = dataset ? calculateSiteRadiusDescriptor(siteModel, site.id, dataset, selection?.overrides ?? []) : undefined;
      return <article className="radius-site" key={site.id}>
        <div className="radius-site-heading"><div><h3 className="font-semibold">{site.label ?? `${site.id} site`}</h3><p className="text-xs text-slate-600">Vacancy {formatPercent(site.vacancyFraction)} · multiplicity {site.multiplicity}</p></div><label className="text-xs font-medium" htmlFor={`${panelId}-dataset-${site.id}`}>Radius dataset<select className="ui-select" id={`${panelId}-dataset-${site.id}`} onChange={(event) => selectDataset(site.id, event.target.value)} value={selection?.datasetId ?? ""}><option value="">No dataset selected</option><optgroup label="Source-verified screening datasets">{DEFAULT_ATOMIC_RADIUS_REGISTRY.usableDatasets.map((item) => <option key={item.datasetId} value={item.datasetId}>{item.name}</option>)}</optgroup><optgroup label="Provisional — unavailable for aggregates">{DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.filter((item) => !DEFAULT_ATOMIC_RADIUS_REGISTRY.usableDatasets.some((usable) => usable.datasetId === item.datasetId)).map((item) => <option disabled key={item.datasetId} value={item.datasetId}>{item.name}</option>)}</optgroup></select></label></div>
        {dataset && <details className="radius-provenance"><summary>Dataset source and definition</summary><p>{dataset.definitionDetail}</p><p>Version {dataset.datasetVersion} · {dataset.approval.status} · laboratory approval: {dataset.approval.labApproval}</p><p><a className="underline" href={dataset.source.url} rel="noreferrer" target="_blank">{dataset.source.title}</a>{dataset.source.doi ? ` · DOI ${dataset.source.doi}` : ""}</p></details>}
        <ul className="radius-occupants">{site.occupants.map((occupant) => { const resolved = result?.occupants.find((item) => item.element === occupant.element); return <li className={`radius-occupant ${resolved?.missing ? "radius-occupant-missing" : ""}`} key={occupant.element}><span className="font-semibold">{occupant.element}</span><span className="ml-2">{formatPercent(occupant.fraction)}</span><p className="text-xs text-slate-600">{resolved?.radiusPm && dataset ? `${formatRadiusPm(resolved.radiusPm)} · ${dataset.definition} · ${dataset.approval.status}` : dataset ? "No value in selected dataset" : "Select one dataset for this site"}</p></li>; })}</ul>
        {result?.available && <dl className="radius-statistics"><div><dt className="text-xs text-slate-600">Mean occupied radius</dt><dd className="font-mono">{formatRadiusPm(result.meanRadiusPm!)}</dd></div><div><dt className="text-xs text-slate-600">Minimum / maximum</dt><dd className="font-mono">{formatRadiusPm(result.minimumRadiusPm!)} / {formatRadiusPm(result.maximumRadiusPm!)}</dd></div><div><dt className="text-xs text-slate-600">Range</dt><dd className="font-mono">{formatRadiusPm(result.rangeRadiusPm!)}</dd></div><div><dt className="text-xs text-slate-600">Weighted standard deviation</dt><dd className="font-mono">{formatRadiusPm(result.standardDeviationPm!)}</dd></div><div><dt className="text-xs text-slate-600">Atomic-size mismatch δ</dt><dd className="font-mono">{formatDescriptor(result.mismatchPercent!, "%")}</dd></div></dl>}
        {result && !result.available && <p className="mt-3 rounded border border-amber-500 bg-amber-50 p-2 text-sm font-medium">Aggregate unavailable. Missing or ambiguous: {result.missingElements.join(", ")}. No occupant was dropped or renormalized away.</p>}
      </article>;
    })}</div>}
    <p className="radius-qualification">{RADIUS_DESCRIPTOR_DISCLAIMER}</p>
  </section>;
}
