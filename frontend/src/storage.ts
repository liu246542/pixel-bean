import type { MappedPixel, ColorSystem, PixelationMode } from './types';
import { hexToRgb } from './palette';

const AUTO_SAVE_KEY = 'pixel-bean-autosave';

export interface SavedState {
  grid: { hex: string; ext?: boolean }[][];
  system: ColorSystem;
  mode: PixelationMode;
  granularity: number;
  mergeThreshold: number;
  timestamp: number;
}

function gridToCompact(grid: MappedPixel[][]): { hex: string; ext?: boolean }[][] {
  return grid.map(row =>
    row.map(cell => {
      const hex = '#' + [cell.color.r, cell.color.g, cell.color.b]
        .map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      return cell.isExternal ? { hex, ext: true } : { hex };
    })
  );
}

function compactToGrid(compact: { hex: string; ext?: boolean }[][]): MappedPixel[][] {
  return compact.map(row =>
    row.map(cell => {
      const rgb = hexToRgb(cell.hex);
      return {
        paletteId: cell.hex,
        color: rgb ?? { r: 0, g: 0, b: 0 },
        isExternal: cell.ext ?? false,
      };
    })
  );
}

export function autoSave(
  grid: MappedPixel[][],
  system: ColorSystem,
  mode: PixelationMode,
  granularity: number,
  mergeThreshold: number,
): void {
  if (grid.length === 0) return;
  const data: SavedState = {
    grid: gridToCompact(grid),
    system,
    mode,
    granularity,
    mergeThreshold,
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(data));
  } catch {}
}

export function autoLoad(): SavedState | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedState;
    if (!data.grid || !Array.isArray(data.grid) || data.grid.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

export function restoreGrid(saved: SavedState): MappedPixel[][] {
  return compactToGrid(saved.grid);
}

// ── CSV export/import (compatible with Zippland/perler-beads) ───────────

export function exportCsv(grid: MappedPixel[][]): void {
  const lines: string[] = [];
  for (const row of grid) {
    const cells = row.map(cell => {
      if (cell.isExternal) return 'TRANSPARENT';
      return '#' + [cell.color.r, cell.color.g, cell.color.b]
        .map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    });
    lines.push(cells.join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pixel-bean-${grid[0].length}x${grid.length}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function importCsv(file: File): Promise<MappedPixel[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = (reader.result as string).trim();
        if (!text) { reject(new Error('空文件')); return; }

        const lines = text.split('\n');
        const grid: MappedPixel[][] = [];

        for (const line of lines) {
          const row: MappedPixel[] = [];
          for (const cell of line.split(',')) {
            const val = cell.trim();
            if (val === 'TRANSPARENT' || val === '') {
              row.push({ paletteId: 'ERASE', color: { r: 255, g: 255, b: 255 }, isExternal: true });
            } else {
              const rgb = hexToRgb(val);
              if (!rgb) { reject(new Error(`无效颜色: ${val}`)); return; }
              row.push({ paletteId: val.toUpperCase(), color: rgb });
            }
          }
          grid.push(row);
        }

        if (grid.length === 0) { reject(new Error('空网格')); return; }
        resolve(grid);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}
