import { describe, expect, it } from "vitest";
import { mapClientPointToViewBox } from "../../lib/emi/plot-geometry";

describe("EMI plot pointer coordinate mapping", () => {
  it("accounts for horizontal letterboxing in a wide rendered SVG", () => {
    const point = mapClientPointToViewBox({ clientX: 150, clientY: 165, left: 0, top: 0, width: 1200, height: 330, viewBoxWidth: 900, viewBoxHeight: 330 });
    expect(point.x).toBe(0);
    expect(point.y).toBe(165);
  });

  it("accounts for vertical letterboxing on a tall mobile-sized SVG", () => {
    const point = mapClientPointToViewBox({ clientX: 225, clientY: 317.5, left: 0, top: 100, width: 450, height: 435, viewBoxWidth: 900, viewBoxHeight: 330 });
    expect(point.x).toBe(450);
    expect(point.y).toBe(165);
  });
});
