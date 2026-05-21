import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor } from './palette';

interface ColorEntry {
  hex: string;
  rgb: { r: number; g: number; b: number };
  total: number;
  completed: number;
}

interface FocusState {
  grid: MappedPixel[][];
  system: ColorSystem;
  colors: ColorEntry[];
  activeIndex: number;
  completedCells: Set<string>;
}

let state: FocusState | null = null;

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

function getConnectedRegion(
  grid: MappedPixel[][],
  startRow: number,
  startCol: number,
  targetHex: string,
  completedCells: Set<string>
): string[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set<string>();
  const region: string[] = [];
  const stack: [number, number][] = [[startRow, startCol]];

  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = cellKey(r, c);
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = grid[r][c];
    if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
    const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
    if (hex !== targetHex) continue;
    if (completedCells.has(key)) continue;

    region.push(key);
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return region;
}

export function buildColorList(grid: MappedPixel[][]): ColorEntry[] {
  const map = new Map<string, ColorEntry>();
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const entry = map.get(hex);
      if (entry) {
        entry.total++;
      } else {
        map.set(hex, { hex, rgb: { ...cell.color }, total: 1, completed: 0 });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function enterFocusMode(
  grid: MappedPixel[][],
  system: ColorSystem,
  canvas: HTMLCanvasElement,
  container: HTMLElement
): void {
  const colors = buildColorList(grid);
  if (colors.length === 0) return;

  state = {
    grid,
    system,
    colors,
    activeIndex: 0,
    completedCells: new Set(),
  };

  renderFocusUI(container);
  drawFocusCanvas(canvas);
  setupFocusCanvasClick(canvas);
}

export function exitFocusMode(container: HTMLElement): void {
  state = null;
  container.innerHTML = '';
}

export function isFocusActive(): boolean {
  return state !== null;
}

function renderFocusUI(container: HTMLElement): void {
  if (!state) return;

  const { colors, activeIndex, system } = state;
  const totalBeads = colors.reduce((s, c) => s + c.total, 0);
  const completedBeads = colors.reduce((s, c) => s + c.completed, 0);
  const completedColors = colors.filter(c => c.completed >= c.total).length;

  container.innerHTML = `
    <div class="focus-header">
      <div class="focus-progress-summary">
        <span>进度：${completedColors}/${colors.length} 种颜色</span>
        <span>${completedBeads}/${totalBeads} 粒</span>
      </div>
      <div class="focus-progress-bar">
        <div class="focus-progress-fill" style="width:${totalBeads ? (completedBeads / totalBeads * 100) : 0}%"></div>
      </div>
    </div>
    <div class="focus-color-list"></div>
    <div class="focus-nav">
      <button class="btn btn--sm" data-focus="prev" ${activeIndex === 0 ? 'disabled' : ''}>上一个</button>
      <button class="btn btn--sm btn--primary" data-focus="next">${activeIndex >= colors.length - 1 ? '完成' : '下一个颜色'}</button>
    </div>
  `;

  const list = container.querySelector('.focus-color-list')!;
  colors.forEach((c, i) => {
    const done = c.completed >= c.total;
    const active = i === activeIndex;
    const key = getDisplayKey(c.hex, system);
    const pct = c.total ? Math.round(c.completed / c.total * 100) : 0;

    const row = document.createElement('div');
    row.className = 'focus-color-row' + (active ? ' active' : '') + (done ? ' done' : '');
    row.innerHTML = `
      <span class="color-swatch" style="background:${c.hex}"></span>
      <span class="focus-color-key">${key}</span>
      <span class="focus-color-count">${c.completed}/${c.total}</span>
      <div class="focus-color-bar"><div class="focus-color-bar-fill" style="width:${pct}%"></div></div>
      ${done ? '<span class="focus-check">✓</span>' : ''}
    `;
    row.addEventListener('click', () => {
      if (state) {
        state.activeIndex = i;
        renderFocusUI(container);
        drawFocusCanvas(container.closest('.layout')!.querySelector('#previewCanvas')!);
      }
    });
    list.appendChild(row);
  });

  container.querySelector('[data-focus="prev"]')!.addEventListener('click', () => {
    if (state && state.activeIndex > 0) {
      state.activeIndex--;
      renderFocusUI(container);
      drawFocusCanvas(container.closest('.layout')!.querySelector('#previewCanvas')!);
    }
  });

  container.querySelector('[data-focus="next"]')!.addEventListener('click', () => {
    if (!state) return;
    if (state.activeIndex < state.colors.length - 1) {
      state.activeIndex++;
      renderFocusUI(container);
      drawFocusCanvas(container.closest('.layout')!.querySelector('#previewCanvas')!);
    }
  });

  // Scroll active row into view
  const activeRow = list.querySelector('.focus-color-row.active');
  if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
}

export function drawFocusCanvas(canvas: HTMLCanvasElement): void {
  if (!state) return;

  const { grid, colors, activeIndex, completedCells, system } = state;
  const rows = grid.length;
  const cols = grid[0].length;
  const activeHex = colors[activeIndex].hex;

  const cellSize = Math.max(4, Math.min(40, Math.floor(800 / Math.max(cols, rows))));
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;

  const ctx = canvas.getContext('2d')!;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;
      const key = cellKey(r, c);
      const isBlank = cell.isExternal || cell.paletteId === TRANSPARENT_KEY;
      const hex = isBlank ? '' : rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const isDone = completedCells.has(key);
      const isActive = hex === activeHex;

      if (isBlank) {
        ctx.fillStyle = '#F5F5F5';
      } else if (isDone) {
        ctx.fillStyle = hex;
        ctx.globalAlpha = 0.4;
      } else if (isActive) {
        ctx.fillStyle = hex;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#E8E8E8';
        ctx.globalAlpha = 0.6;
      }

      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.globalAlpha = 1;

      // Grid line
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);

      // Label on active cells
      if (isActive && !isDone && cellSize >= 14) {
        const label = getDisplayKey(hex, system);
        ctx.fillStyle = getContrastColor(hex);
        ctx.font = `${Math.max(6, Math.floor(cellSize * 0.35))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
      }

      // Checkmark on completed
      if (isDone && !isBlank && cellSize >= 10) {
        ctx.fillStyle = 'rgba(40,167,69,0.7)';
        ctx.font = `${Math.floor(cellSize * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', x + cellSize / 2, y + cellSize / 2);
      }
    }
  }
}

function setupFocusCanvasClick(canvas: HTMLCanvasElement): void {
  const handler = (e: MouseEvent) => {
    if (!state) {
      canvas.removeEventListener('click', handler);
      return;
    }

    const { grid, colors, activeIndex, completedCells } = state;
    const rows = grid.length;
    const cols = grid[0].length;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const cellSize = canvas.width / cols;
    const col = Math.floor(mx / cellSize);
    const row = Math.floor(my / cellSize);

    if (row < 0 || row >= rows || col < 0 || col >= cols) return;

    const cell = grid[row][col];
    if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) return;

    const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
    const activeHex = colors[activeIndex].hex;
    if (hex !== activeHex) return;

    const key = cellKey(row, col);
    if (completedCells.has(key)) return;

    // Mark entire connected region as completed
    const region = getConnectedRegion(grid, row, col, activeHex, completedCells);
    for (const rk of region) {
      completedCells.add(rk);
    }
    colors[activeIndex].completed += region.length;

    // Re-render
    const container = canvas.closest('.layout')!.querySelector('#focusPanel') as HTMLElement;
    if (container) renderFocusUI(container);
    drawFocusCanvas(canvas);
  };

  canvas.addEventListener('click', handler);
}
