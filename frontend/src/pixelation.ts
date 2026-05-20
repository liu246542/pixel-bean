import { RgbColor, PaletteColor, MappedPixel, PixelationMode, TRANSPARENT_KEY } from './types';
import { findClosestColor } from './palette';

/**
 * Compute a representative color for a single grid cell using the specified mode.
 * Returns null if the cell contains no opaque pixels (all transparent).
 */
function cellRepresentativeColor(
  imageData: ImageData,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  mode: PixelationMode
): RgbColor | null {
  const { data, width } = imageData;

  if (mode === 'average') {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    for (let y = cellY; y < cellY + cellH; y++) {
      for (let x = cellX; x < cellX + cellW; x++) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha < 128) continue;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }

    if (count === 0) return null;

    return {
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count),
    };
  }

  // mode === 'dominant': find the most frequently occurring RGB triplet
  const freq = new Map<string, { color: RgbColor; count: number }>();

  for (let y = cellY; y < cellY + cellH; y++) {
    for (let x = cellX; x < cellX + cellW; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 128) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const key = `${r},${g},${b}`;

      const entry = freq.get(key);
      if (entry) {
        entry.count++;
      } else {
        freq.set(key, { color: { r, g, b }, count: 1 });
      }
    }
  }

  if (freq.size === 0) return null;

  let bestColor: RgbColor | null = null;
  let bestCount = 0;

  for (const { color, count } of freq.values()) {
    if (count > bestCount) {
      bestCount = count;
      bestColor = color;
    }
  }

  return bestColor;
}

/**
 * Pixelate an image by dividing it into a cols×rows grid, computing a
 * representative color for each cell, then snapping it to the nearest
 * palette entry.
 *
 * @param imageData - Raw canvas ImageData for the source image
 * @param cols      - Number of grid columns
 * @param rows      - Number of grid rows
 * @param palette   - Array of available palette colors
 * @param mode      - Color reduction algorithm ('dominant' | 'average')
 * @param fallback  - Palette color used when no exact match can be found
 * @returns 2-D array [row][col] of MappedPixel
 */
export function pixelate(
  imageData: ImageData,
  cols: number,
  rows: number,
  palette: PaletteColor[],
  mode: PixelationMode,
  fallback: PaletteColor
): MappedPixel[][] {
  const { width, height } = imageData;

  const result: MappedPixel[][] = [];

  for (let row = 0; row < rows; row++) {
    const rowPixels: MappedPixel[] = [];

    // Compute pixel-accurate cell boundaries (handles non-divisible dimensions)
    const cellYStart = Math.floor((row * height) / rows);
    const cellYEnd = Math.floor(((row + 1) * height) / rows);
    const cellH = cellYEnd - cellYStart;

    for (let col = 0; col < cols; col++) {
      const cellXStart = Math.floor((col * width) / cols);
      const cellXEnd = Math.floor(((col + 1) * width) / cols);
      const cellW = cellXEnd - cellXStart;

      const repColor = cellRepresentativeColor(
        imageData,
        cellXStart,
        cellYStart,
        cellW,
        cellH,
        mode
      );

      if (repColor === null) {
        rowPixels.push({ paletteId: TRANSPARENT_KEY, color: { r: 0, g: 0, b: 0 } });
      } else {
        const matched = findClosestColor(repColor, palette, fallback);
        rowPixels.push({ paletteId: matched.id, color: matched.color });
      }
    }

    result.push(rowPixels);
  }

  return result;
}
