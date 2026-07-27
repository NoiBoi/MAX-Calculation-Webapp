# Simon theoretical SET graph overlay

The **Show Simon estimate** toggle is available only on the total shielding-effectiveness (SET) frequency graph. It is off by default and affects that graph only.

MAXCalc does not overlay the Simon reflection and absorption terms on measured SER or SEA. The repository does not establish a reviewed scientific equivalence between those empirical terms and the VNA-derived SER/SEA definitions. Adding such overlays requires explicit scientific review.

## Sample association

Each selected, individually displayed sample receives its own Simon series only when it has valid film thickness and four-point-probe electrical inputs. The series uses that sample's calculated conductivity, thickness, and exact ordered measured frequencies. Missing inputs never become zero and are never borrowed from another sample. If only some samples qualify, available curves remain usable and the graph reports how many do not.

The renderer preserves calculated theoretical points but splits the displayed line wherever no displayed direction has a valid measured SET value. It does not interpolate, resample, extrapolate, or draw through a measured gap.

## Interpretation and styling

Measured SET remains a solid primary curve. Simon is a thinner, lower-emphasis dashed curve using the associated sample color where practical. Legends and tooltips say **Simon theoretical SET** and **Theoretical estimate, not measured**. The tooltip includes frequency, theoretical SET, conductivity, thickness, and calculation version.

Simon data are never smoothed. Changing measured smoothing may change the SVG y-axis mapping, but not the theoretical frequency or numeric SET values. Graph visibility never controls scientific CSV/XLSX export fields, which remain separately labeled according to the export schema.

The Simon estimate is empirical and may not accurately represent thin, porous, anisotropic, multilayered, or otherwise non-ideal materials. It is not a validation of measured VNA SET.
