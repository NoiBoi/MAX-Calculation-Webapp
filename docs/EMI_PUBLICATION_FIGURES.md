# EMI publication figures

## Renderer decision

MAXCalc uses the SVG (`scatter`) path in the Plotly basic distribution for the publication editor. The existing EMI plot remains the fast analysis view. A representative five-trace prototype was evaluated before integration and confirmed that Plotly produces editable vector curves, markers, dash patterns, annotations, manual ranges, custom margins, and inside, outside, and normalized manual legends without raster images in the SVG.

Vega was not selected because its declarative grammar would add an additional translation layer without improving the line-plot controls needed here. The original custom renderer was not extended because doing so would preserve hand-written axis, tick, legend, marker, and text-layout code. Plotly is loaded only when the publication editor is opened.

The export path is deliberately single-source:

`EMI result data -> PublicationFigureSpec -> Plotly SVG renderer -> canonical SVG -> direct SVG download or resvg PNG`

PNG is produced server-side by `@resvg/resvg-js` from the same SVG used by the preview. Physical width, height, and DPI determine the exact raster dimensions. No separate canvas drawing implementation is used.

## Reproducibility

The JSON configuration records the schema version, renderer version, app version, engine version, physical geometry, typography, axes, legend, palette, per-series styling, dataset identifiers, direction, metric, visibility, z-order, and smoothing settings. The companion CSV contains the exact plotted values after filtering and optional smoothing.

SVG text remains text and specifies a font stack. Fonts are not embedded, so a recipient without the selected first-choice font can receive a fallback. PDF and TIFF exports remain disabled until cross-platform font embedding has been validated.

## Manual validation checklist

1. Load forward and reverse EMI files and open **Publication Figure**.
2. Choose SET, SER, SEA, R, T, and A in turn; confirm axis titles and series update without changing analysis results.
3. Add or remove files, select **Refresh series**, and verify the series list matches the selected files.
4. Check single-, one-and-a-half-, and double-column presets; enable the aspect-ratio lock and edit each dimension.
5. Exercise automatic and manual axis ranges, major intervals, tick directions, and grid settings.
6. Apply all palettes. In grayscale, confirm lines remain distinguishable by dash and marker as well as tone.
7. Test an inside legend, each outside legend, and a manual normalized position.
8. Export and reopen JSON, then compare the restored preview with the original.
9. Export SVG and verify curves are SVG paths rather than embedded raster images.
10. Export PNG at 300 and 600 DPI and verify the pixel dimensions equal physical inches multiplied by DPI.
11. Export plotted CSV and confirm the visible series, direction, metric, frequency unit, and values.
12. Repeat in light and dark application themes and at narrow and wide browser widths.
13. Validate one curve and many curves, including thousands of points, and confirm interaction remains responsive.
14. Try extremely long legend labels in a narrow single-column figure and in a double-column figure; check for clipping and choose an outside position when needed.
15. Check very small and very large font settings, title disabled, grayscale export, an outside legend, and a manually positioned legend.
16. Open the exported SVG in a second browser or vector editor and compare it with the preview.
