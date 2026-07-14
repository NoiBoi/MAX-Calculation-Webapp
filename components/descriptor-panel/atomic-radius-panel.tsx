import { DEFAULT_ATOMIC_RADIUS_REGISTRY, RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE, RADIUS_SITE_MODEL_REQUIRED_MESSAGE, assessRadiusDescriptorAvailability, type RadiusDescriptorConfig, type SiteComposition } from "@max-stoich/chemistry-engine";

export function AtomicRadiusPanel({ siteModel, config }: { readonly siteModel?: SiteComposition; readonly config?: RadiusDescriptorConfig }) {
  const availability = assessRadiusDescriptorAvailability(siteModel, DEFAULT_ATOMIC_RADIUS_REGISTRY, config?.datasetId);
  return <section aria-labelledby="atomic-radii-heading" className="mt-5 rounded border border-amber-300 bg-amber-50 p-4">
    <h2 className="font-semibold" id="atomic-radii-heading">Atomic radii and site descriptors</h2>
    <p className="mt-2 font-semibold" role="status">{RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE}</p>
    {!siteModel && <p className="mt-2 text-sm">{RADIUS_SITE_MODEL_REQUIRED_MESSAGE}</p>}
    {siteModel && <div className="mt-3"><h3 className="text-sm font-semibold">Explicit crystallographic sites</h3><ul className="mt-1 text-sm">{siteModel.sites.map((site) => <li key={site.id}><strong>{site.label ?? `${site.id} site`}</strong>: {site.occupants.map((item) => `${item.element} ${item.fraction}`).join(", ")} · vacancy {site.vacancyFraction} · multiplicity {site.multiplicity}</li>)}</ul></div>}
    <label className="mt-3 block text-sm font-medium">Atomic-radius dataset<select aria-label="Atomic-radius dataset" className="mt-1 min-h-10 w-full rounded border px-2" disabled value=""><option value="">No approved dataset installed</option></select></label>
    <p className="mt-3 text-sm">Required approval action: install one internally consistent dataset with a named radius definition, primary source and edition, picometre units, coordination/oxidation/spin policies, missing-value policy, named reviewer, review date, version, and verified digest.</p>
    <p className="mt-2 text-sm">No values are inferred, converted, imputed, or combined across radius definitions. Overrides remain disabled until a base definition is approved.</p>
    <p className="mt-2 font-semibold">Screening descriptor only. It is not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success.</p>
    <p className="sr-only">Descriptor availability status: {availability.status}</p>
  </section>;
}
