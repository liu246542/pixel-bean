import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor } from './palette';
import { splitBoards, extractBoard } from './board-split';

interface ColorRun {
  row: number;
  colStart: number;
  colEnd: number;
}

interface ColorGuide {
  hex: string;
  displayKey: string;
  total: number;
  runs: ColorRun[];
}

interface RowGuide {
  row: number;
  segments: { hex: string; displayKey: string; colStart: number; colEnd: number; count: number }[];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function generateColorGuide(grid: MappedPixel[][], system: ColorSystem): ColorGuide[] {
  const rows = grid.length;
  if (rows === 0) return [];
  const cols = grid[0].length;

  const colorMap = new Map<string, { hex: string; total: number; runs: ColorRun[] }>();

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const cell = grid[r][c];
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) { c++; continue; }

      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const start = c;

      while (c < cols) {
        const next = grid[r][c];
        if (next.isExternal || next.paletteId === TRANSPARENT_KEY) break;
        if (rgbToHex(next.color.r, next.color.g, next.color.b) !== hex) break;
        c++;
      }

      let entry = colorMap.get(hex);
      if (!entry) { entry = { hex, total: 0, runs: [] }; colorMap.set(hex, entry); }
      entry.total += c - start;
      entry.runs.push({ row: r, colStart: start, colEnd: c - 1 });
    }
  }

  return Array.from(colorMap.values())
    .sort((a, b) => b.total - a.total)
    .map(e => ({ hex: e.hex, displayKey: getDisplayKey(e.hex, system), total: e.total, runs: e.runs }));
}

function generateRowGuide(grid: MappedPixel[][], system: ColorSystem): RowGuide[] {
  const rows = grid.length;
  if (rows === 0) return [];
  const cols = grid[0].length;
  const result: RowGuide[] = [];

  for (let r = 0; r < rows; r++) {
    const segments: RowGuide['segments'] = [];
    let c = 0;
    while (c < cols) {
      const cell = grid[r][c];
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) { c++; continue; }

      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      const start = c;
      while (c < cols) {
        const next = grid[r][c];
        if (next.isExternal || next.paletteId === TRANSPARENT_KEY) break;
        if (rgbToHex(next.color.r, next.color.g, next.color.b) !== hex) break;
        c++;
      }
      segments.push({
        hex,
        displayKey: getDisplayKey(hex, system),
        colStart: start,
        colEnd: c - 1,
        count: c - start,
      });
    }
    if (segments.length > 0) result.push({ row: r, segments });
  }
  return result;
}

function drawGuidePreview(canvas: HTMLCanvasElement, grid: MappedPixel[][], system: ColorSystem, activeHex: string | null, activeRow: number | null): void {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  if (rows === 0 || cols === 0) return;

  const cellSize = Math.max(3, Math.min(20, Math.floor(600 / Math.max(cols, rows))));
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d')!;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;
      const isBlank = cell.isExternal || cell.paletteId === TRANSPARENT_KEY;
      const hex = isBlank ? '' : rgbToHex(cell.color.r, cell.color.g, cell.color.b);

      const isActive = !isBlank && (
        activeHex !== null ? hex === activeHex
        : activeRow !== null ? r === activeRow
        : false
      );

      if (isBlank) { ctx.fillStyle = '#F5F5F5'; }
      else if (isActive) { ctx.fillStyle = hex; ctx.globalAlpha = 1; }
      else { ctx.fillStyle = '#E8E8E8'; ctx.globalAlpha = 0.5; }

      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.globalAlpha = 1;

      if (isActive && cellSize >= 10) {
        ctx.fillStyle = getContrastColor(hex);
        ctx.font = `${Math.max(5, Math.floor(cellSize * 0.4))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getDisplayKey(hex, system), x + cellSize / 2, y + cellSize / 2);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }
}

function formatRunCount(run: ColorRun): number {
  return run.colEnd - run.colStart + 1;
}

export function showGuideModal(grid: MappedPixel[][], system: ColorSystem, boardSize?: number): void {
  if (grid.length === 0) return;

  const boards = boardSize ? splitBoards(grid.length, grid[0].length, boardSize) : null;

  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay';

  overlay.innerHTML = `
    <div class="guide-layout">
      <div class="guide-content">
        <div class="guide-preview">
          <div class="guide-preview-header" data-guide="toggle-preview">
            <span>预览图</span>
            <span class="guide-preview-arrow">▼</span>
          </div>
          <div class="guide-preview-body">
            <canvas class="guide-canvas"></canvas>
          </div>
        </div>
        <div class="guide-text"></div>
      </div>
      <div class="guide-sidebar">
        <div class="guide-header">
          <h3>引导模式</h3>
          <button class="btn btn--sm" data-guide="exit">退出</button>
        </div>
        ${boards ? '<div class="guide-board-nav"></div>' : ''}
        <div class="guide-mode-switch">
          <button class="btn btn--sm active" data-mode="color">按颜色</button>
          <button class="btn btn--sm" data-mode="row">按行</button>
        </div>
        <div class="guide-nav-list"></div>
        <div class="guide-step-nav">
          <button class="btn btn--sm" data-step="prev">上一个</button>
          <button class="btn btn--sm btn--primary" data-step="next">下一个</button>
        </div>
        <div class="guide-actions">
          <button class="btn btn--sm" data-guide="copy">复制全部</button>
          <button class="btn btn--sm" data-guide="export">导出文本</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const textArea = overlay.querySelector('.guide-text') as HTMLElement;
  const guideCanvas = overlay.querySelector('.guide-canvas') as HTMLCanvasElement;
  const navList = overlay.querySelector('.guide-nav-list') as HTMLElement;

  let mode: 'color' | 'row' = 'color';
  let activeColorIdx = 0;
  let activeRowIdx = 0;
  let activeBoardIdx = 0;

  function getActiveGrid(): MappedPixel[][] {
    if (boards) return extractBoard(grid, boards[activeBoardIdx]);
    return grid;
  }

  // Board navigation
  function renderBoardNav(): void {
    if (!boards) return;
    const container = overlay.querySelector('.guide-board-nav') as HTMLElement;
    container.innerHTML = `
      <div class="guide-board-bar">
        <button class="btn btn--sm" data-board="prev" ${activeBoardIdx === 0 ? 'disabled' : ''}>◀</button>
        <span class="guide-board-label">板块 ${boards[activeBoardIdx].label} (${activeBoardIdx + 1}/${boards.length})</span>
        <button class="btn btn--sm" data-board="next" ${activeBoardIdx >= boards.length - 1 ? 'disabled' : ''}>▶</button>
      </div>
    `;
    container.querySelector('[data-board="prev"]')?.addEventListener('click', () => {
      if (activeBoardIdx > 0) { activeBoardIdx--; activeColorIdx = 0; activeRowIdx = 0; renderAll(); }
    });
    container.querySelector('[data-board="next"]')?.addEventListener('click', () => {
      if (boards && activeBoardIdx < boards.length - 1) { activeBoardIdx++; activeColorIdx = 0; activeRowIdx = 0; renderAll(); }
    });
  }

  // Mode switch
  overlay.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = (btn as HTMLElement).dataset.mode as 'color' | 'row';
      if (m === mode) return;
      mode = m;
      overlay.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode));
      activeColorIdx = 0;
      activeRowIdx = 0;
      renderAll();
    });
  });

  // Toggle preview
  overlay.querySelector('[data-guide="toggle-preview"]')!.addEventListener('click', () => {
    const body = overlay.querySelector('.guide-preview-body') as HTMLElement;
    const arrow = overlay.querySelector('.guide-preview-arrow') as HTMLElement;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    arrow.textContent = collapsed ? '▼' : '▶';
  });

  // Step prev/next navigation
  overlay.querySelector('[data-step="prev"]')!.addEventListener('click', () => {
    if (mode === 'color' && activeColorIdx > 0) { activeColorIdx--; renderAll(); }
    else if (mode === 'row' && activeRowIdx > 0) { activeRowIdx--; renderAll(); }
  });
  overlay.querySelector('[data-step="next"]')!.addEventListener('click', () => {
    const viewGrid = getActiveGrid();
    const maxColor = generateColorGuide(viewGrid, system).length - 1;
    const maxRow = generateRowGuide(viewGrid, system).length - 1;
    if (mode === 'color' && activeColorIdx < maxColor) { activeColorIdx++; renderAll(); }
    else if (mode === 'row' && activeRowIdx < maxRow) { activeRowIdx++; renderAll(); }
  });

  function updateStepButtons(total: number, current: number): void {
    const prev = overlay.querySelector('[data-step="prev"]') as HTMLButtonElement;
    const next = overlay.querySelector('[data-step="next"]') as HTMLButtonElement;
    prev.disabled = current <= 0;
    next.disabled = current >= total - 1;
  }

  function renderAll(): void {
    renderBoardNav();
    if (mode === 'color') renderColorMode();
    else renderRowMode();
  }

  function renderColorMode(): void {
    const viewGrid = getActiveGrid();
    const guides = generateColorGuide(viewGrid, system);
    if (guides.length === 0) { textArea.innerHTML = '<p>此板块无内容</p>'; navList.innerHTML = ''; const ctx = guideCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height); return; }
    if (activeColorIdx >= guides.length) activeColorIdx = 0;

    const g = guides[activeColorIdx];
    drawGuidePreview(guideCanvas, viewGrid, system, g.hex, null);

    // Nav list
    navList.innerHTML = '';
    guides.forEach((cg, i) => {
      const item = document.createElement('div');
      item.className = 'guide-color-item' + (i === activeColorIdx ? ' active' : '');
      item.innerHTML = `<span class="color-swatch" style="background:${cg.hex}"></span><span>${cg.displayKey}</span><span class="guide-color-count">${cg.total}粒</span>`;
      item.addEventListener('click', () => { activeColorIdx = i; renderAll(); });
      navList.appendChild(item);
    });

    // Text content
    const rowMap = new Map<number, ColorRun[]>();
    for (const run of g.runs) {
      let arr = rowMap.get(run.row);
      if (!arr) { arr = []; rowMap.set(run.row, arr); }
      arr.push(run);
    }

    let html = `<div class="guide-title"><span class="color-swatch" style="background:${g.hex}"></span><strong>${g.displayKey}</strong><span>${g.total} 粒</span></div>`;
    html += '<div class="guide-instructions">';
    for (const [row, runs] of rowMap) {
      const parts = runs.map(r => {
        const range = r.colStart === r.colEnd ? `C${r.colStart + 1}` : `C${r.colStart + 1}-C${r.colEnd + 1}`;
        return `<span class="guide-range">${range}</span><span class="guide-count">(${formatRunCount(r)})</span>`;
      }).join(' ');
      html += `<div class="guide-row"><span class="guide-row-label">第 ${row + 1} 行</span>${parts}</div>`;
    }
    html += '</div>';
    textArea.innerHTML = html;
    updateStepButtons(guides.length, activeColorIdx);
  }

  function renderRowMode(): void {
    const viewGrid = getActiveGrid();
    const rowGuides = generateRowGuide(viewGrid, system);
    if (rowGuides.length === 0) { textArea.innerHTML = '<p>此板块无内容</p>'; navList.innerHTML = ''; const ctx = guideCanvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, guideCanvas.width, guideCanvas.height); return; }
    if (activeRowIdx >= rowGuides.length) activeRowIdx = 0;

    const rg = rowGuides[activeRowIdx];
    drawGuidePreview(guideCanvas, viewGrid, system, null, rg.row);

    // Nav list — show rows
    navList.innerHTML = '';
    rowGuides.forEach((r, i) => {
      const beads = r.segments.reduce((s, seg) => s + seg.count, 0);
      const item = document.createElement('div');
      item.className = 'guide-color-item' + (i === activeRowIdx ? ' active' : '');
      item.innerHTML = `<span class="guide-row-num">R${r.row + 1}</span><span>${r.segments.length} 段</span><span class="guide-color-count">${beads}粒</span>`;
      item.addEventListener('click', () => { activeRowIdx = i; renderAll(); });
      navList.appendChild(item);
    });

    // Text content
    let html = `<div class="guide-title"><strong>第 ${rg.row + 1} 行</strong><span>${rg.segments.reduce((s, seg) => s + seg.count, 0)} 粒</span></div>`;
    html += '<div class="guide-instructions">';
    for (const seg of rg.segments) {
      const range = seg.colStart === seg.colEnd ? `C${seg.colStart + 1}` : `C${seg.colStart + 1}-C${seg.colEnd + 1}`;
      html += `<div class="guide-row">
        <span class="color-swatch" style="background:${seg.hex}"></span>
        <span class="guide-row-label">${seg.displayKey}</span>
        <span class="guide-range">${range}</span>
        <span class="guide-count">(${seg.count})</span>
      </div>`;
    }
    html += '</div>';
    textArea.innerHTML = html;
    updateStepButtons(rowGuides.length, activeRowIdx);
  }

  function generateFullText(): string {
    const viewGrid = getActiveGrid();
    const lines: string[] = [];
    const boardLabel = boards ? ` — 板块 ${boards[activeBoardIdx].label}` : '';
    lines.push(`拼豆引导指令 — ${system}${boardLabel}`);
    lines.push('');

    if (mode === 'color') {
      const guides = generateColorGuide(viewGrid, system);
      for (const g of guides) {
        lines.push(`═══ ${g.displayKey} (${g.hex}) — ${g.total} 粒 ═══`);
        const rowMap = new Map<number, ColorRun[]>();
        for (const run of g.runs) {
          let arr = rowMap.get(run.row);
          if (!arr) { arr = []; rowMap.set(run.row, arr); }
          arr.push(run);
        }
        for (const [row, runs] of rowMap) {
          const parts = runs.map(r => {
            const range = r.colStart === r.colEnd ? `C${r.colStart + 1}` : `C${r.colStart + 1}-C${r.colEnd + 1}`;
            return `${range} (${formatRunCount(r)}粒)`;
          }).join(', ');
          lines.push(`  第${row + 1}行: ${parts}`);
        }
        lines.push('');
      }
    } else {
      const rowGuides = generateRowGuide(viewGrid, system);
      for (const rg of rowGuides) {
        const total = rg.segments.reduce((s, seg) => s + seg.count, 0);
        lines.push(`── 第 ${rg.row + 1} 行 (${total}粒) ──`);
        for (const seg of rg.segments) {
          const range = seg.colStart === seg.colEnd ? `C${seg.colStart + 1}` : `C${seg.colStart + 1}-C${seg.colEnd + 1}`;
          lines.push(`  ${seg.displayKey} ${range} (${seg.count}粒)`);
        }
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  renderAll();

  overlay.querySelector('[data-guide="exit"]')!.addEventListener('click', () => overlay.remove());

  overlay.querySelector('[data-guide="copy"]')!.addEventListener('click', () => {
    navigator.clipboard.writeText(generateFullText()).then(() => {
      const btn = overlay.querySelector('[data-guide="copy"]') as HTMLButtonElement;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制全部'; }, 1500);
    });
  });

  overlay.querySelector('[data-guide="export"]')!.addEventListener('click', () => {
    const blob = new Blob([generateFullText()], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pixel-bean-guide.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
