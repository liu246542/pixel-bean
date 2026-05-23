import type { MappedPixel } from './types';
import { TRANSPARENT_KEY } from './types';

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function majorityFilter(grid: MappedPixel[][]): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;

  const replacements: { r: number; c: number; pixel: MappedPixel }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;

      const cellHex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const freq = new Map<string, { count: number; pixel: MappedPixel }>();

      // Count colors in 3×3 neighborhood (including self)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const neighbor = grid[nr][nc];
          if (neighbor.isExternal || neighbor.paletteId === TRANSPARENT_KEY) continue;
          const hex = rgbToHex(neighbor.color.r, neighbor.color.g, neighbor.color.b);
          const entry = freq.get(hex);
          if (entry) entry.count++;
          else freq.set(hex, { count: 1, pixel: neighbor });
        }
      }

      // Find the most common color in neighborhood
      let bestHex = cellHex;
      let bestCount = 0;
      for (const [hex, { count }] of freq) {
        if (count > bestCount) {
          bestCount = count;
          bestHex = hex;
        }
      }

      // Replace if current cell is NOT the majority
      if (bestHex !== cellHex) {
        const best = freq.get(bestHex)!.pixel;
        replacements.push({
          r, c,
          pixel: { paletteId: best.paletteId, color: { ...best.color }, isExternal: false },
        });
      }
    }
  }

  for (const { r, c, pixel } of replacements) {
    grid[r][c] = pixel;
  }
}
