/**
 * The pixel "L" from the header logo, as positioned blocks, for next/og images
 * (icons and the share card), which render flexbox HTML rather than SVG rects.
 * Coordinates are the same 10×10 grid as the <svg> in components/site-chrome.tsx.
 */
const BLOCKS: [number, number, number, number][] = [
  [0, 0, 2, 10],
  [2, 8, 4, 2],
  [6, 0, 2, 2],
  [8, 2, 2, 2],
  [6, 4, 2, 2],
];

export function PixelMark({ size, color = '#00a8ff' }: { size: number; color?: string }) {
  const unit = size / 10;
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
      {BLOCKS.map(([x, y, w, h]) => (
        <div
          key={`${x}-${y}`}
          style={{
            position: 'absolute',
            left: x * unit,
            top: y * unit,
            width: w * unit,
            height: h * unit,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}
