import type { MappedPixel } from './types';
import { TRANSPARENT_KEY } from './types';

export interface BoardInfo {
  label: string;
  rowStart: number;
  colStart: number;
  rows: number;
  cols: number;
}

const EMPTY_CELL: MappedPixel = {
  paletteId: TRANSPARENT_KEY,
  color: { r: 255, g: 255, b: 255 },
  isExternal: true,
};

export function splitBoards(
  gridRows: number,
  gridCols: number,
  boardSize: number
): BoardInfo[] {
  const boards: BoardInfo[] = [];
  const boardRows = Math.ceil(gridRows / boardSize);
  const boardCols = Math.ceil(gridCols / boardSize);

  for (let br = 0; br < boardRows; br++) {
    for (let bc = 0; bc < boardCols; bc++) {
      const rowStart = br * boardSize;
      const colStart = bc * boardSize;

      const rowLabel = String.fromCharCode(65 + br);
      const colLabel = String(bc + 1);

      boards.push({
        label: `${rowLabel}${colLabel}`,
        rowStart,
        colStart,
        rows: boardSize,
        cols: boardSize,
      });
    }
  }
  return boards;
}

export function extractBoard(
  grid: MappedPixel[][],
  board: BoardInfo
): MappedPixel[][] {
  const gridRows = grid.length;
  const gridCols = gridRows > 0 ? grid[0].length : 0;
  const sub: MappedPixel[][] = [];

  for (let r = 0; r < board.rows; r++) {
    const row: MappedPixel[] = [];
    for (let c = 0; c < board.cols; c++) {
      const gr = board.rowStart + r;
      const gc = board.colStart + c;
      if (gr < gridRows && gc < gridCols) {
        const cell = grid[gr][gc];
        row.push({ ...cell, color: { ...cell.color } });
      } else {
        row.push({ ...EMPTY_CELL, color: { ...EMPTY_CELL.color } });
      }
    }
    sub.push(row);
  }
  return sub;
}
