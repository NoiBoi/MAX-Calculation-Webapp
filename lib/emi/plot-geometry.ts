/** Maps a client point into an SVG viewBox for the default xMidYMid meet behavior. */
export function mapClientPointToViewBox(input: Readonly<{ clientX: number; clientY: number; left: number; top: number; width: number; height: number; viewBoxWidth: number; viewBoxHeight: number }>): Readonly<{ x: number; y: number }> {
  const scale = Math.min(input.width / input.viewBoxWidth, input.height / input.viewBoxHeight);
  const offsetX = (input.width - input.viewBoxWidth * scale) / 2;
  const offsetY = (input.height - input.viewBoxHeight * scale) / 2;
  return { x: (input.clientX - input.left - offsetX) / scale, y: (input.clientY - input.top - offsetY) / scale };
}
