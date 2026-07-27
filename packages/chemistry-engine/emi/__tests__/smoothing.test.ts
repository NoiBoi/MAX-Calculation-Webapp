import { describe, expect, it } from "vitest";
import { smoothSeries, type EmiSmoothingWindowSize } from "../index";

const series = (values: readonly (number | null | undefined)[]) => values.map((y, x) => ({ x, y }));
const values = (points: ReturnType<typeof smoothSeries>) => points.map((point) => point.y);

describe("display-only centered EMI smoothing", () => {
  it("matches the centered window-3 reference case", () => {
    expect(values(smoothSeries(series([1, 2, 3, 4, 5]), { enabled: true, windowSize: 3 }))).toEqual([1.5, 2, 3, 4, 4.5]);
  });

  it.each([
    [5, [2, 2.5, 3, 3.5, 4]],
  ] as const)("handles window %i", (windowSize, expected) => {
    expect(values(smoothSeries(series([1, 2, 3, 4, 5]), { enabled: true, windowSize }))).toEqual(expected);
  });

  it("calculates full window-7 and window-11 centered results", () => {
    expect(values(smoothSeries(series([1, 2, 3, 4, 5, 6, 7]), { enabled: true, windowSize: 7 }))).toEqual([2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    expect(values(smoothSeries(series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), { enabled: true, windowSize: 11 }))).toEqual([3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5]);
  });

  it.each([[[4]], [[4, 8]]] as const)("keeps short series unchanged", (input) => {
    expect(values(smoothSeries(series(input), { enabled: true, windowSize: 3 }))).toEqual(input);
  });

  it("preserves gaps and smooths contiguous segments independently", () => {
    const input = series([1, 2, 3, null, 10, 12, 14, undefined, 30, Number.NaN, Number.POSITIVE_INFINITY]);
    expect(values(smoothSeries(input, { enabled: true, windowSize: 3 }))).toEqual([1.5, 2, 2.5, null, 11, 12, 13, null, 30, null, null]);
  });

  it("does not cross the documented two-point gap example", () => {
    expect(values(smoothSeries(series([1, 2, null, 10, 12]), { enabled: true, windowSize: 3 }))).toEqual([1, 2, null, 10, 12]);
  });

  it("preserves length, ordering, x values, and source immutability", () => {
    const input = Object.freeze([{ x: 9, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 3 }]);
    const before = JSON.stringify(input);
    const output = smoothSeries(input, { enabled: true, windowSize: 3 });
    expect(output.map((point) => point.x)).toEqual([9, 4, 4]);
    expect(output).toHaveLength(input.length);
    expect(JSON.stringify(input)).toBe(before);
    expect(output).not.toBe(input);
  });

  it.each([3, 5, 7, 11] as readonly EmiSmoothingWindowSize[])("returns raw finite values and canonical gaps when disabled for window %i", (windowSize) => {
    expect(values(smoothSeries(series([1, null, 3]), { enabled: false, windowSize }))).toEqual([1, null, 3]);
  });
});
