"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { buildPlotlyPublicationFigure } from "@/lib/emi/plotly-publication-adapter";
import { finalizePublicationSvg, svgDataUrlToText } from "@/lib/emi/publication-export";
import { figurePreviewPixels, validatePublicationAxes, type PublicationFigureSpec, type PublicationResolvedSeries } from "@/lib/emi/publication-figure";

export interface PublicationFigurePreviewHandle { getSvg(): Promise<string>; }

export const PublicationFigurePreview = forwardRef<PublicationFigurePreviewHandle, Readonly<{ spec: PublicationFigureSpec; resolved: readonly PublicationResolvedSeries[]; grayscalePreview?: boolean }>>(function PublicationFigurePreview({ spec, resolved, grayscalePreview = false }, forwardedRef) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<Awaited<ReturnType<typeof importPlotly>> | null>(null);
  const figure = useMemo(() => buildPlotlyPublicationFigure(spec, resolved), [resolved, spec]);
  const [status, setStatus] = useState("Loading publication renderer…");
  const [previewScale, setPreviewScale] = useState(1);
  const dimensions = figurePreviewPixels(spec);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const updateScale = () => setPreviewScale(frame.clientWidth > 0 ? frame.clientWidth / dimensions.width : 1);
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [dimensions.width]);

  useEffect(() => {
    const axisErrors = validatePublicationAxes(spec);
    if (axisErrors.x || axisErrors.y) {
      setStatus(`${axisErrors.x ?? axisErrors.y} Showing the last valid preview.`);
      return;
    }
    let active = true;
    void importPlotly().then(async (plotly) => {
      if (!active || !containerRef.current) return;
      plotlyRef.current = plotly;
      await plotly.react(containerRef.current, figure.data, { ...figure.layout }, { ...figure.config });
      if (active) setStatus(figure.data.length > 0 ? "Publication preview ready" : "No visible series are available for this figure.");
    }).catch((error) => { if (active) setStatus(`Publication renderer unavailable: ${error instanceof Error ? error.message : "unknown error"}`); });
    return () => { active = false; };
  }, [figure, spec]);

  useEffect(() => () => { if (containerRef.current && plotlyRef.current) plotlyRef.current.purge(containerRef.current); }, []);

  useImperativeHandle(forwardedRef, () => ({
    async getSvg() {
      if (!containerRef.current || !plotlyRef.current) throw new Error("Publication preview is not ready.");
      const axisErrors = validatePublicationAxes(spec);
      if (axisErrors.x || axisErrors.y) throw new Error(axisErrors.x ?? axisErrors.y);
      const dimensions = figurePreviewPixels(spec);
      const dataUrl = await plotlyRef.current.toImage(containerRef.current, { format: "svg", width: dimensions.width, height: dimensions.height });
      return finalizePublicationSvg(svgDataUrlToText(dataUrl), spec);
    },
  }), [spec]);

  return <div className="emi-publication-preview-shell">
    <div className="emi-publication-preview-canvas" style={{ filter: grayscalePreview ? "grayscale(1)" : undefined }}>
      <div className="emi-publication-preview-frame" ref={frameRef} style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
        <div aria-label="Publication figure preview" className="emi-publication-plot" ref={containerRef} style={{ height: dimensions.height, transform: `scale(${previewScale})`, width: dimensions.width }} />
      </div>
    </div>
    <p aria-live="polite" className="emi-supporting">{status}. Preview uses the same FigureSpec and Plotly SVG renderer as export. Browser preview is scaled at 96 CSS pixels per inch; physical export dimensions remain authoritative.</p>
  </div>;
});

async function importPlotly() {
  const plotlyModule = await import("plotly.js-basic-dist-min");
  return plotlyModule.default;
}
