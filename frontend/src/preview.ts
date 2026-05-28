import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor } from './palette';

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert an RgbColor to an uppercase 6-digit hex string (without '#' prefix),
 * suitable for passing to getDisplayKey / getContrastColor.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Derive the cell size used for a given grid.
 * cellSize = max(4, min(40, floor(800 / max(cols, rows))))
 */
function calcCellSize(cols: number, rows: number): number {
  return Math.max(4, Math.min(40, Math.floor(800 / Math.max(cols, rows))));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Render a full grid preview onto `canvas`.
 *
 * - Cells are filled with their palette color (or #F0F0F0 for external/transparent cells).
 * - A subtle 0.5 px grid line (rgba(0,0,0,0.1)) is drawn around every cell.
 * - When the cell is not external and cellSize >= 16, the color's display key
 *   is rendered centred in the cell using a contrast-aware text colour.
 */
export function drawPreview(
  canvas: HTMLCanvasElement,
  grid: MappedPixel[][],
  system: ColorSystem,
): void {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  if (rows === 0 || cols === 0) return;

  const cellSize = calcCellSize(cols, rows);

  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const showLabel = cellSize >= 16;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;

      // ── Fill ────────────────────────────────────────────────────────────────
      const isBlank = cell.isExternal || cell.paletteId === TRANSPARENT_KEY;
      if (isBlank) {
        ctx.fillStyle = '#F0F0F0';
      } else {
        const { r: cr, g: cg, b: cb } = cell.color;
        ctx.fillStyle = rgbToHex(cr, cg, cb);
      }
      ctx.fillRect(x, y, cellSize, cellSize);

      // ── Grid line (every 5th line is thicker) ─────────────────────────────
      const isMajorRow = r % 5 === 0;
      const isMajorCol = c % 5 === 0;
      ctx.strokeStyle = (isMajorRow || isMajorCol) ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = (isMajorRow || isMajorCol) ? 1 : 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);

      // ── Label ──────────────────────────────────────────────────────────────
      if (showLabel && !isBlank) {
        const { r: cr, g: cg, b: cb } = cell.color;
        const hex = rgbToHex(cr, cg, cb);
        const label = getDisplayKey(hex, system);
        const textColor = getContrastColor(hex);

        ctx.fillStyle = textColor;
        ctx.font = `${Math.floor(cellSize * 0.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
      }
    }
  }
}

export function drawBoardSplitOverlay(
  canvas: HTMLCanvasElement,
  gridRows: number,
  gridCols: number,
  boardSize: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || gridRows === 0 || gridCols === 0) return;

  const cellSize = canvas.width / gridCols;
  const boardRows = Math.ceil(gridRows / boardSize);
  const boardCols = Math.ceil(gridCols / boardSize);

  ctx.save();
  ctx.strokeStyle = 'rgba(220, 53, 69, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);

  for (let br = 1; br < boardRows; br++) {
    const y = br * boardSize * cellSize;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  for (let bc = 1; bc < boardCols; bc++) {
    const x = bc * boardSize * cellSize;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.font = `bold ${Math.max(10, cellSize * 2)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let br = 0; br < boardRows; br++) {
    for (let bc = 0; bc < boardCols; bc++) {
      const label = String.fromCharCode(65 + br) + String(bc + 1);
      const cx = (bc * boardSize + Math.min(boardSize, gridCols - bc * boardSize) / 2) * cellSize;
      const cy = (br * boardSize + Math.min(boardSize, gridRows - br * boardSize) / 2) * cellSize;

      ctx.fillStyle = 'rgba(220, 53, 69, 0.15)';
      ctx.fillRect(cx - cellSize * 2, cy - cellSize * 1.2, cellSize * 4, cellSize * 2.4);
      ctx.fillStyle = 'rgba(220, 53, 69, 0.8)';
      ctx.fillText(label, cx, cy);
    }
  }
  ctx.restore();
}

/**
 * Map a pointer event position (in client/viewport coordinates) to the
 * corresponding grid cell.
 *
 * Returns `null` when the position is outside the canvas bounds.
 */
export function getCellAt(
  canvas: HTMLCanvasElement,
  grid: MappedPixel[][],
  clientX: number,
  clientY: number,
): { row: number; col: number; cell: MappedPixel } | null {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  if (rows === 0 || cols === 0) return null;

  const rect = canvas.getBoundingClientRect();

  // Scale factors account for CSS sizing vs. actual canvas pixel dimensions
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;

  const cellSize = canvas.width / cols;

  const col = Math.floor(canvasX / cellSize);
  const row = Math.floor(canvasY / cellSize);

  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;

  return { row, col, cell: grid[row][col] };
}
