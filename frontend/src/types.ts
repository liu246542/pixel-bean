// Color representation as red, green, blue channels (0-255 each)
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

// A named color entry in a palette with its RGB value and optional metadata
export interface PaletteColor {
  id: string;
  name: string;
  color: RgbColor;
  inStock?: boolean;
}

// A single pixel in the output grid, mapped to a palette color or transparent
export interface MappedPixel {
  paletteId: string;
  color: RgbColor;
  isExternal?: boolean;
}

// Supported bead color systems
export type ColorSystem = 'MARD' | 'MARD-AM' | 'COCO' | '漫漫' | '盼盼' | '咪小窝' | 'Hama' | 'Perler' | 'Artkal-S';

// Algorithm used to reduce each pixel block to a single representative color
export type PixelationMode = 'dominant' | 'average';

// Special palette ID that means "no bead / erase this cell"
export const TRANSPARENT_KEY = 'ERASE';

// A transparent pixel constant used as a sentinel in the mapped grid
export const TRANSPARENT_PIXEL: MappedPixel = {
  paletteId: TRANSPARENT_KEY,
  color: { r: 0, g: 0, b: 0 },
};
