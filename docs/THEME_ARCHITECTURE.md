# Theme architecture

MAX Stoich stores one appearance preference in user-settings schema `4.0.0`: `light`, `dark`, `midnight`, or `system`. System resolves only through `prefers-color-scheme` to Light or Dark. Midnight is always explicit. Schema `3.0.0` Dark remains Dark after migration and receives the revised neutral palette; it is never converted to Midnight.

The root initialization script reads the derived bootstrap mirror before hydration, applies `data-theme`, and sets the native `color-scheme`. IndexedDB remains authoritative. Successful writes, reset, backup restore, and migration synchronize the mirror. A layout-time client reconciliation prevents hydration from removing the early attribute, and live OS changes are observed only while System is selected.

Light uses the established white/slate identity. Dark uses neutral charcoal (`#181a1d` page, `#202226` panel, `#1c1e22` input) without blue-derived structural surfaces. Midnight follows Discord Midnight's black/gray character: a `#000` page, `#050505` panels, `#0a0a0a` elevated surfaces, `#020202` inputs, thin restrained borders, and no panel shadows. The teal accent remains reserved for focus, selection, links, and primary actions. Status tokens retain labels, borders, typography, and subdued fills so meaning does not depend on hue.

All existing utility colors map centrally to semantic background, border, text, accent, status, focus, shadow, and overlay tokens. Component-specific Midnight patches are limited to structural behavior that tokens cannot express, such as removing large-card shadows. Print roots and Settings print previews always opt into a white-paper light palette.
