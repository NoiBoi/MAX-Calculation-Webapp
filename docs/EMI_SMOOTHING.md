# EMI graph smoothing

Smoothing affects graph presentation only. It does not alter imported measurements, calculated EMI values, summaries, saved scientific records, or spreadsheet exports.

## Algorithm

MAXCalc uses the pure `smoothSeries` function in the chemistry engine. The available odd windows are 3, 5, 7, and 11 points; 5 is the initial selection. For a window `w`, the radius is `floor(w / 2)`. Each displayed value is the arithmetic mean of the available values from `index - radius` through `index + radius` within the same contiguous valid segment. Endpoints therefore use truncated centered windows.

For `[1, 2, 3, 4, 5]` and window 3, the display is `[1.5, 2, 3, 4, 4.5]`.

Null, undefined, NaN, and infinite values are gaps. Gaps remain gaps and separate independently smoothed segments. A valid segment shorter than the chosen window remains raw. Frequency values, ordering, duplicates, point count, and full internal numeric precision are preserved. No trailing average, interpolation, extrapolation, or zero substitution is performed.

## Scope and state

Each eligible graph owns independent component-local settings keyed by its stable graph instance. SET, SER, SEA, and R/T/A can therefore be configured independently. Controls are omitted when no valid segment has at least three points.

These settings are non-scientific and intentionally are not persisted in project records, IndexedDB, account data, calculation provenance, or revision hashes. They reset when the EMI analyzer unmounts, including navigation away and back.

## Display and export behavior

The tooltip presents the raw measured value first and the smoothed display value second. A visible **Smoothed display** badge is shown. CSV/XLSX exports, summaries, QC, comparisons, rankings, and saved projects continue to read canonical raw calculation arrays. Chart-image export may reflect the current display state.

The processing order is raw authoritative measured series, optional display-only smoothing, then SVG coordinate transformation. MAXCalc has no separate chart downsampling stage in this milestone.
