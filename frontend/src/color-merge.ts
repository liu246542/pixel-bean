import { MappedPixel, TRANSPARENT_KEY } from './types';
import { hexToRgb, colorDistance } from './palette';

export function mergeColors(grid: MappedPixel[][], threshold: number): void {
  // Step 1: Count frequency of each color by hex value,
  // skipping TRANSPARENT_KEY cells (and any cell marked isExternal).
  const freqMap = new Map<string, number>();

  for (const row of grid) {
    for (const pixel of row) {
      if (pixel.paletteId === TRANSPARENT_KEY) continue;
      if ((pixel as unknown as Record<string, unknown>)['isExternal']) continue;

      const hex = rgbToHex(pixel.color.r, pixel.color.g, pixel.color.b);
      freqMap.set(hex, (freqMap.get(hex) ?? 0) + 1);
    }
  }

  // Step 2: Sort colors by frequency descending (highest first).
  const sorted = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);

  // Step 3 & 4: For each color (high→low), compare against lower-frequency
  // colors and merge if distance < threshold.
  const replaced = new Map<string, string>(); // lower → higher replacement hex

  for (let i = 0; i < sorted.length; i++) {
    const [highHex] = sorted[i];

    // Skip if this color has itself been replaced.
    if (replaced.has(highHex)) continue;

    const highRgb = hexToRgb(highHex);
    if (!highRgb) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const [lowHex] = sorted[j];

      // Skip already-replaced colors.
      if (replaced.has(lowHex)) continue;

      const lowRgb = hexToRgb(lowHex);
      if (!lowRgb) continue;

      if (colorDistance(highRgb, lowRgb) < threshold) {
        replaced.set(lowHex, highHex);
      }
    }
  }

  // Step 5: Apply replacements in the grid.
  if (replaced.size === 0) return;

  for (const row of grid) {
    for (let col = 0; col < row.length; col++) {
      const pixel = row[col];
      if (pixel.paletteId === TRANSPARENT_KEY) continue;
      if ((pixel as unknown as Record<string, unknown>)['isExternal']) continue;

      const hex = rgbToHex(pixel.color.r, pixel.color.g, pixel.color.b);
      const targetHex = replaced.get(hex);
      if (!targetHex) continue;

      const targetRgb = hexToRgb(targetHex);
      if (!targetRgb) continue;

      row[col] = { ...pixel, color: targetRgb };
    }
  }
}

/** Convert r/g/b (0-255) to a lowercase hex string like "#aabbcc". */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}
