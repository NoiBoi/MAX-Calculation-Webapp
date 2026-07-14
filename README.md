# MAX Stoich

The calculator includes a paper-friendly balance-side weighing summary. General recipe comparison starts empty, can import several saved recipes with the same or different targets at once, and offers an ordered comparison summary for copying or printing.

MAX Stoich is a local, one-screen MAX-phase precursor calculator. It turns an explicit target and precursor route into auditable final gross weighing masses using the framework-independent chemistry engine.

## Run the calculator

```text
npm install
npm run dev
```

Open `http://localhost:3000/`; the primary calculator is the landing page and `/workspace` remains a compatible direct link. The feature demo and tutorial is a clearly secondary development reference at `/demo`. Use `npm run check` for type checking, linting, and all unit/scientific tests; use `npm run test:e2e` for browser workflows.

## Current scientific scope

The application supports formula parsing, explicit 211/312/413 site models, exact elemental matrices and constrained precursor solving, three batch-mass bases, elemental and precursor adjustments, molar masses, purity, retained handling loss, yield, final balance rounding, realized composition, residuals, warnings, and a complete trace.

Built-in examples include Ti₂AlN, Ti₃AlC₂, Ti₄AlN₃, Nb₂AlN, explicit Ti/Nb mixed M-site material, and explicit C/N mixed X-site material. Each example shows its validation status. They are synthetic or hand-audited arithmetic fixtures; none is represented as an experimentally preferred or laboratory-approved synthesis route.

The scientific reference registry records 20 required cases and their source, tolerance, and reviewer status. Spreadsheet comparison is manual and documented in `docs/SPREADSHEET_COMPARISON.md`; spreadsheets are not runtime dependencies.

## Current workflow

The calculator provides standard and advanced modes, direct route editing, live local calculation, stale-result protection, warnings, final weighing masses, summary, matrix/solver diagnostics, trace, and keyboard shortcuts. `Alt+ArrowUp` and `Alt+ArrowDown` move between precursor formula fields without changing ordinary caret behavior. Valid working state is recovered automatically after refresh or browser closure, including the authoritative direct aluminum-feed coefficient.

Use **Save** to review or edit the recipe name, validation status, revision action, and optional revision note before committing. A scientific change creates a new immutable revision; a name-only change updates metadata without rewriting snapshots. The workspace is marked saved only after the transaction succeeds. Autosave protects working state but never silently creates scientific revisions. The Recipes panel opens, renames, duplicates, archives, deletes, shows revision history, and opens structured searchable experimental notes. Notes support categories, tags, multiline plain text, experiment/operator metadata, and optional revision attachment without mutating the attached snapshot. Historical snapshots display the saved engine result exactly; recalculation is a deliberate unsaved action. The Routes panel saves and reapplies immutable precursor-route revisions without retroactively changing recipes.

Current valid results can be copied as tab-delimited weighing rows, exported as tidy UTF-8 CSV or structured JSON, or printed as a preparation sheet. Weighing summaries show the final intended precursor quantity in `mol precursor / mol target formula` beside final mass, with exact rational detail retained where available. Exact rational solver quantities remain structural in JSON and have separate exact/approximation CSV columns. Ordinary weighing CSV/JSON exports exclude private recipe notes; the full local backup includes them. Stale or invalid working results cannot be exported.

## Comparison, layouts, and local data

Use **Compare routes** to evaluate two to four independently editable precursor scenarios against one locked target. Differences use canonical compositions and existing engine results; summaries do not predict which route will synthesize successfully. A preferred scenario can be saved as an independent recipe or route without changing its source.

**Layouts & data** provides tested layout presets and bounded local user layouts. Layout changes never store or alter scientific state. The same panel creates manifest-backed full backups, previews merge or replace restores, reports conflicts, and imports only MAX Stoich-owned calculation, recipe, route, comparison, or backup JSON. Replace is confirmed and transactionally protected by a safety backup. Tampered, future, malformed, oversized, and arbitrary files are blocked before database writes.

## Local data and offline limitations

Scientific records are stored in IndexedDB in the current browser profile. They are device-, browser-, origin-, and profile-specific: there is no account, cloud sync, or multi-user backup. Clearing site data, using a temporary/private profile, changing origins, or uninstalling the profile can remove access. Create and download a verified backup regularly.

Once a page is loaded, calculation, local persistence, comparison state already loaded in that page, backup generation, and export have no network dependency. This release does not install a service worker, so opening a route that was not already loaded may fail during a fully offline session. Automated browser coverage is Chromium; Firefox and WebKit support is not claimed until configured and run.

To reset during development, close every app tab and remove the site’s stored data (`max-stoich-local`) through the browser’s site-data/developer storage controls. This is destructive and deletes recipes, routes, revisions, snapshots, and recovery state; export needed records first. Migration failures never trigger automatic reset.

Persistence internals and export contracts are documented in `docs/LOCAL_PERSISTENCE_ARCHITECTURE.md`.

Cloud collaboration, descriptors, inventory, cost, phase prediction, and route recommendations are not implemented. Descriptors are visibly unavailable because no laboratory-approved atomic-radius dataset exists.

**Release status: Laboratory validation in progress.** This is not a laboratory-approved system. Approval requires the completed versioned record in `docs/LAB_ACCEPTANCE_RESULTS_TEMPLATE.md`, approved reference cases, and a named reviewer.

Fresh use starts with a genuinely blank calculation. Open More → Start or reset to create an unsaved copy of an immutable example. The result area separates action-required issues, collapsed minor advisories, and calculation details; ordinary values are human-formatted while exports and snapshots remain lossless.

Atomic data now include all 118 element symbols from CIAAW 2024 (84 usable standard calculation values; explicit absence for the rest). Advanced explicit-site workflows install Teatum CN12 metallic and Cordero 2008 covalent radii as source-verified screening data; Rahm 2016 neutral-isodensity radii are installed provisionally. None is labeled laboratory approved. Radius mismatch is a screening descriptor, not a prediction of stress, phase stability, or synthesis success.
# Atomic-radius data gate

The advanced workspace includes versioned per-site radius selection. Source-verified Teatum and Cordero datasets can produce explicitly labeled screening descriptors; the provisional Rahm dataset cannot. No dataset is laboratory approved, and imported trust is never accepted automatically.
