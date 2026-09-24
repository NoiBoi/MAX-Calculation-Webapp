import { AppHeader, PageContainer } from "@/components/site/app-header";

const PLANNED_CAPABILITIES = [
  ["Import", "Diffraction file import and dataset provenance"],
  ["Peak detection", "Automated peak identification and review"],
  ["Phase matching", "COD and reference-database matching"],
  ["Lattice parameters", "Crystal-system-aware parameter analysis"],
  ["Plot / export", "Publication-ready diffraction figures"],
] as const;

export default function XrdPage() {
  return <>
    <AppHeader activeSection="xrd" status="Future diffraction workspace" title="XRD Analysis" />
    <main><PageContainer width="readable">
      <section className="workspace-landing xrd-landing" aria-labelledby="xrd-title">
        <span className="workspace-landing-kicker">In development</span>
        <h2 id="xrd-title">XRD Analysis</h2>
        <p>Diffraction analysis tools are currently in development. This workspace will keep import, interpretation, calculation, and publication output together without introducing placeholder scientific results.</p>
        <div className="xrd-capability-list" aria-label="Planned XRD capabilities">
          {PLANNED_CAPABILITIES.map(([name, description], index) => <article key={name}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{name}</h3><p>{description}</p></div></article>)}
        </div>
      </section>
    </PageContainer></main>
  </>;
}
