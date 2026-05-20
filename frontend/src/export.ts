import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor, hexToRgb } from './palette';

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Convert an RgbColor to a hex string (with leading '#').
 */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}

/**
 * Trigger a PNG download from a canvas element.
 */
function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = filename;
  anchor.click();
}

// ── Export functions ──────────────────────────────────────────────────────────

/**
 * Render the mapped pixel grid to a PNG and trigger a download.
 *
 * Each cell is drawn at `cellSize` pixels square.  External / transparent
 * cells are filled white and left blank; all other cells are filled with their
 * mapped color, given a thin border, and labelled with the display key for the
 * requested ColorSystem.
 */
export function exportKeyGrid(
  grid: MappedPixel[][],
  system: ColorSystem,
  filename = 'pixel-bean-grid.png',
): void {
  const cellSize = 40;
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.font = `bold ${Math.floor(cellSize * 0.28)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const pixel = grid[row][col];
      const x = col * cellSize;
      const y = row * cellSize;

      // External or transparent cells → white, no label
      if (pixel.isExternal || pixel.paletteId === TRANSPARENT_KEY) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, cellSize, cellSize);
        continue;
      }

      // Fill cell with the mapped color
      const { r, g, b } = pixel.color;
      const hex = rgbToHex(r, g, b);
      ctx.fillStyle = hex;
      ctx.fillRect(x, y, cellSize, cellSize);

      // Draw border
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.25, y + 0.25, cellSize - 0.5, cellSize - 0.5);

      // Draw display key text centered in the cell
      const label = getDisplayKey(hex, system);
      ctx.fillStyle = getContrastColor(hex);
      ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
    }
  }

  downloadCanvas(canvas, filename);
}

/**
 * Render a color-frequency statistics table to a PNG and trigger a download.
 *
 * The table contains:
 *   - A header row with the title and total bead count
 *   - One row per color (sorted by frequency, descending) showing a swatch,
 *     display key, hex value, and count
 *   - A footer row with the grand total
 */
export function exportStats(
  grid: MappedPixel[][],
  system: ColorSystem,
  filename = 'pixel-bean-stats.png',
): void {
  // ── Count color frequencies ─────────────────────────────────────────────
  const counts = new Map<string, { hex: string; count: number }>();

  for (const row of grid) {
    for (const pixel of row) {
      if (pixel.isExternal || pixel.paletteId === TRANSPARENT_KEY) continue;

      const { r, g, b } = pixel.color;
      const hex = rgbToHex(r, g, b);

      const entry = counts.get(hex);
      if (entry) {
        entry.count += 1;
      } else {
        counts.set(hex, { hex, count: 1 });
      }
    }
  }

  // Sort by count descending
  const sorted = Array.from(counts.values()).sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, e) => sum + e.count, 0);

  // ── Canvas layout constants ─────────────────────────────────────────────
  const WIDTH = 360;
  const HEADER_H = 48;
  const ROW_H = 32;
  const FOOTER_H = 40;
  const height = HEADER_H + sorted.length * ROW_H + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height);

  // ── Header ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pixel Bean — Color Statistics', 16, HEADER_H / 2 - 7);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`Total beads: ${total.toLocaleString()}  ·  Colors: ${sorted.length}`, 16, HEADER_H / 2 + 9);

  // ── Column header labels ────────────────────────────────────────────────
  const colHeaderY = HEADER_H + ROW_H / 2;

  ctx.fillStyle = '#555555';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Color', 8 + ROW_H - 4, colHeaderY); // after swatch space
  ctx.fillText('Key', 8 + ROW_H + 60, colHeaderY);
  ctx.fillText('Hex', 8 + ROW_H + 120, colHeaderY);

  ctx.textAlign = 'right';
  ctx.fillText('Count', WIDTH - 12, colHeaderY);

  // Thin separator below column headers
  ctx.strokeStyle = '#DDDDDD';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H + ROW_H);
  ctx.lineTo(WIDTH, HEADER_H + ROW_H);
  ctx.stroke();

  // ── Color rows ──────────────────────────────────────────────────────────
  for (let i = 0; i < sorted.length; i++) {
    const { hex, count } = sorted[i];
    const yTop = HEADER_H + ROW_H + i * ROW_H; // skip column-header row
    const yCentre = yTop + ROW_H / 2;

    // Alternating row background
    if (i % 2 === 0) {
      ctx.fillStyle = '#F8F8F8';
      ctx.fillRect(0, yTop, WIDTH, ROW_H);
    }

    // Color swatch
    const swatchPad = 4;
    const swatchSize = ROW_H - swatchPad * 2;
    ctx.fillStyle = hex;
    ctx.fillRect(8, yTop + swatchPad, swatchSize, swatchSize);

    // Swatch border
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(8, yTop + swatchPad, swatchSize, swatchSize);

    const textX = 8 + swatchSize + 8; // right of swatch + gap
    ctx.textBaseline = 'middle';

    // Display key
    const displayKey = getDisplayKey(hex, system);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(displayKey, textX, yCentre);

    // Hex value
    ctx.fillStyle = '#555555';
    ctx.font = '11px monospace';
    ctx.fillText(hex.toLowerCase(), textX + 60, yCentre);

    // Count (right-aligned)
    ctx.fillStyle = '#111111';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(count.toLocaleString(), WIDTH - 12, yCentre);

    // Bottom separator
    ctx.strokeStyle = '#EEEEEE';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, yTop + ROW_H);
    ctx.lineTo(WIDTH, yTop + ROW_H);
    ctx.stroke();
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerY = height - FOOTER_H;
  ctx.fillStyle = '#E8E8F0';
  ctx.fillRect(0, footerY, WIDTH, FOOTER_H);

  ctx.fillStyle = '#1A1A2E';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${sorted.length} color${sorted.length !== 1 ? 's' : ''}`, 16, footerY + FOOTER_H / 2);

  ctx.textAlign = 'right';
  ctx.fillText(`Total: ${total.toLocaleString()} beads`, WIDTH - 16, footerY + FOOTER_H / 2);

  downloadCanvas(canvas, filename);
}

// Re-export hexToRgb so callers that import from this module don't need a
// separate palette import just for that utility.
export { hexToRgb };
