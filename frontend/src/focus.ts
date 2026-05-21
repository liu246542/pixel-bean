import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor } from './palette';
import { splitBoards, extractBoard, type BoardInfo } from './board-split';

interface ColorEntry {
  hex: string;
  total: number;
  completed: number;
}

interface FocusState {
  grid: MappedPixel[][];
  system: ColorSystem;
  colors: ColorEntry[];
  activeIndex: number;
  completedCells: Set<string>;
  overlay: HTMLElement;
  canvas: HTMLCanvasElement;
  panel: HTMLElement;
  clickAbort: AbortController;
  resizeObserver: ResizeObserver;
  onExit: () => void;
  boards: BoardInfo[] | null;
  activeBoardIndex: number;
}

let state: FocusState | null = null;

const RULER_SIZE = 24;

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

function buildColorList(grid: MappedPixel[][]): ColorEntry[] {
  const map = new Map<string, ColorEntry>();
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const entry = map.get(hex);
      if (entry) {
        entry.total++;
      } else {
        map.set(hex, { hex, total: 1, completed: 0 });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function markColorDone(colorEntry: ColorEntry): void {
  if (!state) return;
  const { grid, completedCells } = state;
  const rows = grid.length;
  const cols = grid[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      if (hex === colorEntry.hex) {
        completedCells.add(cellKey(r, c));
      }
    }
  }
  colorEntry.completed = colorEntry.total;
}

function unmarkColor(colorEntry: ColorEntry): void {
  if (!state) return;
  const { grid, completedCells } = state;
  const rows = grid.length;
  const cols = grid[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      if (hex === colorEntry.hex) {
        completedCells.delete(cellKey(r, c));
      }
    }
  }
  colorEntry.completed = 0;
}

function getViewGrid(): { grid: MappedPixel[][]; rowOffset: number; colOffset: number } {
  if (!state) return { grid: [], rowOffset: 0, colOffset: 0 };
  if (state.boards) {
    const board = state.boards[state.activeBoardIndex];
    return { grid: extractBoard(state.grid, board), rowOffset: board.rowStart, colOffset: board.colStart };
  }
  return { grid: state.grid, rowOffset: 0, colOffset: 0 };
}

export function isFocusActive(): boolean {
  return state !== null;
}

export function redrawFocus(): void {
  if (state) drawFocusCanvas();
}

export function enterFocusMode(
  grid: MappedPixel[][],
  system: ColorSystem,
  onExit: () => void,
  boardSize?: number
): boolean {
  if (state) return false;
  const colors = buildColorList(grid);
  if (colors.length === 0) return false;

  const boards = boardSize ? splitBoards(grid.length, grid[0].length, boardSize) : null;

  // Create fullscreen overlay
  const overlay = document.createElement('div');
  overlay.className = 'focus-overlay';
  overlay.innerHTML = `
    <div class="focus-layout">
      <div class="focus-canvas-area">
        <div class="focus-canvas-wrap">
          <canvas class="focus-canvas"></canvas>
          <canvas class="focus-crosshair"></canvas>
        </div>
        <div class="focus-coord-label hidden"></div>
      </div>
      <div class="focus-sidebar"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('.focus-canvas') as HTMLCanvasElement;
  const panel = overlay.querySelector('.focus-sidebar') as HTMLElement;
  const clickAbort = new AbortController();
  const canvasArea = overlay.querySelector('.focus-canvas-area') as HTMLElement;
  const resizeObserver = new ResizeObserver(() => {
    drawFocusCanvas();
    const cross = overlay.querySelector('.focus-crosshair') as HTMLCanvasElement | null;
    if (cross) {
      const ctx = cross.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, cross.width, cross.height);
    }
  });
  resizeObserver.observe(canvasArea);

  state = {
    grid, system, colors,
    activeIndex: 0,
    completedCells: new Set(),
    overlay, canvas, panel,
    clickAbort, resizeObserver, onExit,
    boards,
    activeBoardIndex: 0,
  };

  renderFocusUI();
  drawFocusCanvas();
  setupFocusCanvasClick();
  setupCrosshair();
  return true;
}

export function exitFocusMode(): void {
  if (!state) return;
  state.clickAbort.abort();
  state.resizeObserver.disconnect();
  state.overlay.remove();
  state = null;
}

function renderFocusUI(): void {
  if (!state) return;

  const { colors, activeIndex, system, panel } = state;
  const totalBeads = colors.reduce((s, c) => s + c.total, 0);
  const completedBeads = colors.reduce((s, c) => s + c.completed, 0);
  const completedColors = colors.filter(c => c.completed >= c.total).length;
  const allDone = completedBeads >= totalBeads;

  const { boards, activeBoardIndex } = state;
  const boardLabel = boards ? boards[activeBoardIndex].label : '';

  panel.innerHTML = `
    <div class="focus-header">
      <h3>专注拼豆</h3>
      <button class="btn btn--sm" data-focus="exit">退出</button>
    </div>
    ${boards ? `
    <div class="focus-board-nav">
      <button class="btn btn--sm" data-focus="board-prev" ${activeBoardIndex === 0 ? 'disabled' : ''}>◀</button>
      <span class="focus-board-label">板块 ${boardLabel} (${activeBoardIndex + 1}/${boards.length})</span>
      <button class="btn btn--sm" data-focus="board-next" ${activeBoardIndex >= boards.length - 1 ? 'disabled' : ''}>▶</button>
    </div>
    ` : ''}
    <div class="focus-progress-summary">
      <span>${completedColors}/${colors.length} 种颜色</span>
      <span>${completedBeads}/${totalBeads} 粒</span>
    </div>
    <div class="focus-progress-bar">
      <div class="focus-progress-fill" style="width:${totalBeads ? (completedBeads / totalBeads * 100) : 0}%"></div>
    </div>
    ${allDone ? '<div class="focus-done-msg">全部完成！</div>' : ''}
    <div class="focus-color-list"></div>
    <div class="focus-nav">
      <button class="btn btn--sm" data-focus="prev" ${activeIndex === 0 ? 'disabled' : ''}>上一个颜色</button>
      <button class="btn btn--sm btn--primary" data-focus="next" ${allDone || activeIndex >= colors.length - 1 ? 'disabled' : ''}>下一个颜色</button>
    </div>
  `;

  // Exit button
  panel.querySelector('[data-focus="exit"]')!.addEventListener('click', () => {
    if (state) {
      const cb = state.onExit;
      exitFocusMode();
      cb();
    }
  });

  // Color list with checkboxes
  const list = panel.querySelector('.focus-color-list')!;
  colors.forEach((c, i) => {
    const done = c.completed >= c.total;
    const active = i === activeIndex;
    const key = getDisplayKey(c.hex, system);
    const pct = c.total ? Math.round(c.completed / c.total * 100) : 0;

    const row = document.createElement('div');
    row.className = 'focus-color-row' + (active ? ' active' : '') + (done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done;
    checkbox.className = 'focus-checkbox';
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        markColorDone(c);
      } else {
        unmarkColor(c);
      }
      renderFocusUI();
      drawFocusCanvas();
    });

    const content = document.createElement('div');
    content.className = 'focus-color-content';
    content.innerHTML = `
      <span class="color-swatch" style="background:${c.hex}"></span>
      <span class="focus-color-key">${key}</span>
      <span class="focus-color-count">${c.completed}/${c.total}</span>
      <div class="focus-color-bar"><div class="focus-color-bar-fill" style="width:${pct}%"></div></div>
    `;
    content.addEventListener('click', () => {
      if (state) {
        state.activeIndex = i;
        renderFocusUI();
        drawFocusCanvas();
      }
    });

    row.appendChild(checkbox);
    row.appendChild(content);
    list.appendChild(row);
  });

  // Nav buttons
  panel.querySelector('[data-focus="prev"]')!.addEventListener('click', () => {
    if (state && state.activeIndex > 0) {
      state.activeIndex--;
      renderFocusUI();
      drawFocusCanvas();
    }
  });

  panel.querySelector('[data-focus="next"]')!.addEventListener('click', () => {
    if (state && state.activeIndex < state.colors.length - 1) {
      state.activeIndex++;
      renderFocusUI();
      drawFocusCanvas();
    }
  });

  // Board nav buttons
  panel.querySelector('[data-focus="board-prev"]')?.addEventListener('click', () => {
    if (state && state.activeBoardIndex > 0) {
      state.activeBoardIndex--;
      renderFocusUI();
      drawFocusCanvas();
    }
  });
  panel.querySelector('[data-focus="board-next"]')?.addEventListener('click', () => {
    if (state && state.boards && state.activeBoardIndex < state.boards.length - 1) {
      state.activeBoardIndex++;
      renderFocusUI();
      drawFocusCanvas();
    }
  });

  const activeRow = list.querySelector('.focus-color-row.active');
  if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
}

function drawFocusCanvas(): void {
  if (!state) return;

  const { colors, activeIndex, completedCells, system, canvas } = state;
  const view = getViewGrid();
  const viewGrid = view.grid;
  const rows = viewGrid.length;
  const cols = rows > 0 ? viewGrid[0].length : 0;
  if (rows === 0 || cols === 0) return;
  const activeHex = colors[activeIndex].hex;

  // Calculate cell size to fill the canvas area (grandparent of canvas)
  const area = canvas.closest('.focus-canvas-area') as HTMLElement;
  const availW = area.clientWidth - RULER_SIZE - 24;
  const availH = area.clientHeight - RULER_SIZE - 24;
  const cellSize = Math.max(6, Math.floor(Math.min(availW / cols, availH / rows)));

  canvas.width = cols * cellSize + RULER_SIZE;
  canvas.height = rows * cellSize + RULER_SIZE;

  const ctx = canvas.getContext('2d')!;
  const ox = RULER_SIZE;
  const oy = RULER_SIZE;

  // ── Ruler background ──
  ctx.fillStyle = '#F0F0F0';
  ctx.fillRect(0, 0, canvas.width, RULER_SIZE);
  ctx.fillRect(0, 0, RULER_SIZE, canvas.height);

  // ── Column numbers (top) ──
  ctx.fillStyle = '#888';
  ctx.font = `${Math.min(10, cellSize * 0.6)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = 0; c < cols; c++) {
    if (cellSize < 10 && c % 5 !== 0) continue;
    ctx.fillText(String(c + 1), ox + c * cellSize + cellSize / 2, RULER_SIZE / 2);
  }

  // ── Row numbers (left) ──
  ctx.textAlign = 'right';
  for (let r = 0; r < rows; r++) {
    if (cellSize < 10 && r % 5 !== 0) continue;
    ctx.fillText(String(r + 1), RULER_SIZE - 3, oy + r * cellSize + cellSize / 2);
  }

  // ── Grid cells ──
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = viewGrid[r][c];
      const x = ox + c * cellSize;
      const y = oy + r * cellSize;
      const key = cellKey(r + view.rowOffset, c + view.colOffset);
      const isBlank = cell.isExternal || cell.paletteId === TRANSPARENT_KEY;
      const hex = isBlank ? '' : rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const isDone = completedCells.has(key);
      const isActive = hex === activeHex;

      if (isBlank) {
        ctx.fillStyle = '#FAFAFA';
      } else if (isDone) {
        ctx.fillStyle = hex;
        ctx.globalAlpha = 0.35;
      } else if (isActive) {
        ctx.fillStyle = hex;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#E8E8E8';
        ctx.globalAlpha = 0.5;
      }

      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);

      if (isActive && !isDone && cellSize >= 14) {
        const label = getDisplayKey(hex, system);
        ctx.fillStyle = getContrastColor(hex);
        ctx.font = `${Math.max(6, Math.floor(cellSize * 0.35))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
      }

      if (isDone && !isBlank && cellSize >= 10) {
        ctx.fillStyle = 'rgba(40,167,69,0.6)';
        ctx.font = `${Math.floor(cellSize * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', x + cellSize / 2, y + cellSize / 2);
      }
    }
  }
}

function setupFocusCanvasClick(): void {
  if (!state) return;
  const { canvas, clickAbort } = state;

  canvas.addEventListener('click', (e: MouseEvent) => {
    if (!state) return;

    const { colors, activeIndex, completedCells } = state;
    const view = getViewGrid();
    const viewGrid = view.grid;
    const rows = viewGrid.length;
    const cols = rows > 0 ? viewGrid[0].length : 0;
    if (rows === 0 || cols === 0) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX - RULER_SIZE;
    const my = (e.clientY - rect.top) * scaleY - RULER_SIZE;

    const cellSize = (canvas.width - RULER_SIZE) / cols;
    const col = Math.floor(mx / cellSize);
    const row = Math.floor(my / cellSize);

    if (row < 0 || row >= rows || col < 0 || col >= cols) return;

    const cell = viewGrid[row][col];
    if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) return;

    const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
    const activeHex = colors[activeIndex].hex;
    if (hex !== activeHex) return;

    // Use global coordinates for completedCells
    const globalRow = row + view.rowOffset;
    const globalCol = col + view.colOffset;
    const key = cellKey(globalRow, globalCol);
    if (completedCells.has(key)) return;

    // Flood fill within the visible board only
    // Build a local completedCells set for the sub-grid
    const localCompleted = new Set<string>();
    for (const ck of completedCells) {
      const [cr, cc] = ck.split(',').map(Number);
      const lr = cr - view.rowOffset;
      const lc = cc - view.colOffset;
      if (lr >= 0 && lr < rows && lc >= 0 && lc < cols) {
        localCompleted.add(cellKey(lr, lc));
      }
    }
    const localRegion = getConnectedRegion(viewGrid, row, col, activeHex, localCompleted);
    for (const lk of localRegion) {
      const [lr, lc] = lk.split(',').map(Number);
      completedCells.add(cellKey(lr + view.rowOffset, lc + view.colOffset));
    }
    colors[activeIndex].completed += localRegion.length;

    renderFocusUI();
    drawFocusCanvas();
  }, { signal: clickAbort.signal });
}

function setupCrosshair(): void {
  if (!state) return;
  const { canvas, overlay, clickAbort } = state;
  const crossCanvas = overlay.querySelector('.focus-crosshair') as HTMLCanvasElement;
  const coordLabel = overlay.querySelector('.focus-coord-label') as HTMLElement;

  let lastRow = -1, lastCol = -1;
  let rafId = 0;

  function syncSize(): void {
    if (crossCanvas.width !== canvas.width) crossCanvas.width = canvas.width;
    if (crossCanvas.height !== canvas.height) crossCanvas.height = canvas.height;
  }

  function hitToGrid(clientX: number, clientY: number): { row: number; col: number } | null {
    if (!state) return null;
    const view = getViewGrid();
    const rows = view.grid.length;
    const cols = rows > 0 ? view.grid[0].length : 0;
    if (rows === 0 || cols === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (clientX - rect.left) * scaleX - RULER_SIZE;
    const my = (clientY - rect.top) * scaleY - RULER_SIZE;
    const cellSize = (canvas.width - RULER_SIZE) / cols;
    const col = Math.floor(mx / cellSize);
    const row = Math.floor(my / cellSize);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  }

  function drawCrosshair(row: number, col: number): void {
    if (!state) return;
    const view = getViewGrid();
    const rows = view.grid.length;
    const cols = rows > 0 ? view.grid[0].length : 0;
    if (rows === 0 || cols === 0) return;
    const cellSize = (canvas.width - RULER_SIZE) / cols;
    const ox = RULER_SIZE;
    const oy = RULER_SIZE;

    syncSize();
    const ctx = crossCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, crossCanvas.width, crossCanvas.height);

    ctx.strokeStyle = 'rgba(74, 144, 217, 0.4)';
    ctx.lineWidth = 1;

    const hy = oy + row * cellSize + cellSize / 2;
    ctx.beginPath(); ctx.moveTo(ox, hy); ctx.lineTo(ox + cols * cellSize, hy); ctx.stroke();

    const vx = ox + col * cellSize + cellSize / 2;
    ctx.beginPath(); ctx.moveTo(vx, oy); ctx.lineTo(vx, oy + rows * cellSize); ctx.stroke();

    ctx.strokeStyle = 'rgba(74, 144, 217, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + col * cellSize, oy + row * cellSize, cellSize, cellSize);

    ctx.fillStyle = 'rgba(74, 144, 217, 0.2)';
    ctx.fillRect(ox + col * cellSize, 0, cellSize, RULER_SIZE);
    ctx.fillRect(0, oy + row * cellSize, RULER_SIZE, cellSize);
  }

  function clearCrosshair(): void {
    lastRow = -1; lastCol = -1;
    cancelAnimationFrame(rafId);
    const ctx = crossCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, crossCanvas.width, crossCanvas.height);
    coordLabel.classList.add('hidden');
  }

  function onPointer(clientX: number, clientY: number): void {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const hit = hitToGrid(clientX, clientY);
      if (!hit) { clearCrosshair(); return; }

      // Always update position so label follows cursor smoothly
      const area = canvas.closest('.focus-canvas-area') as HTMLElement;
      const areaRect = area.getBoundingClientRect();
      coordLabel.style.left = `${clientX - areaRect.left + area.scrollLeft + 16}px`;
      coordLabel.style.top = `${clientY - areaRect.top + area.scrollTop - 12}px`;

      if (hit.row === lastRow && hit.col === lastCol) return;
      lastRow = hit.row; lastCol = hit.col;
      drawCrosshair(hit.row, hit.col);
      coordLabel.textContent = `R${hit.row + 1} C${hit.col + 1}`;
      coordLabel.classList.remove('hidden');
    });
  }

  canvas.addEventListener('mousemove', (e) => onPointer(e.clientX, e.clientY), { signal: clickAbort.signal });
  canvas.addEventListener('mouseleave', clearCrosshair, { signal: clickAbort.signal });

  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) onPointer(t.clientX, t.clientY);
  }, { signal: clickAbort.signal, passive: true });
  canvas.addEventListener('touchend', clearCrosshair, { signal: clickAbort.signal });
  canvas.addEventListener('touchcancel', clearCrosshair, { signal: clickAbort.signal });
}
