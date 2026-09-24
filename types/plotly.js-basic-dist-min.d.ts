declare module "plotly.js-basic-dist-min" {
  interface PlotlyApi {
    newPlot(element: HTMLElement, data: readonly Record<string, unknown>[], layout: Record<string, unknown>, config?: Record<string, unknown>): Promise<HTMLElement>;
    react(element: HTMLElement, data: readonly Record<string, unknown>[], layout: Record<string, unknown>, config?: Record<string, unknown>): Promise<HTMLElement>;
    purge(element: HTMLElement): void;
    toImage(element: HTMLElement, options: Readonly<{ format: "svg" | "png"; width: number; height: number; scale?: number }>): Promise<string>;
  }
  const Plotly: PlotlyApi;
  export default Plotly;
}
