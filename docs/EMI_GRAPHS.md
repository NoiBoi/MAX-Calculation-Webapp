# EMI frequency graphs

The EMI analyzer uses one shared SVG chart component with four stable graph identifiers:

| Graph ID | Displayed quantities | Smoothing | Simon overlay |
| --- | --- | --- | --- |
| `set-vs-frequency` | Measured SET | Yes | Yes, theoretical total SET only |
| `ser-vs-frequency` | Measured SER | Yes | No |
| `sea-vs-frequency` | Measured SEA | Yes | No |
| `rta-vs-frequency` | Measured R, T, and A | Yes | No |

There is currently no S-parameter-magnitude or frequency-dependent conductivity graph. Scalar electrical-property results, tables, summaries, and metadata do not receive smoothing controls.

Controls use visible labels, native checkboxes/selects, theme tokens, and wrapping toolbars. The SVG is keyboard focusable; Left and Right Arrow move through available measured and theoretical points while the accessible tooltip reports the same information used for pointer hover. Dashed Simon styling makes theoretical curves distinguishable without relying only on color.

Legend visibility, smoothing, smoothing window, and Simon visibility are presentation state. They never mutate measured arrays, project schema 2.0.0 records, or calculation results. See `EMI_SMOOTHING.md` and `EMI_SIMON_OVERLAY.md` for the scientific and state contracts.
