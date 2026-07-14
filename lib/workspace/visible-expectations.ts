/** Canonical UI-visible snapshot from the hand-audited Ti2AlN arithmetic fixture. */
export const TI2ALN_VISIBLE_EXPECTATION = Object.freeze({
  finalMassesGrams: Object.freeze({ Ti: "7.002", Al: "1.973", N: "1.024" }),
  finalTotalGrams: "9.999",
  adjustedFeed: "Al:1 · N:1 · Ti:2",
  warningCodes: Object.freeze(["ATOMIC_WEIGHT_INTERVAL", "REALIZED_RESIDUAL_ABOVE_TOLERANCE"]),
});
