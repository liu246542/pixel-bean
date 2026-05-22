import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, buildFullPalette, convertPaletteToSystem } from './palette';
import { EditHistory } from './history';
import { drawPreview, getCellAt } from './preview';

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface EditorResult {
  grid: MappedPixel[][];
}

export function showEditor(
  grid: MappedPixel[][],
  system: ColorSystem,
  onSave: (result: EditorResult) => void
): void {
  if (grid.length === 0) return;

  // Deep clone grid for editing
  let editGrid = grid.map(row => row.map(cell => ({ ...cell, color: { ...cell.color } })));
  const history = new EditHistory();
  history.push(editGrid);

  let editColor: { rgb: { r: number; g: number; b: number }; hex: string } | null = null;

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.innerHTML = `
    <div class="editor-layout">
      <div class="editor-canvas-area">
        <canvas class="editor-canvas"></canvas>
      </div>
      <div class="editor-sidebar">
        <div class="editor-header">
          <h3>编辑模式</h3>
          <div class="editor-header-btns">
            <button class="btn btn--sm" data-editor="cancel">取消</button>
            <button class="btn btn--sm btn--primary" data-editor="save">保存</button>
          </div>
        </div>
        <div class="editor-tools">
          <button class="btn btn--sm" data-editor="undo" disabled>撤销</button>
          <button class="btn btn--sm" data-editor="redo" disabled>重做</button>
        </div>
        <div class="editor-palette-label">选择颜色</div>
        <div class="editor-palette"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector('.editor-canvas') as HTMLCanvasElement;
  const palette = overlay.querySelector('.editor-palette') as HTMLDivElement;
  const undoBtn = overlay.querySelector('[data-editor="undo"]') as HTMLButtonElement;
  const redoBtn = overlay.querySelector('[data-editor="redo"]') as HTMLButtonElement;

  function redraw(): void {
    const area = canvas.parentElement!;
    const rows = editGrid.length;
    const cols = rows > 0 ? editGrid[0].length : 0;
    if (rows === 0 || cols === 0) return;

    const cellSize = Math.max(6, Math.floor(Math.min(
      (area.clientWidth - 24) / cols,
      (area.clientHeight - 24) / rows
    )));
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    drawPreview(canvas, editGrid, system);
  }

  function updateButtons(): void {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }

  function buildPalette(): void {
    palette.innerHTML = '';
    // Colors currently in grid
    const inGrid = new Map<string, { r: number; g: number; b: number }>();
    for (const row of editGrid) {
      for (const cell of row) {
        if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
        const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
        if (!inGrid.has(hex)) inGrid.set(hex, { ...cell.color });
      }
    }

    // Add more from the active palette
    const activePalette = convertPaletteToSystem(buildFullPalette(), system);
    for (const pc of activePalette.slice(0, 40)) {
      const hex = pc.name.toUpperCase();
      if (!inGrid.has(hex) && pc.color) inGrid.set(hex, { ...pc.color });
    }

    for (const [hex, rgb] of inGrid) {
      const swatch = document.createElement('div');
      swatch.className = 'editor-swatch';
      swatch.style.backgroundColor = hex;
      swatch.title = getDisplayKey(hex, system);
      swatch.addEventListener('click', () => {
        editColor = { rgb, hex };
        palette.querySelectorAll('.editor-swatch').forEach(el => el.classList.remove('active'));
        swatch.classList.add('active');
      });
      palette.appendChild(swatch);
    }
  }

  // Canvas click to paint
  canvas.addEventListener('click', (e) => {
    if (!editColor) return;
    const hit = getCellAt(canvas, editGrid, e.clientX, e.clientY);
    if (!hit || hit.cell.isExternal) return;

    const curHex = rgbToHex(hit.cell.color.r, hit.cell.color.g, hit.cell.color.b);
    if (curHex === editColor.hex) return;

    hit.cell.color = { ...editColor.rgb };
    hit.cell.paletteId = editColor.hex;
    history.push(editGrid);
    updateButtons();
    redraw();
  });

  // Undo/redo
  undoBtn.addEventListener('click', () => {
    const prev = history.undo();
    if (prev) { editGrid = prev; redraw(); updateButtons(); }
  });
  redoBtn.addEventListener('click', () => {
    const next = history.redo();
    if (next) { editGrid = next; redraw(); updateButtons(); }
  });

  // Resize
  const resizeObs = new ResizeObserver(() => redraw());
  resizeObs.observe(canvas.parentElement!);

  function teardown(): void {
    resizeObs.disconnect();
    overlay.remove();
  }

  // Save
  overlay.querySelector('[data-editor="save"]')!.addEventListener('click', () => {
    teardown();
    onSave({ grid: editGrid });
  });

  // Cancel
  overlay.querySelector('[data-editor="cancel"]')!.addEventListener('click', () => {
    teardown();
  });

  buildPalette();
  redraw();
}
