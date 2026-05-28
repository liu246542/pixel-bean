import type { RgbColor, PaletteColor, ColorSystem, MappedPixel } from './types';
import { TRANSPARENT_KEY } from './types';
import colorData from './color-data.json';

// Type alias for the raw JSON structure
type ColorDataEntry = Partial<Record<ColorSystem, string>>;
type ColorDataMap = Record<string, ColorDataEntry>;
const typedColorData = colorData as ColorDataMap;

// ── Constants ────────────────────────────────────────────────────────────────

export const COLOR_SYSTEM_OPTIONS: { key: ColorSystem; name: string }[] = [
  { key: 'MARD', name: 'MARD' },
  { key: 'MARD-AM', name: 'MARD (A-M)' },
  { key: 'COCO', name: 'COCO' },
  { key: '漫漫', name: '漫漫' },
  { key: '盼盼', name: '盼盼' },
  { key: '咪小窝', name: '咪小窝' },
  { key: 'Hama', name: 'Hama' },
  { key: 'Perler', name: 'Perler' },
  { key: 'Artkal-S', name: 'Artkal-S' },
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
 * Retained for use as a merge threshold elsewhere; findClosestColor uses CIEDE2000.
 */
export function colorDistance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ── CIELAB conversion ────────────────────────────────────────────────────────

/** Cache of hex → LAB to avoid recomputing for palette colors. */
const labCache = new Map<string, { L: number; a: number; b: number }>();

/**
 * Convert an sRGB color (0–255 each channel) to CIELAB (D65 illuminant).
 *
 * Pipeline: sRGB → linearised sRGB → XYZ (D65) → CIELAB
 */
export function rgbToLab(rgb: RgbColor): { L: number; a: number; b: number } {
  // sRGB → linear light
  const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  // Linear sRGB → XYZ (D65, IEC 61966-2-1 matrix)
  const X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const Z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  // Normalise by D65 white point
  const xn = X / 0.95047;
  const yn = Y / 1.00000;
  const zn = Z / 1.08883;

  // CIE f function
  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Get (or compute and cache) the LAB representation of an RGB color.
 * The cache key is the 6-digit uppercase hex string.
 */
function getCachedLab(
  rgb: RgbColor,
): { L: number; a: number; b: number } {
  const key =
    ((rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).padStart(6, '0').toUpperCase();
  let lab = labCache.get(key);
  if (!lab) {
    lab = rgbToLab(rgb);
    labCache.set(key, lab);
  }
  return lab;
}

// ── CIEDE2000 ────────────────────────────────────────────────────────────────

/**
 * CIEDE2000 color difference between two CIELAB colors.
 *
 * Implements the full formula from Sharma et al. (2005) including the
 * lightness (kL), chroma (kC) and hue (kH) weighting functions and the
 * rotation correction term RT.
 *
 * Reference: G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 Color-Difference
 * Formula: Implementation Notes, Supplementary Test Data, and Mathematical
 * Observations," Color Research & Application, 30(1), 21–30, 2005.
 */
export function ciede2000(
  lab1: { L: number; a: number; b: number },
  lab2: { L: number; a: number; b: number },
): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  // Step 1 – compute C'ab and h'ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625))); // 25^7 = 6103515625
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const atan2deg = (y: number, x: number): number => {
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return deg < 0 ? deg + 360 : deg;
  };

  const h1p = C1p === 0 ? 0 : atan2deg(b1, a1p);
  const h2p = C2p === 0 ? 0 : atan2deg(b2, a2p);

  // Step 2 – deltas
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);

  // Step 3 – CIEDE2000 weighting functions
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((hbarp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hbarp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbarp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hbarp - 63) * Math.PI) / 180);

  const SL =
    1 +
    (0.015 * Math.pow(Lbarp - 50, 2)) /
      Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;

  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 6103515625));
  const dTheta =
    30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;

  // kL = kC = kH = 1 (unity parametric factors for reference conditions)
  const dE = Math.sqrt(
    Math.pow(dLp / SL, 2) +
      Math.pow(dCp / SC, 2) +
      Math.pow(dHp / SH, 2) +
      RT * (dCp / SC) * (dHp / SH),
  );

  return dE;
}

/**
 * Return the palette entry whose color is perceptually closest (by CIEDE2000)
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

  const targetLab = getCachedLab(target);
  let minDist = Infinity;
  let closest = palette[0];

  for (const entry of palette) {
    const entryLab = getCachedLab(entry.color);
    const dist = ciede2000(targetLab, entryLab);
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
    if (!rgb) continue;

    const id = systems['MARD'] ?? Object.values(systems)[0] ?? hex;
    palette.push({ id, name: hex, color: rgb });
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

  if (system === 'MARD-AM') {
    const key = entry['MARD'];
    if (!key) return '?';
    return key[0] >= 'A' && key[0] <= 'M' ? key : '?';
  }

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
  return palette
    .filter((entry) => getDisplayKey(entry.name, system) !== '?')
    .map((entry) => ({ ...entry, id: getDisplayKey(entry.name, system) }));
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
      if (pixel.isExternal || pixel.paletteId === TRANSPARENT_KEY) continue;

      // Determine the hex for this pixel's current palette entry
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
