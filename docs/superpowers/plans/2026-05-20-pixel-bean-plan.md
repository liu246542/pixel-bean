# Pixel Bean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modular perler bead pattern generator with a static frontend and optional local AI service.

**Architecture:** Vite + vanilla TypeScript frontend produces static files for GitHub Pages. Separate Node.js HTTP server wraps Codex CLI for optional AI image optimization. Frontend connects to AI service via user-configured URL + token. All core image processing runs client-side on Canvas API.

**Tech Stack:** Vite, TypeScript, Canvas API, Node.js (ai-server), Codex CLI

---

## File Structure

### Frontend (`frontend/`)

| File | Responsibility |
|------|----------------|
| `index.html` | Single page HTML shell with all DOM structure |
| `src/main.ts` | Entry point: binds events, orchestrates pipeline |
| `src/types.ts` | Shared type definitions (RgbColor, PaletteColor, MappedPixel, etc.) |
| `src/pixelation.ts` | Grid calculation, cell representative color, palette matching |
| `src/color-merge.ts` | BFS-based similar color merging by frequency |
| `src/background.ts` | Border flood-fill background detection and marking |
| `src/palette.ts` | Load color-data.json, build palette subsets, color system switching, exclude/remap |
| `src/export.ts` | Render key-labeled grid PNG, render stats PNG, trigger downloads |
| `src/preview.ts` | Draw preview canvas, hover tooltip with color key |
| `src/ai-client.ts` | Connect to AI service, health check, send image+prompt, receive result |
| `src/style.css` | All styles, CSS variables for theming, responsive layout |
| `src/color-data.json` | 291-color × 5-system mapping data (from reference project) |

### AI Server (`ai-server/`)

| File | Responsibility |
|------|----------------|
| `server.ts` | HTTP server: token auth, receive image, call codex exec, return result |
| `package.json` | Dependencies: tsx for running TS directly |

### Root

| File | Responsibility |
|------|----------------|
| `README.md` | Usage instructions, attribution |
| `LICENSE` | MIT license |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/style.css`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Create frontend/package.json**

```json
{
  "name": "pixel-bean-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create frontend/vite.config.ts**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
});
```

- [ ] **Step 4: Create frontend/src/types.ts**

```ts
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
}

export type ColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

export type PixelationMode = 'dominant' | 'average';

export const TRANSPARENT_KEY = 'ERASE';

export const TRANSPARENT_PIXEL: MappedPixel = {
  key: TRANSPARENT_KEY,
  color: '#FFFFFF',
  isExternal: true,
};
```

- [ ] **Step 5: Create minimal frontend/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pixel Bean - 拼豆图案生成器</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <div id="app">
    <p>Loading...</p>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create frontend/src/main.ts placeholder**

```ts
document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<h1>Pixel Bean</h1>';
```

- [ ] **Step 7: Create frontend/src/style.css with CSS variables**

```css
:root {
  --bg: #f8f9fa;
  --surface: #ffffff;
  --border: #dee2e6;
  --text: #212529;
  --text-secondary: #6c757d;
  --primary: #4a90d9;
  --primary-hover: #357abd;
  --danger: #dc3545;
  --success: #28a745;
  --radius: 8px;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}
```

- [ ] **Step 8: Create LICENSE (MIT) and README.md**

README.md:
```markdown
# Pixel Bean - 拼豆图案生成器

上传图片，自动生成拼豆图纸和采购清单。

## 使用

```bash
cd frontend && npm install && npm run dev
```

## 致谢

本项目的像素化算法和颜色映射数据参考了 [Zippland/perler-beads](https://github.com/Zippland/perler-beads) 项目，该项目基于 Apache License 2.0 授权。
```

- [ ] **Step 9: Install dependencies and verify dev server starts**

Run: `cd frontend && npm install && npm run dev`
Expected: Vite dev server starts, page shows "Pixel Bean" at localhost:5173

- [ ] **Step 10: Commit**

```bash
git add frontend/ LICENSE README.md
git commit -m "feat: scaffold frontend with Vite + vanilla TS"
```

---

## Task 2: Color Data and Palette Module

**Files:**
- Create: `frontend/src/color-data.json` (copy from reference project)
- Create: `frontend/src/palette.ts`

- [ ] **Step 1: Copy color-data.json from reference project**

Copy `/home/pi/git_repos/pixel-bean/perler-beads-ai/src/app/colorSystemMapping.json` to `frontend/src/color-data.json`.

- [ ] **Step 2: Create frontend/src/palette.ts**

```ts
import colorData from './color-data.json';
import { PaletteColor, RgbColor, ColorSystem } from './types';

type ColorMapping = Record<string, Record<ColorSystem, string>>;
const colorMap = colorData as ColorMapping;

export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export function colorDistance(a: RgbColor, b: RgbColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function findClosestColor(target: RgbColor, palette: PaletteColor[]): PaletteColor {
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const d = colorDistance(target, c.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = c;
      if (d === 0) break;
    }
  }
  return best;
}

export function buildFullPalette(): PaletteColor[] {
  const palette: PaletteColor[] = [];
  for (const [hex, systems] of Object.entries(colorMap)) {
    const rgb = hexToRgb(hex);
    if (rgb && systems.MARD) {
      palette.push({ key: hex, hex, rgb });
    }
  }
  return palette;
}

export function getDisplayKey(hex: string, system: ColorSystem): string {
  const mapping = colorMap[hex.toUpperCase()];
  return mapping?.[system] ?? '?';
}

export function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF';
}

export function convertPaletteToSystem(palette: PaletteColor[], system: ColorSystem): PaletteColor[] {
  return palette.map(c => {
    const mapping = colorMap[c.hex];
    if (mapping?.[system]) {
      return { ...c, key: mapping[system] };
    }
    return c;
  });
}

export function remapExcludedColors(
  grid: import('./types').MappedPixel[][],
  excludedHexes: Set<string>,
  availablePalette: PaletteColor[]
): void {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal) continue;
      if (excludedHexes.has(cell.color)) {
        const rgb = hexToRgb(cell.color);
        if (rgb) {
          const closest = findClosestColor(rgb, availablePalette);
          cell.key = closest.key;
          cell.color = closest.hex;
        }
      }
    }
  }
}

export const COLOR_SYSTEM_OPTIONS: { key: ColorSystem; name: string }[] = [
  { key: 'MARD', name: 'MARD' },
  { key: 'COCO', name: 'COCO' },
  { key: '漫漫', name: '漫漫' },
  { key: '盼盼', name: '盼盼' },
  { key: '咪小窝', name: '咪小窝' },
];
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/color-data.json frontend/src/palette.ts
git commit -m "feat: add color data and palette module with 291 colors × 5 systems"
```

---

## Task 3: Pixelation Algorithm

**Files:**
- Create: `frontend/src/pixelation.ts`

- [ ] **Step 1: Create frontend/src/pixelation.ts**

```ts
import { RgbColor, PaletteColor, MappedPixel, PixelationMode, TRANSPARENT_PIXEL } from './types';
import { findClosestColor } from './palette';

function getCellColor(
  data: Uint8ClampedArray,
  imgWidth: number,
  startX: number,
  startY: number,
  cellW: number,
  cellH: number,
  mode: PixelationMode
): RgbColor | null {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const freq: Record<string, number> = {};
  let dominantRgb: RgbColor | null = null;
  let maxFreq = 0;

  for (let y = startY; y < startY + cellH; y++) {
    for (let x = startX; x < startX + cellW; x++) {
      const i = (y * imgWidth + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      count++;
      if (mode === 'average') {
        rSum += r; gSum += g; bSum += b;
      } else {
        const k = `${r},${g},${b}`;
        freq[k] = (freq[k] || 0) + 1;
        if (freq[k] > maxFreq) {
          maxFreq = freq[k];
          dominantRgb = { r, g, b };
        }
      }
    }
  }

  if (count === 0) return null;
  if (mode === 'average') {
    return { r: Math.round(rSum / count), g: Math.round(gSum / count), b: Math.round(bSum / count) };
  }
  return dominantRgb;
}

export function pixelate(
  imageData: ImageData,
  cols: number,
  rows: number,
  palette: PaletteColor[],
  mode: PixelationMode,
  fallback: PaletteColor
): MappedPixel[][] {
  const { width, height, data } = imageData;
  const cellW = width / cols;
  const cellH = height / rows;
  const grid: MappedPixel[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: MappedPixel[] = [];
    for (let c = 0; c < cols; c++) {
      const sx = Math.floor(c * cellW);
      const sy = Math.floor(r * cellH);
      const ex = Math.min(width, Math.ceil((c + 1) * cellW));
      const ey = Math.min(height, Math.ceil((r + 1) * cellH));
      const cw = Math.max(1, ex - sx);
      const ch = Math.max(1, ey - sy);

      const rgb = getCellColor(data, width, sx, sy, cw, ch, mode);
      if (rgb) {
        const match = findClosestColor(rgb, palette);
        row.push({ key: match.key, color: match.hex });
      } else {
        row.push({ ...TRANSPARENT_PIXEL });
      }
    }
    grid.push(row);
  }
  return grid;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pixelation.ts
git commit -m "feat: add pixelation algorithm with dominant/average modes"
```

---

## Task 4: Color Merge Algorithm

**Files:**
- Create: `frontend/src/color-merge.ts`

- [ ] **Step 1: Create frontend/src/color-merge.ts**

```ts
import { MappedPixel, TRANSPARENT_KEY } from './types';
import { hexToRgb, colorDistance } from './palette';

export function mergeColors(grid: MappedPixel[][], threshold: number): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;

  const counts: Record<string, number> = {};
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal || cell.key === TRANSPARENT_KEY) continue;
      counts[cell.color] = (counts[cell.color] || 0) + 1;
    }
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);

  const replaced = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const hi = sorted[i];
    if (replaced.has(hi)) continue;
    const hiRgb = hexToRgb(hi);
    if (!hiRgb) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const lo = sorted[j];
      if (replaced.has(lo)) continue;
      const loRgb = hexToRgb(lo);
      if (!loRgb) continue;

      if (colorDistance(hiRgb, loRgb) < threshold) {
        replaced.add(lo);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (grid[r][c].color === lo) {
              grid[r][c].key = hi;
              grid[r][c].color = hi;
            }
          }
        }
      }
    }
  }
}
```

Note: `mergeColors` mutates the grid in-place. The key is set to the hex value here; the display key (MARD/COCO/etc.) is resolved at render time via `getDisplayKey()`.

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/color-merge.ts
git commit -m "feat: add frequency-based color merge algorithm"
```

---

## Task 5: Background Removal

**Files:**
- Create: `frontend/src/background.ts`

- [ ] **Step 1: Create frontend/src/background.ts**

```ts
import { MappedPixel } from './types';

const BACKGROUND_COLORS = new Set([
  '#FFFFFF', '#FEFEFE', '#FDFDFD', '#FCFCFC', '#FBFBFB', '#FAFAFA',
  '#F9F9F9', '#F8F8F8', '#F5F5F5', '#F0F0F0', '#EEEEEE',
]);

export function markBackground(grid: MappedPixel[][]): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack: [number, number][] = [];

  for (let r = 0; r < rows; r++) {
    stack.push([r, 0], [r, cols - 1]);
  }
  for (let c = 0; c < cols; c++) {
    stack.push([0, c], [rows - 1, c]);
  }

  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    if (r < 0 || r >= rows || c < 0 || c >= cols || visited[r][c]) continue;
    visited[r][c] = true;

    const cell = grid[r][c];
    if (!cell || !BACKGROUND_COLORS.has(cell.color.toUpperCase())) continue;

    cell.isExternal = true;
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/background.ts
git commit -m "feat: add flood-fill background removal from border cells"
```

---

## Task 6: Preview Canvas Rendering

**Files:**
- Create: `frontend/src/preview.ts`

- [ ] **Step 1: Create frontend/src/preview.ts**

```ts
import { MappedPixel, ColorSystem } from './types';
import { getDisplayKey, getContrastColor } from './palette';

export function drawPreview(
  canvas: HTMLCanvasElement,
  grid: MappedPixel[][],
  system: ColorSystem
): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;

  const cellSize = Math.max(4, Math.min(40, Math.floor(800 / Math.max(cols, rows))));
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;

      ctx.fillStyle = cell.isExternal ? '#F0F0F0' : cell.color;
      ctx.fillRect(x, y, cellSize, cellSize);

      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);

      if (!cell.isExternal && cellSize >= 16) {
        const key = getDisplayKey(cell.color, system);
        ctx.fillStyle = getContrastColor(cell.color);
        const fontSize = Math.max(6, Math.floor(cellSize * 0.35));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(key, x + cellSize / 2, y + cellSize / 2, cellSize - 2);
      }
    }
  }
}

export function getCellAt(
  canvas: HTMLCanvasElement,
  grid: MappedPixel[][],
  clientX: number,
  clientY: number
): { row: number; col: number; cell: MappedPixel } | null {
  const rows = grid.length;
  if (rows === 0) return null;
  const cols = grid[0].length;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const cellSize = canvas.width / cols;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return { row, col, cell: grid[row][col] };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/preview.ts
git commit -m "feat: add preview canvas renderer with grid overlay and labels"
```

---

## Task 7: Export Module (Key Grid PNG + Stats PNG)

**Files:**
- Create: `frontend/src/export.ts`

- [ ] **Step 1: Create frontend/src/export.ts**

```ts
import { MappedPixel, ColorSystem, TRANSPARENT_KEY } from './types';
import { getDisplayKey, getContrastColor, hexToRgb } from './palette';

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function exportKeyGrid(
  grid: MappedPixel[][],
  system: ColorSystem,
  filename: string = 'pixel-bean-grid.png'
): void {
  const rows = grid.length;
  if (rows === 0) return;
  const cols = grid[0].length;
  const cellSize = 40;

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d')!;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = c * cellSize;
      const y = r * cellSize;

      if (cell.isExternal || cell.key === TRANSPARENT_KEY) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, cellSize, cellSize);
        continue;
      }

      ctx.fillStyle = cell.color;
      ctx.fillRect(x, y, cellSize, cellSize);

      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellSize, cellSize);

      const key = getDisplayKey(cell.color, system);
      ctx.fillStyle = getContrastColor(cell.color);
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(key, x + cellSize / 2, y + cellSize / 2, cellSize - 4);
    }
  }

  downloadCanvas(canvas, filename);
}

export function exportStats(
  grid: MappedPixel[][],
  system: ColorSystem,
  filename: string = 'pixel-bean-stats.png'
): void {
  const counts: Record<string, { color: string; count: number }> = {};
  let total = 0;

  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal || cell.key === TRANSPARENT_KEY) continue;
      const hex = cell.color.toUpperCase();
      if (!counts[hex]) counts[hex] = { color: hex, count: 0 };
      counts[hex].count++;
      total++;
    }
  }

  const entries = Object.values(counts).sort((a, b) => b.count - a.count);

  const rowH = 32;
  const headerH = 48;
  const footerH = 40;
  const width = 360;
  const height = headerH + entries.length * rowH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#333333';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('颜色统计', 16, 30);

  ctx.font = '14px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`共 ${total} 粒`, width - 16, 30);

  entries.forEach((entry, i) => {
    const y = headerH + i * rowH;
    const key = getDisplayKey(entry.color, system);

    ctx.fillStyle = entry.color;
    ctx.fillRect(16, y + 4, 24, 24);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(16, y + 4, 24, 24);

    ctx.fillStyle = '#333';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(key, 52, y + 20);
    ctx.fillText(entry.color, 120, y + 20);

    ctx.textAlign = 'right';
    ctx.fillText(`${entry.count}`, width - 16, y + 20);
  });

  const footerY = headerH + entries.length * rowH;
  ctx.strokeStyle = '#ccc';
  ctx.beginPath();
  ctx.moveTo(16, footerY);
  ctx.lineTo(width - 16, footerY);
  ctx.stroke();

  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`合计: ${entries.length} 种颜色, ${total} 粒`, 16, footerY + 24);

  downloadCanvas(canvas, filename);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/export.ts
git commit -m "feat: add PNG export for key grid and color stats"
```

---

## Task 8: AI Client Module

**Files:**
- Create: `frontend/src/ai-client.ts`

- [ ] **Step 1: Create frontend/src/ai-client.ts**

```ts
export interface AIServiceConfig {
  url: string;
  token: string;
}

export interface AIResult {
  success: boolean;
  image?: string;
  error?: string;
}

const STORAGE_KEY = 'pixel-bean-ai-config';

export function loadConfig(): AIServiceConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: AIServiceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function buildUrl(base: string, token: string, path: string): string {
  const u = new URL(path, base.endsWith('/') ? base : base + '/');
  u.searchParams.set('token', token);
  return u.toString();
}

export async function healthCheck(config: AIServiceConfig): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(config.url, config.token, 'health'), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function generateImage(
  config: AIServiceConfig,
  imageBase64: string,
  prompt: string,
  onProgress?: (pct: number) => void,
): Promise<AIResult> {
  onProgress?.(10);
  try {
    const res = await fetch(buildUrl(config.url, config.token, 'generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, prompt }),
      signal: AbortSignal.timeout(180_000),
    });
    onProgress?.(80);
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    onProgress?.(100);
    return data;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export const DEFAULT_PROMPT =
  '将这张图片转换为适合拼豆制作的风格：chibi art style, simple flat colors, no gradients, no shading, white background, bold clean outlines, minimal detail, 4-8 distinct solid colors, cartoon style';
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/ai-client.ts
git commit -m "feat: add AI client with health check, generate, and localStorage config"
```

---

## Task 9: HTML Structure and Complete UI

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/style.css`

- [ ] **Step 1: Write the full index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pixel Bean - 拼豆图案生成器</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <header class="header">
    <h1 class="header__title">Pixel Bean</h1>
    <div class="header__ai">
      <input id="aiUrl" type="text" placeholder="AI 服务地址 (含 token)" class="input" />
      <button id="aiTest" class="btn btn--sm">测试连接</button>
      <span id="aiStatus" class="ai-status"></span>
    </div>
  </header>

  <main class="layout">
    <section class="left-panel">
      <div class="upload-area" id="uploadArea">
        <input type="file" id="fileInput" accept="image/*" hidden />
        <p>拖放图片到此处，或点击选择</p>
      </div>
      <div id="aiActions" class="ai-actions hidden">
        <button id="aiOptimize" class="btn btn--primary">AI 优化</button>
        <textarea id="aiPrompt" class="input ai-prompt" rows="2"></textarea>
      </div>
      <canvas id="originalCanvas" hidden></canvas>
      <div class="preview-wrap">
        <canvas id="previewCanvas"></canvas>
        <div id="tooltip" class="tooltip hidden"></div>
      </div>
    </section>

    <section class="right-panel">
      <div class="panel">
        <h3>设置</h3>
        <label>
          粒度 (横向格数)
          <input id="granularity" type="range" min="10" max="200" value="50" />
          <span id="granularityVal">50</span>
        </label>
        <label>
          合并阈值
          <input id="mergeThreshold" type="range" min="0" max="100" value="30" />
          <span id="mergeVal">30</span>
        </label>
        <label>
          像素化模式
          <select id="pixelMode">
            <option value="dominant">主色 (卡通)</option>
            <option value="average">均色 (真实)</option>
          </select>
        </label>
        <label>
          色号系统
          <select id="colorSystem"></select>
        </label>
      </div>

      <div class="panel" id="statsPanel">
        <h3>颜色统计 <span id="totalCount"></span></h3>
        <div id="colorList" class="color-list"></div>
      </div>

      <div class="panel export-panel">
        <button id="exportGrid" class="btn btn--primary" disabled>导出图纸</button>
        <button id="exportStats" class="btn" disabled>导出统计</button>
      </div>
    </section>
  </main>

  <footer class="footer">
    Based on <a href="https://github.com/Zippland/perler-beads" target="_blank">Zippland/perler-beads</a> (Apache 2.0)
  </footer>

  <div id="loadingOverlay" class="loading-overlay hidden">
    <div class="loading-spinner"></div>
    <p id="loadingText">处理中...</p>
  </div>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Write the full style.css**

Full CSS covering: layout (two-column, responsive), header, upload area, panels, buttons, color list, tooltip, loading overlay, and responsive breakpoint at 768px. Use the CSS variables from Task 1. Approximately 300 lines — write the complete file with all selectors shown in the HTML.

- [ ] **Step 3: Verify page renders**

Run: `cd frontend && npm run dev`
Open in browser: verify layout matches spec (header, two columns, footer)

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/src/style.css
git commit -m "feat: add full HTML structure and CSS layout"
```

---

## Task 10: Main Module — Wire Everything Together

**Files:**
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Write the complete main.ts**

This is the orchestration module. It:

1. **Initializes**: Populates color system dropdown, loads AI config from localStorage, sets up event listeners
2. **Image upload**: Handles file input + drag-drop, loads image into hidden canvas, triggers pipeline
3. **Pipeline** (`processImage`): reads ImageData from canvas → `pixelate()` → `mergeColors()` → `markBackground()` → stores grid → `drawPreview()` → updates color stats list
4. **Parameter changes**: granularity/threshold/mode/system changes re-trigger pipeline
5. **Color stats list**: renders each color as a clickable row; click toggles exclusion → `remapExcludedColors()` → re-render
6. **Preview tooltip**: mousemove on canvas → `getCellAt()` → show/hide tooltip with key + hex
7. **Export buttons**: call `exportKeyGrid()` / `exportStats()`
8. **AI integration**: test connection button → `healthCheck()` → show/hide AI actions; optimize button → `generateImage()` → replace image source → re-trigger pipeline

```ts
import { MappedPixel, PixelationMode, ColorSystem } from './types';
import { buildFullPalette, convertPaletteToSystem, getDisplayKey, remapExcludedColors, COLOR_SYSTEM_OPTIONS, hexToRgb } from './palette';
import { pixelate } from './pixelation';
import { mergeColors } from './color-merge';
import { markBackground } from './background';
import { drawPreview, getCellAt } from './preview';
import { exportKeyGrid, exportStats } from './export';
import { loadConfig, saveConfig, healthCheck, generateImage, DEFAULT_PROMPT } from './ai-client';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let grid: MappedPixel[][] = [];
let currentSystem: ColorSystem = 'MARD';
let currentMode: PixelationMode = 'dominant';
let excludedHexes = new Set<string>();
let imageSrc: string | null = null;
let aiConnected = false;

const fullPalette = buildFullPalette();

function getActivePalette() {
  const base = convertPaletteToSystem(fullPalette, currentSystem);
  if (excludedHexes.size === 0) return base;
  return base.filter(c => !excludedHexes.has(c.hex));
}

function processImage() {
  if (!imageSrc) return;
  const img = new Image();
  img.onload = () => {
    const canvas = $<HTMLCanvasElement>('#originalCanvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    const cols = parseInt(($<HTMLInputElement>('#granularity')).value);
    const rows = Math.round(cols * (img.height / img.width));
    const threshold = parseInt(($<HTMLInputElement>('#mergeThreshold')).value);
    const palette = getActivePalette();

    if (palette.length === 0) {
      alert('所有颜色都被排除了，请恢复部分颜色');
      return;
    }

    const fallback = palette[0];
    grid = pixelate(imageData, cols, rows, palette, currentMode, fallback);
    mergeColors(grid, threshold);
    markBackground(grid);

    drawPreview($<HTMLCanvasElement>('#previewCanvas'), grid, currentSystem);
    updateColorStats();
    ($<HTMLButtonElement>('#exportGrid')).disabled = false;
    ($<HTMLButtonElement>('#exportStats')).disabled = false;
  };
  img.src = imageSrc;
}

function updateColorStats() {
  const counts: Record<string, { color: string; count: number }> = {};
  let total = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal) continue;
      const hex = cell.color.toUpperCase();
      if (!counts[hex]) counts[hex] = { color: hex, count: 0 };
      counts[hex].count++;
      total++;
    }
  }

  $('#totalCount').textContent = `(${total} 粒)`;
  const list = $('#colorList');
  list.innerHTML = '';

  const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  for (const [hex, { color, count }] of sorted) {
    const key = getDisplayKey(hex, currentSystem);
    const row = document.createElement('div');
    row.className = 'color-item' + (excludedHexes.has(hex) ? ' excluded' : '');
    row.innerHTML = `
      <span class="color-swatch" style="background:${color}"></span>
      <span class="color-key">${key}</span>
      <span class="color-count">${count}</span>
    `;
    row.addEventListener('click', () => toggleExclude(hex));
    list.appendChild(row);
  }
}

function toggleExclude(hex: string) {
  if (excludedHexes.has(hex)) {
    excludedHexes.delete(hex);
    processImage();
  } else {
    const remaining = getActivePalette().filter(c => c.hex !== hex);
    if (remaining.length === 0) {
      alert('至少保留一种颜色');
      return;
    }
    excludedHexes.add(hex);
    remapExcludedColors(grid, excludedHexes, remaining);
    markBackground(grid);
    drawPreview($<HTMLCanvasElement>('#previewCanvas'), grid, currentSystem);
    updateColorStats();
  }
}

function initUpload() {
  const area = $('#uploadArea');
  const input = $<HTMLInputElement>('#fileInput');

  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) loadFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files?.[0]) loadFile(input.files[0]);
  });
}

function loadFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    imageSrc = reader.result as string;
    processImage();
  };
  reader.readAsDataURL(file);
}

function initControls() {
  const granularity = $<HTMLInputElement>('#granularity');
  const mergeThreshold = $<HTMLInputElement>('#mergeThreshold');
  const pixelMode = $<HTMLSelectElement>('#pixelMode');
  const colorSystem = $<HTMLSelectElement>('#colorSystem');

  granularity.addEventListener('input', () => {
    $('#granularityVal').textContent = granularity.value;
  });
  granularity.addEventListener('change', () => processImage());

  mergeThreshold.addEventListener('input', () => {
    $('#mergeVal').textContent = mergeThreshold.value;
  });
  mergeThreshold.addEventListener('change', () => processImage());

  pixelMode.addEventListener('change', () => {
    currentMode = pixelMode.value as PixelationMode;
    processImage();
  });

  COLOR_SYSTEM_OPTIONS.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.key;
    el.textContent = opt.name;
    colorSystem.appendChild(el);
  });
  colorSystem.addEventListener('change', () => {
    currentSystem = colorSystem.value as ColorSystem;
    if (grid.length > 0) {
      drawPreview($<HTMLCanvasElement>('#previewCanvas'), grid, currentSystem);
      updateColorStats();
    }
  });
}

function initTooltip() {
  const canvas = $<HTMLCanvasElement>('#previewCanvas');
  const tooltip = $('#tooltip');
  canvas.addEventListener('mousemove', e => {
    const hit = getCellAt(canvas, grid, e.clientX, e.clientY);
    if (hit && !hit.cell.isExternal) {
      const key = getDisplayKey(hit.cell.color, currentSystem);
      tooltip.textContent = `${key} (${hit.cell.color})`;
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY + 12}px`;
      tooltip.classList.remove('hidden');
    } else {
      tooltip.classList.add('hidden');
    }
  });
  canvas.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
}

function initExport() {
  $('#exportGrid').addEventListener('click', () => exportKeyGrid(grid, currentSystem));
  $('#exportStats').addEventListener('click', () => exportStats(grid, currentSystem));
}

function initAI() {
  const urlInput = $<HTMLInputElement>('#aiUrl');
  const testBtn = $<HTMLButtonElement>('#aiTest');
  const status = $('#aiStatus');
  const actions = $('#aiActions');
  const optimizeBtn = $<HTMLButtonElement>('#aiOptimize');
  const promptInput = $<HTMLTextAreaElement>('#aiPrompt');

  promptInput.value = DEFAULT_PROMPT;

  const saved = loadConfig();
  if (saved) {
    urlInput.value = `${saved.url}${saved.url.includes('?') ? '&' : '?'}token=${saved.token}`;
  }

  testBtn.addEventListener('click', async () => {
    const raw = urlInput.value.trim();
    if (!raw) return;
    let url: URL;
    try { url = new URL(raw); } catch { status.textContent = '无效地址'; return; }
    const token = url.searchParams.get('token') || '';
    url.searchParams.delete('token');
    const config = { url: url.origin + url.pathname, token };

    status.textContent = '连接中...';
    const ok = await healthCheck(config);
    if (ok) {
      saveConfig(config);
      aiConnected = true;
      status.textContent = '已连接';
      status.className = 'ai-status connected';
      actions.classList.remove('hidden');
    } else {
      aiConnected = false;
      status.textContent = '连接失败';
      status.className = 'ai-status';
      actions.classList.add('hidden');
    }
  });

  optimizeBtn.addEventListener('click', async () => {
    if (!imageSrc || !aiConnected) return;
    const config = loadConfig();
    if (!config) return;

    const overlay = $('#loadingOverlay');
    const loadingText = $('#loadingText');
    overlay.classList.remove('hidden');

    const result = await generateImage(config, imageSrc, promptInput.value, pct => {
      loadingText.textContent = `AI 处理中... ${pct}%`;
    });

    overlay.classList.add('hidden');

    if (result.success && result.image) {
      imageSrc = result.image;
      processImage();
    } else {
      alert(`AI 优化失败: ${result.error}`);
    }
  });
}

function init() {
  initUpload();
  initControls();
  initTooltip();
  initExport();
  initAI();
}

init();
```

- [ ] **Step 2: Verify dev server works end-to-end**

Run: `cd frontend && npm run dev`
Open in browser. Upload an image → verify pixelated preview shows → adjust sliders → export buttons work.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.ts
git commit -m "feat: wire up complete UI with all pipeline stages and AI integration"
```

---

## Task 11: AI Server

**Files:**
- Create: `ai-server/package.json`
- Create: `ai-server/server.ts`

- [ ] **Step 1: Create ai-server/package.json**

```json
{
  "name": "pixel-bean-ai-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "npx tsx server.ts"
  },
  "dependencies": {
    "tsx": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create ai-server/server.ts**

```ts
import { createServer } from 'node:http';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = parseInt(process.env.PORT || '3456');
const TOKEN = process.env.TOKEN || 'changeme';
const TMP_DIR = join(process.cwd(), '.tmp');

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

function cors(headers: Record<string, string>) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const str = JSON.stringify(body);
  res.writeHead(status, cors({ 'Content-Type': 'application/json' }));
  res.end(str);
}

function checkToken(url: URL): boolean {
  return url.searchParams.get('token') === TOKEN;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors({}));
    res.end();
    return;
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    if (!checkToken(url)) return json(res, 401, { error: 'Invalid token' });
    return json(res, 200, { status: 'ok' });
  }

  if (url.pathname === '/generate' && req.method === 'POST') {
    if (!checkToken(url)) return json(res, 401, { error: 'Invalid token' });

    let body = '';
    for await (const chunk of req) body += chunk;

    let parsed: { image: string; prompt: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      return json(res, 400, { success: false, error: 'Invalid JSON' });
    }

    const { image, prompt } = parsed;
    if (!image || !prompt) return json(res, 400, { success: false, error: 'Missing image or prompt' });

    const id = randomUUID();
    const inputPath = join(TMP_DIR, `${id}-input.png`);
    const outputPath = join(TMP_DIR, `${id}-output.png`);

    try {
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      writeFileSync(inputPath, Buffer.from(base64Data, 'base64'));

      const codexPrompt = `${prompt}。输入图片在 ${inputPath}，请基于这张图片生成新图，保存到 ${outputPath}`;
      execSync(
        `codex exec "${codexPrompt.replace(/"/g, '\\"')}" --sandbox workspace-write`,
        { timeout: 120_000, cwd: process.cwd(), stdio: 'pipe' }
      );

      if (!existsSync(outputPath)) {
        return json(res, 500, { success: false, error: 'Codex did not produce output image' });
      }

      const outputBuffer = readFileSync(outputPath);
      const outputBase64 = `data:image/png;base64,${outputBuffer.toString('base64')}`;
      return json(res, 200, { success: true, image: outputBase64 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return json(res, 500, { success: false, error: msg });
    } finally {
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
    }
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`AI server running on http://localhost:${PORT}`);
  console.log(`Token: ${TOKEN}`);
  console.log(`Test: curl http://localhost:${PORT}/health?token=${TOKEN}`);
});
```

- [ ] **Step 3: Install deps and test health endpoint**

Run:
```bash
cd ai-server && npm install
TOKEN=test123 npx tsx server.ts &
sleep 2
curl http://localhost:3456/health?token=test123
kill %1
```
Expected: `{"status":"ok"}`

- [ ] **Step 4: Commit**

```bash
git add ai-server/
git commit -m "feat: add local AI server with token auth and Codex CLI integration"
```

---

## Task 12: Build Verification and .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```gitignore
node_modules/
dist/
.tmp/
*.log
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: `dist/` directory created with index.html and JS/CSS assets

- [ ] **Step 3: Verify the built site works**

Run: `cd frontend && npm run preview`
Open in browser, upload an image, verify full pipeline works.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore and verify production build"
```

---

## Summary

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | Project scaffolding | package.json, vite.config, types, HTML skeleton |
| 2 | Color data + palette module | color-data.json, palette.ts |
| 3 | Pixelation algorithm | pixelation.ts |
| 4 | Color merge algorithm | color-merge.ts |
| 5 | Background removal | background.ts |
| 6 | Preview canvas rendering | preview.ts |
| 7 | Export (grid PNG + stats PNG) | export.ts |
| 8 | AI client module | ai-client.ts |
| 9 | Full HTML + CSS | index.html, style.css |
| 10 | Main orchestration (wire everything) | main.ts |
| 11 | AI server | ai-server/server.ts |
| 12 | Build verification | .gitignore, build test |
