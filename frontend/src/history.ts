import type { MappedPixel } from './types';

function deepCloneGrid(grid: MappedPixel[][]): MappedPixel[][] {
  return grid.map(row => row.map(cell => ({ ...cell, color: { ...cell.color } })));
}

export class EditHistory {
  private stack: MappedPixel[][][] = [];
  private index = -1;
  private maxSize = 50;

  push(grid: MappedPixel[][]): void {
    // Truncate any forward history beyond current position
    this.stack = this.stack.slice(0, this.index + 1);

    this.stack.push(deepCloneGrid(grid));
    this.index = this.stack.length - 1;

    // Trim oldest entries if we exceed maxSize
    if (this.stack.length > this.maxSize) {
      const excess = this.stack.length - this.maxSize;
      this.stack.splice(0, excess);
      this.index = this.stack.length - 1;
    }
  }

  undo(): MappedPixel[][] | null {
    if (this.index <= 0) return null;
    this.index--;
    return deepCloneGrid(this.stack[this.index]);
  }

  redo(): MappedPixel[][] | null {
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    return deepCloneGrid(this.stack[this.index]);
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  clear(): void {
    this.stack = [];
    this.index = -1;
  }
}
