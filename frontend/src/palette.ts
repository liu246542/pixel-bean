import type { RgbColor, PaletteColor, ColorSystem, MappedPixel } from './types';
import colorData from './color-data.json';

// Type alias for the raw JSON structure
type ColorDataEntry = Record<ColorSystem, string>;
type ColorDataMap = Record<string, ColorDataEntry>;
const typedColorData = colorData as ColorDataMap;

// ── Constants ────────────────────────────────────────────────────────────────

export const COLOR_SYSTEM_OPTIONS: { key: ColorSystem; name: string }[] = [
  { key: 'MARD', name: 'MARD' },
  { key: 'COCO', name: 'COCO' },
  { key: '漫漫', name: '漫漫' },
  { key: '盼盼', name: '盼盼' },
  { key: '咪小窝', name: '咪小窝' },
];

// ── Core color math ──────────────────────────────────────────────────────────

/**
 * Parse a hex color string (with or without leading '#') to an RGB object.
 * Returns null if the string is not a valid 6-digit hex color.
 */
export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Euclidean distance between two RGB colors.
 */
export function colorDistance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Return the palette entry whose color is closest (by Euclidean RGB distance)
 * to the given target color.
 *
 * An optional `fallback` entry is returned when the palette is empty.
 * Throws if the palette is empty and no fallback is provided.
 */
export function findClosestColor(
  target: RgbColor,
  palette: PaletteColor[],
  fallback?: PaletteColor,
): PaletteColor {
  if (palette.length === 0) {
    if (fallback) return fallback;
    throw new Error('findClosestColor: palette must not be empty');
  }

  let minDist = Infinity;
  let closest = palette[0];

  for (const entry of palette) {
    const dist = colorDistance(target, entry.color);
    if (dist < minDist) {
      minDist = dist;
      closest = entry;
      if (dist === 0) break; // exact match – no need to continue
    }
  }

  return closest;
}

// ── Palette construction ─────────────────────────────────────────────────────

/**
 * Build the full 291-color palette from color-data.json.
 *
 * Each entry uses the MARD key as its `id`, the hex string as its `name`,
 * and the parsed RGB value as its `color`.  This is the canonical representation
 * used throughout the application; call convertPaletteToSystem() to obtain a
 * palette with keys from a different bead brand system.
 */
export function buildFullPalette(): PaletteColor[] {
  const palette: PaletteColor[] = [];

  for (const [hex, systems] of Object.entries(typedColorData)) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue; // skip any malformed entries

    palette.push({
      id: systems['MARD'],
      name: hex,
      color: rgb,
    });
  }

  return palette;
}

// ── Display helpers ──────────────────────────────────────────────────────────

/**
 * Given a hex color and a ColorSystem, return the display key for that color
 * in the requested system (e.g. 'A01' for MARD, 'E02' for COCO, …).
 *
 * Returns '?' when the hex is not present in color-data.json or lacks a
 * mapping for the requested system.
 */
export function getDisplayKey(hex: string, system: ColorSystem): string {
  const normalised = hex.toUpperCase();
  const entry = typedColorData[normalised];
  if (!entry) return '?';
  return entry[system] ?? '?';
}

/**
 * Return '#000000' (black) or '#FFFFFF' (white), whichever provides better
 * contrast against the given background hex color.
 *
 * Uses the WCAG relative-luminance formula.
 */
export function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';

  // Convert sRGB to linear light values
  const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const L =
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b);

  // White on dark backgrounds (L < 0.179), black on light ones
  return L < 0.179 ? '#FFFFFF' : '#000000';
}

// ── System conversion ────────────────────────────────────────────────────────

/**
 * Return a new palette array where every entry's `id` is replaced with the
 * display key for the requested ColorSystem.  The `name` (hex) and `color`
 * (RGB) fields are preserved unchanged.
 *
 * Colors that have no mapping in the target system are left with their
 * existing `id`.
 */
export function convertPaletteToSystem(
  palette: PaletteColor[],
  system: ColorSystem,
): PaletteColor[] {
  return palette.map((entry) => {
    const key = getDisplayKey(entry.name, system);
    return key !== '?' ? { ...entry, id: key } : { ...entry };
  });
}

// ── Excluded-color remapping ─────────────────────────────────────────────────

/**
 * Remap every pixel whose palette color is in `excludedHexes` to the nearest
 * color available in `availablePalette`.
 *
 * The grid is mutated in-place.  Pixels that are already mapped to an
 * available color are left untouched.
 *
 * The `paletteId` field on each remapped pixel is updated to match the
 * closest available color's `id`; the `color` field is updated to match its
 * RGB value.
 */
export function remapExcludedColors(
  grid: MappedPixel[][],
  excludedHexes: Set<string>,
  availablePalette: PaletteColor[],
): void {
  if (availablePalette.length === 0) return;

  // Build a cache so we only run findClosestColor once per distinct excluded color
  const remapCache = new Map<string, PaletteColor>();

  for (const row of grid) {
    for (const pixel of row) {
      // Determine the hex for this pixel's current palette entry
      // PaletteColor.name stores the hex; we need to reverse-look-up by paletteId
      // The pixel carries its current RGB, so we search by RGB match in excludedHexes.
      // However, excludedHexes is a set of hex strings, and we need to check
      // whether this pixel's color belongs to one of them.  We look up the hex
      // from the raw color data via the pixel's RGB.

      // Fast path: find the hex that matches this pixel's RGB and paletteId
      const pixelHex = findHexForPixel(pixel);
      if (!pixelHex || !excludedHexes.has(pixelHex.toUpperCase())) continue;

      let replacement = remapCache.get(pixelHex);
      if (!replacement) {
        replacement = findClosestColor(pixel.color, availablePalette);
        remapCache.set(pixelHex, replacement);
      }

      pixel.paletteId = replacement.id;
      pixel.color = replacement.color;
    }
  }
}

/**
 * Internal helper: given a MappedPixel, find its canonical hex string by
 * looking up the paletteId in color-data.json (MARD key match) or by
 * scanning for a color whose RGB values match the pixel's stored color.
 *
 * Returns null when no match is found.
 */
function findHexForPixel(pixel: MappedPixel): string | null {
  // First, try MARD key lookup (fast path for default system)
  for (const [hex, systems] of Object.entries(typedColorData)) {
    if (systems['MARD'] === pixel.paletteId) return hex;
  }

  // Fallback: match by RGB value (handles non-MARD systems)
  for (const hex of Object.keys(typedColorData)) {
    const rgb = hexToRgb(hex);
    if (
      rgb &&
      rgb.r === pixel.color.r &&
      rgb.g === pixel.color.g &&
      rgb.b === pixel.color.b
    ) {
      return hex;
    }
  }

  return null;
}
