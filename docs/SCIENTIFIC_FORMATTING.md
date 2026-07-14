# Scientific-number formatting

`lib/presentation/scientific-format.ts` is the centralized human-display layer. It never changes engine values.

- Final masses and totals use the decimal places implied by the selected balance increment.
- Relative residuals are percentages at roughly four significant figures.
- Small molar residuals use mmol or µmol.
- Radii use pm with source-appropriate decimal precision.
- Descriptor summaries use four significant figures.
- Exact stored values remain in technical details, immutable snapshots, trace, clipboard/export payloads, and canonical scientific representations.
