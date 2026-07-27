export const EMI_SMOOTHING_WINDOWS = [3, 5, 7, 11] as const;

export type EmiSmoothingWindowSize = (typeof EMI_SMOOTHING_WINDOWS)[number];

export interface EmiSmoothingOptions {
  readonly enabled: boolean;
  readonly windowSize: EmiSmoothingWindowSize;
}

export interface EmiSeriesPoint {
  readonly x: number;
  readonly y: number | null | undefined;
}

function valid(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Display-only centered moving average. Invalid values remain gaps and split the
 * series into independent contiguous segments. Segments shorter than the chosen
 * window are returned unchanged. X values and point ordering are preserved.
 */
export function smoothSeries(
  points: readonly EmiSeriesPoint[],
  options: EmiSmoothingOptions,
): EmiSeriesPoint[] {
  const output = points.map((point) => ({ x: point.x, y: valid(point.y) ? point.y : null }));
  if (!options.enabled) return output;

  const radius = Math.floor(options.windowSize / 2);
  let segmentStart = 0;
  while (segmentStart < points.length) {
    while (segmentStart < points.length && !valid(points[segmentStart]?.y)) segmentStart += 1;
    if (segmentStart >= points.length) break;
    let segmentEnd = segmentStart;
    while (segmentEnd + 1 < points.length && valid(points[segmentEnd + 1]?.y)) segmentEnd += 1;
    const segmentLength = segmentEnd - segmentStart + 1;
    if (segmentLength >= options.windowSize) {
      for (let index = segmentStart; index <= segmentEnd; index += 1) {
        const windowStart = Math.max(segmentStart, index - radius);
        const windowEnd = Math.min(segmentEnd, index + radius);
        let total = 0;
        for (let candidate = windowStart; candidate <= windowEnd; candidate += 1) {
          total += points[candidate]?.y as number;
        }
        output[index] = { x: points[index]?.x as number, y: total / (windowEnd - windowStart + 1) };
      }
    }
    segmentStart = segmentEnd + 1;
  }
  return output;
}
