import type { MappedPixel } from './types';
import { TRANSPARENT_KEY } from './types';

/** Convert r/g/b (0-255) to a lowercase hex string like "#aabbcc". */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Remove isolated single-cell color islands from a pixel grid (in-place).
 *
 * For each non-external, non-transparent cell, if none of its 4-connected
 * neighbors share the same color it is considered noise and is replaced by
 * the most-common neighbor color.  Edge cells that have fewer than 4
 * neighbors are only replaced when ALL of their existing neighbors differ.
 */
export function removeIsolatedNoise(grid: MappedPixel[][]): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;
  if (cols === 0) return;

  // Collect replacements first so mutations don't affect neighbor checks.
  const replacements: Array<{ row: number; col: number; pixel: MappedPixel }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];

      // Skip transparent or external cells.
      if (cell.paletteId === TRANSPARENT_KEY) continue;
      if (cell.isExternal) continue;

      const cellHex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);

      // Gather valid 4-connected neighbors (up, down, left, right).
      const neighborCoords: Array<[number, number]> = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ].filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols) as Array<
        [number, number]
      >;

      // Count neighbors that share the same color.
      let sameColorCount = 0;
      const neighborColorFreq = new Map<string, { count: number; pixel: MappedPixel }>();

      for (const [nr, nc] of neighborCoords) {
        const neighbor = grid[nr][nc];
        const neighborHex = rgbToHex(neighbor.color.r, neighbor.color.g, neighbor.color.b);

        if (neighborHex === cellHex) {
          sameColorCount++;
        }

        const entry = neighborColorFreq.get(neighborHex);
        if (entry) {
          entry.count++;
        } else {
          neighborColorFreq.set(neighborHex, { count: 1, pixel: neighbor });
        }
      }

      // Only replace if ALL existing neighbors differ (zero same-color matches).
      if (sameColorCount > 0) continue;

      // Find the most common neighbor color.
      let bestHex = '';
      let bestCount = 0;
      for (const [hex, { count }] of neighborColorFreq) {
        if (count > bestCount) {
          bestCount = count;
          bestHex = hex;
        }
      }

      if (!bestHex) continue;

      const replacement = neighborColorFreq.get(bestHex)!.pixel;
      replacements.push({
        row: r,
        col: c,
        pixel: {
          paletteId: replacement.paletteId,
          color: { ...replacement.color },
          ...(cell.isExternal !== undefined ? { isExternal: cell.isExternal } : {}),
        },
      });
    }
  }

  // Apply all replacements.
  for (const { row, col, pixel } of replacements) {
    grid[row][col] = pixel;
  }
}
