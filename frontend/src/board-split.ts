import type { MappedPixel } from './types';

export interface BoardInfo {
  label: string;
  rowStart: number;
  colStart: number;
  rows: number;
  cols: number;
}

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
      const rows = Math.min(boardSize, gridRows - rowStart);
      const cols = Math.min(boardSize, gridCols - colStart);

      const rowLabel = String.fromCharCode(65 + br);
      const colLabel = String(bc + 1);

      boards.push({ label: `${rowLabel}${colLabel}`, rowStart, colStart, rows, cols });
    }
  }
  return boards;
}

export function extractBoard(
  grid: MappedPixel[][],
  board: BoardInfo
): MappedPixel[][] {
  const sub: MappedPixel[][] = [];
  for (let r = 0; r < board.rows; r++) {
    const row: MappedPixel[] = [];
    for (let c = 0; c < board.cols; c++) {
      const cell = grid[board.rowStart + r][board.colStart + c];
      row.push({ ...cell, color: { ...cell.color } });
    }
    sub.push(row);
  }
  return sub;
}
