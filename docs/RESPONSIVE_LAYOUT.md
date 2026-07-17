# Responsive layout architecture

MAX Stoich supports 1366 x 768 through 3840 x 2160 at 100% browser zoom, including 1920 x 1080, 2560 x 1440, and 3440 x 1440 ultrawide layouts. Normal laptop and 1080p density remains the baseline. A clamped root size and semantic text, control, spacing, toolbar, panel, and maximum-width tokens increase progressively only when the viewport supplies both width and height.

The workspace is bounded near 1500 px at ordinary desktop sizes, expands to 2100 px at 2K, and to 2700 px at 4K. Comparison uses 1600, 2200, and 2750 px bounds; Settings uses 1300, 1900, and 2400 px. Extra width creates meaningful parallel columns rather than unbounded lines: two comparison scenarios at 2K, up to three at 4K, and a balanced two-column Settings layout. No browser zoom detection, device-pixel-ratio branch, or transformed application container is used.

`SiteBrand` is the shared calculator, comparison, and Settings brand. Navigation uses the same SVG asset, dimensions, accessible link label, and theme filter on every route. Light preserves the source mark; Dark and Midnight use the same high-contrast neutral inversion. The print variant retains physical sizing and the existing print-safe palette.

Comparison actions are grouped into primary recipe/save actions and visually quieter secondary actions. Identity and analysis controls form one bounded workspace, comparison views use a distinct segmented selector, and Standard/Advanced remains separate. Midnight favors thin borders and near-black surfaces; comparison informational panels use neutral surfaces rather than blue-tinted containers.
