import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor } from './palette';

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

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function generateGuide(grid: MappedPixel[][], system: ColorSystem): ColorGuide[] {
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

      // Merge consecutive same-color cells in this row
      while (c < cols) {
        const next = grid[r][c];
        if (next.isExternal || next.paletteId === TRANSPARENT_KEY) break;
        const nextHex = rgbToHex(next.color.r, next.color.g, next.color.b);
        if (nextHex !== hex) break;
        c++;
      }

      let entry = colorMap.get(hex);
      if (!entry) {
        entry = { hex, total: 0, runs: [] };
        colorMap.set(hex, entry);
      }
      entry.total += c - start;
      entry.runs.push({ row: r, colStart: start, colEnd: c - 1 });
    }
  }

  return Array.from(colorMap.values())
    .sort((a, b) => b.total - a.total)
    .map(e => ({
      hex: e.hex,
      displayKey: getDisplayKey(e.hex, system),
      total: e.total,
      runs: e.runs,
    }));
}

function formatRun(run: ColorRun): string {
  const row = `R${run.row + 1}`;
  if (run.colStart === run.colEnd) {
    return `${row} C${run.colStart + 1}`;
  }
  return `${row} C${run.colStart + 1}-C${run.colEnd + 1}`;
}

function formatRunCount(run: ColorRun): number {
  return run.colEnd - run.colStart + 1;
}

function drawGuidePreview(canvas: HTMLCanvasElement, grid: MappedPixel[][], system: ColorSystem, activeHex: string): void {
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
      const isActive = hex === activeHex;

      if (isBlank) {
        ctx.fillStyle = '#F5F5F5';
      } else if (isActive) {
        ctx.fillStyle = hex;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#E8E8E8';
        ctx.globalAlpha = 0.5;
      }

      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.globalAlpha = 1;

      if (isActive && cellSize >= 10) {
        const label = getDisplayKey(hex, system);
        ctx.fillStyle = getContrastColor(hex);
        ctx.font = `${Math.max(5, Math.floor(cellSize * 0.4))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + cellSize / 2, y + cellSize / 2);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }
}

export function showGuideModal(grid: MappedPixel[][], system: ColorSystem): void {
  const guides = generateGuide(grid, system);
  if (guides.length === 0) return;

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
        <div class="guide-color-nav"></div>
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
  const colorNav = overlay.querySelector('.guide-color-nav') as HTMLElement;
  let activeIdx = 0;

  // Toggle preview collapse
  overlay.querySelector('[data-guide="toggle-preview"]')!.addEventListener('click', () => {
    const body = overlay.querySelector('.guide-preview-body') as HTMLElement;
    const arrow = overlay.querySelector('.guide-preview-arrow') as HTMLElement;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    arrow.textContent = collapsed ? '▼' : '▶';
  });

  function renderColorNav(): void {
    colorNav.innerHTML = '';
    guides.forEach((g, i) => {
      const btn = document.createElement('div');
      btn.className = 'guide-color-item' + (i === activeIdx ? ' active' : '');
      btn.innerHTML = `
        <span class="color-swatch" style="background:${g.hex}"></span>
        <span>${g.displayKey}</span>
        <span class="guide-color-count">${g.total}粒</span>
      `;
      btn.addEventListener('click', () => {
        activeIdx = i;
        renderColorNav();
        renderContent();
      });
      colorNav.appendChild(btn);
    });
  }

  function renderContent(): void {
    const g = guides[activeIdx];
    drawGuidePreview(guideCanvas, grid, system, g.hex);

    let html = `<div class="guide-title">
      <span class="color-swatch" style="background:${g.hex}"></span>
      <strong>${g.displayKey}</strong>
      <span>${g.total} 粒</span>
    </div>`;

    // Group runs by row
    const rowMap = new Map<number, ColorRun[]>();
    for (const run of g.runs) {
      let arr = rowMap.get(run.row);
      if (!arr) { arr = []; rowMap.set(run.row, arr); }
      arr.push(run);
    }

    html += '<div class="guide-instructions">';
    for (const [row, runs] of rowMap) {
      const parts = runs.map(r => {
        const count = formatRunCount(r);
        const range = r.colStart === r.colEnd
          ? `C${r.colStart + 1}`
          : `C${r.colStart + 1}-C${r.colEnd + 1}`;
        return `<span class="guide-range">${range}</span><span class="guide-count">(${count})</span>`;
      }).join(' ');
      html += `<div class="guide-row"><span class="guide-row-label">第 ${row + 1} 行</span>${parts}</div>`;
    }
    html += '</div>';

    textArea.innerHTML = html;
  }

  function generateFullText(): string {
    const lines: string[] = [];
    lines.push(`拼豆引导指令 — ${system}`);
    lines.push('');
    for (const g of guides) {
      lines.push(`═══ ${g.displayKey} (${g.hex}) — ${g.total} 粒 ═══`);
      const rowMap = new Map<number, ColorRun[]>();
      for (const run of g.runs) {
        let arr = rowMap.get(run.row);
        if (!arr) { arr = []; rowMap.set(run.row, arr); }
        arr.push(run);
      }
      for (const [row, runs] of rowMap) {
        const parts = runs.map(r => formatRun(r) + ` (${formatRunCount(r)}粒)`).join(', ');
        lines.push(`  第${row + 1}行: ${parts}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  renderColorNav();
  renderContent();

  overlay.querySelector('[data-guide="exit"]')!.addEventListener('click', () => {
    overlay.remove();
  });

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

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
