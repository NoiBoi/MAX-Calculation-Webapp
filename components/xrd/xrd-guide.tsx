import Link from "next/link";

export function XrdGuide() {
  return <article className="xrd-guide" id="xrd-guide">
    <div className="xrd-guide-intro">
      <div>
        <span className="xrd-step-kicker">XRD help</span>
        <h1>XRD analysis guide</h1>
        <p>Use this workflow to preserve the measurement, review fitted peaks, select a crystallographic reference, and refine supported lattice parameters.</p>
      </div>
      <Link className="ui-button ui-button-primary" href="/xrd">Back to XRD workspace</Link>
    </div>

    <section className="xrd-panel" aria-labelledby="guide-workflow">
      <h2 id="guide-workflow">XRD workflow</h2>
      <p className="xrd-guide-flow">Import <span aria-hidden="true">-&gt;</span> Process <span aria-hidden="true">-&gt;</span> Peaks <span aria-hidden="true">-&gt;</span> Reference <span aria-hidden="true">-&gt;</span> Match <span aria-hidden="true">-&gt;</span> Lattice <span aria-hidden="true">-&gt;</span> Export</p>
      <p>Each saved result points to its exact parent records. Review every automated peak and hkl proposal before using it in refinement.</p>
    </section>

    <div className="xrd-guide-grid">
      <section className="xrd-panel"><h2>Import</h2><p>Import text-based CSV, TSV, TXT, XY, XYE, or DAT data. MAXCalc stores the exact uploaded bytes and a SHA-256 hash before parsing. Plot decimation affects only the preview. It does not alter the stored arrays.</p></section>
      <section className="xrd-panel"><h2>Processing</h2><p>Baseline subtraction and smoothing are optional and off by default. arPLS and AsLS estimate a baseline. Savitzky-Golay smoothing reduces local noise in a derived signal. Preview parameters before saving a processing run.</p></section>
      <section className="xrd-panel"><h2>Peak fitting</h2><p>SciPy proposes peak candidates. LMFit fits local pseudo-Voigt components with a local background. Add, exclude, or refit candidates and inspect residuals. Automatic detection and optimizer completion do not replace researcher review.</p></section>
      <section className="xrd-panel"><h2>References</h2><p>Use a COD structure, an uploaded user or LMSL CIF, or a saved empirical LMSL reference. CIF structures supply calculated hkl reflections. Empirical patterns remain measured records and can supply hkl data only through an explicit structure association.</p></section>
      <section className="xrd-panel"><h2>Matching</h2><p>MAXCalc proposes global one-to-one matches primarily from peak position within the selected tolerance. The experimental wavelength must match the calculated reference wavelength. Review ambiguity, unmatched peaks, and every accepted hkl assignment.</p></section>
      <section className="xrd-panel"><h2>Lattice refinement</h2><p>Refinement supports cubic, tetragonal, hexagonal, and orthorhombic systems. It depends on confirmed hkl assignments and enough independent reflections to identify the fitted terms. Optional zero shift adds a correlated parameter and needs suitable data.</p></section>
      <section className="xrd-panel"><h2>Reproducibility</h2><p>Saved records retain hashes, parameters, manual edits, parent identifiers, timestamps, reference revisions, and scientific-library versions. Project ZIP export transfers the saved lineage. Figure exports keep display normalization separate from scientific records.</p></section>
      <section className="xrd-panel"><h2>What MAXCalc does not do</h2><p>MAXCalc does not perform Rietveld refinement, Pawley or Le Bail fitting, quantitative phase fractions, blind unknown-phase identification, general unknown indexing, crystallite-size analysis, or structure solution.</p></section>
    </div>

    <section className="xrd-panel" aria-labelledby="guide-methods">
      <h2 id="guide-methods">Methods and software</h2>
      <dl className="xrd-method-list">
        <div><dt>Reference patterns</dt><dd>pymatgen</dd></div>
        <div><dt>Structure source</dt><dd>Crystallography Open Database or supplied CIF</dd></div>
        <div><dt>Baseline</dt><dd>pybaselines arPLS or AsLS</dd></div>
        <div><dt>Peak detection</dt><dd>SciPy</dd></div>
        <div><dt>Peak fitting</dt><dd>LMFit pseudo-Voigt models</dd></div>
        <div><dt>Matching and refinement</dt><dd>SciPy optimization</dd></div>
      </dl>
      <p>Calculated intensities are theoretical and are not quantitatively equivalent to measured intensities. Fit uncertainty is conditional on the selected model and available covariance.</p>
      <a className="ui-button" href="https://github.com/NoiBoi/MAX-Calculation-Webapp/blob/main/docs/XRD.md" rel="noreferrer" target="_blank">Open detailed technical documentation</a>
    </section>
  </article>;
}
