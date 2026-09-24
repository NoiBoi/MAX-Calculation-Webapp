import { Resvg } from "@resvg/resvg-js";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  svg: z.string().min(20).max(20_000_000),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  background: z.enum(["white", "transparent"]),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid publication raster request." }, { status: 400 });
  const { svg, width, height, background } = parsed.data;
  if (width * height > 120_000_000) return NextResponse.json({ error: "Requested raster exceeds the 120 megapixel safety limit." }, { status: 413 });
  try {
    const renderer = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      background: background === "white" ? "#ffffff" : "rgba(0,0,0,0)",
      font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
    });
    const image = renderer.render();
    if (image.width !== width || image.height !== height) return NextResponse.json({ error: `Rasterizer produced ${image.width}×${image.height}; expected ${width}×${height}.` }, { status: 500 });
    return new NextResponse(new Uint8Array(image.asPng()), { headers: { "Content-Type": "image/png", "Content-Disposition": "attachment; filename=publication-figure.png", "X-MAXCalc-Raster-Size": `${width}x${height}` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to rasterize the publication figure." }, { status: 500 });
  }
}
