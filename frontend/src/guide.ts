import type { MappedPixel, ColorSystem } from './types';
import { TRANSPARENT_KEY } from './types';
import { getDisplayKey } from './palette';

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

export function showGuideModal(grid: MappedPixel[][], system: ColorSystem): void {
  const guides = generateGuide(grid, system);
  if (guides.length === 0) return;

  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay';

  overlay.innerHTML = `
    <div class="guide-layout">
      <div class="guide-content"></div>
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

  const content = overlay.querySelector('.guide-content') as HTMLElement;
  const colorNav = overlay.querySelector('.guide-color-nav') as HTMLElement;
  let activeIdx = 0;

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

    content.innerHTML = html;
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
