import { MappedPixel } from './types';

const BACKGROUND_COLORS = new Set<string>([
  '#FFFFFF',
  '#FEFEFE',
  '#FDFDFD',
  '#FCFCFC',
  '#FBFBFB',
  '#FAFAFA',
  '#F9F9F9',
  '#F8F8F8',
  '#F5F5F5',
  '#F0F0F0',
  '#EEEEEE',
]);

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    r.toString(16).toUpperCase().padStart(2, '0') +
    g.toString(16).toUpperCase().padStart(2, '0') +
    b.toString(16).toUpperCase().padStart(2, '0')
  );
}

export function markBackground(grid: MappedPixel[][]): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;
  if (cols === 0) return;

  const visited: boolean[][] = Array.from({ length: rows }, () =>
    new Array<boolean>(cols).fill(false)
  );

  const stack: [number, number][] = [];

  // Seed stack with all border cells
  for (let c = 0; c < cols; c++) {
    stack.push([0, c]);
    stack.push([rows - 1, c]);
  }
  for (let r = 1; r < rows - 1; r++) {
    stack.push([r, 0]);
    stack.push([r, cols - 1]);
  }

  // Iterative flood-fill
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    if (visited[r][c]) continue;

    const pixel = grid[r][c];
    const hex = toHex(pixel.color.r, pixel.color.g, pixel.color.b);
    if (!BACKGROUND_COLORS.has(hex)) continue;

    visited[r][c] = true;
    pixel.isExternal = true;

    stack.push([r - 1, c]);
    stack.push([r + 1, c]);
    stack.push([r, c - 1]);
    stack.push([r, c + 1]);
  }
}
