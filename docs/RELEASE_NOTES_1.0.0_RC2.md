# MAXCalc 1.0.0-rc.2 release notes

## EMI publication figures

- Added a paper-oriented Plotly SVG publication editor for `SET`, `SER`, `SEA`, `R`, `T`, and `A`.
- Added exact physical sizing, 300/600 DPI PNG rasterization from the canonical SVG, direct SVG export, plotted-data CSV, and reproducible FigureSpec JSON.
- Added typography, axis, palette, line, marker, legend, title, subtitle, and panel-label controls.
- Preserved matching dataset/direction series styles when switching EMI quantities.
- Restored Plotly double-click zoom reset and corrected clipped publication-control dropdowns.
- Kept visual styling independent from measured EMI calculations and optional display smoothing explicit in the figure configuration and plotted-data export.

## Verification

The rc.2 publication-figure changes pass TypeScript, ESLint, all 553 unit/scientific tests, and the production Next.js build. This verification does not replace laboratory validation of scientific reference cases or the deployed release gate.

## Known limitations

- SVG fonts are referenced by deterministic font stacks but are not embedded.
- PDF and TIFF publication exports remain disabled pending cross-platform font-embedding validation.
- The custom publication editor is intentionally narrower than MATLAB, Origin, or Matplotlib and does not provide arbitrary annotations or multi-panel composition.
