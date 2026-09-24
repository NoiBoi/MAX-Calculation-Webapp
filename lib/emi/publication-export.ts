import type { PublicationFigureSpec } from "./publication-figure";
import { figurePreviewPixels } from "./publication-figure";

const unitSuffix = (unit: PublicationFigureSpec["geometry"]["unit"]): string => unit === "px" ? "" : unit;

/** Adds physical dimensions and a stable viewBox to Plotly's canonical SVG output. */
export function finalizePublicationSvg(svg: string, spec: PublicationFigureSpec): string {
  const preview = figurePreviewPixels(spec);
  const width = `${spec.geometry.width}${unitSuffix(spec.geometry.unit)}`;
  const height = `${spec.geometry.height}${unitSuffix(spec.geometry.unit)}`;
  return svg
    .replace(/<svg\b([^>]*)>/, (opening) => opening
      .replace(/\swidth="[^"]*"/, ` width="${width}"`)
      .replace(/\sheight="[^"]*"/, ` height="${height}"`)
      .replace(/\sviewBox="[^"]*"/g, "")
      .replace(/\sdata-maxcalc-figure-schema="[^"]*"/g, "")
      .replace(/>$/, ` viewBox="0 0 ${preview.width} ${preview.height}" data-maxcalc-figure-schema="${spec.schemaVersion}">`));
}

export function svgDataUrlToText(dataUrl: string): string {
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.slice(0, separator).includes("image/svg+xml")) throw new Error("Plot renderer did not return an SVG data URL.");
  return decodeURIComponent(dataUrl.slice(separator + 1));
}
