import './style.css';

import type { MappedPixel, ColorSystem, PixelationMode, PaletteColor } from './types';
import { TRANSPARENT_KEY } from './types';
import {
  buildFullPalette,
  convertPaletteToSystem,
  getDisplayKey,
  remapExcludedColors,
  COLOR_SYSTEM_OPTIONS,
} from './palette';
import { pixelate } from './pixelation';
import { mergeColors } from './color-merge';
import { markBackground } from './background';
import { drawPreview, getCellAt } from './preview';
import { exportKeyGrid, exportStats } from './export';
import {
  loadConfig,
  saveConfig,
  healthCheck,
  generateImage,
  DEFAULT_PROMPT,
} from './ai-client';
import type { AIServiceConfig } from './ai-client';

// ── Helpers ─────────────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

// ── DOM references ──────────────────────────────────────────────────────────

const $aiUrl = document.getElementById('aiUrl') as HTMLInputElement;
const $aiTest = document.getElementById('aiTest') as HTMLButtonElement;
const $aiStatus = document.getElementById('aiStatus') as HTMLSpanElement;

const $uploadArea = document.getElementById('uploadArea') as HTMLDivElement;
const $fileInput = document.getElementById('fileInput') as HTMLInputElement;

const $aiActions = document.getElementById('aiActions') as HTMLDivElement;
const $aiOptimize = document.getElementById('aiOptimize') as HTMLButtonElement;
const $aiPrompt = document.getElementById('aiPrompt') as HTMLTextAreaElement;

const $originalCanvas = document.getElementById('originalCanvas') as HTMLCanvasElement;
const $previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;

const $tooltip = document.getElementById('tooltip') as HTMLDivElement;

const $granularity = document.getElementById('granularity') as HTMLInputElement;
const $granularityVal = document.getElementById('granularityVal') as HTMLSpanElement;
const $mergeThreshold = document.getElementById('mergeThreshold') as HTMLInputElement;
const $mergeVal = document.getElementById('mergeVal') as HTMLSpanElement;
const $pixelMode = document.getElementById('pixelMode') as HTMLSelectElement;
const $colorSystem = document.getElementById('colorSystem') as HTMLSelectElement;

const $totalCount = document.getElementById('totalCount') as HTMLSpanElement;
const $colorList = document.getElementById('colorList') as HTMLDivElement;

const $exportGrid = document.getElementById('exportGrid') as HTMLButtonElement;
const $exportStats = document.getElementById('exportStats') as HTMLButtonElement;

const $loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;
const $loadingText = document.getElementById('loadingText') as HTMLParagraphElement;

// ── Application state ───────────────────────────────────────────────────────

const fullPalette: PaletteColor[] = buildFullPalette();
let currentSystem: ColorSystem = 'MARD';
let imageSrc: string | null = null;
let grid: MappedPixel[][] = [];
const excludedHexes = new Set<string>();
let aiConfig: AIServiceConfig | null = null;

// ── Initialization ──────────────────────────────────────────────────────────

function init(): void {
  // Populate color system dropdown
  for (const opt of COLOR_SYSTEM_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = opt.name;
    $colorSystem.appendChild(option);
  }

  // Load saved AI config
  aiConfig = loadConfig();
  if (aiConfig) {
    $aiUrl.value = `${aiConfig.url}?token=${aiConfig.token}`;
  }

  // Set default AI prompt
  $aiPrompt.value = DEFAULT_PROMPT;

  // Bind events
  bindUploadEvents();
  bindSettingsEvents();
  bindPreviewEvents();
  bindExportEvents();
  bindAiEvents();
}

// ── Image upload ────────────────────────────────────────────────────────────

function bindUploadEvents(): void {
  $uploadArea.addEventListener('click', () => $fileInput.click());

  $uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    $uploadArea.classList.add('dragover');
  });

  $uploadArea.addEventListener('dragleave', () => {
    $uploadArea.classList.remove('dragover');
  });

  $uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    $uploadArea.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) loadImageFile(file);
  });

  $fileInput.addEventListener('change', () => {
    const file = $fileInput.files?.[0];
    if (file) loadImageFile(file);
  });
}

function loadImageFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    imageSrc = reader.result as string;
    processImage();
  };
  reader.readAsDataURL(file);
}

// ── Image processing pipeline ───────────────────────────────────────────────

function processImage(): void {
  if (!imageSrc) return;

  const img = new Image();
  img.onload = () => {
    // Draw on the hidden original canvas
    $originalCanvas.width = img.width;
    $originalCanvas.height = img.height;
    const ctx = $originalCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    // Calculate grid dimensions
    const cols = parseInt($granularity.value, 10);
    const rows = Math.max(1, Math.round(cols * (img.height / img.width)));

    // Build active palette: filter out excluded colors, convert to current system
    const activePalette = getActivePalette();
    const fallback = activePalette[0];

    // Pixelation pipeline
    const mode = $pixelMode.value as PixelationMode;
    const threshold = parseInt($mergeThreshold.value, 10);

    grid = pixelate(imageData, cols, rows, activePalette, mode, fallback);
    mergeColors(grid, threshold);
    markBackground(grid);
    drawPreview($previewCanvas, grid, currentSystem);
    updateColorStats();

    // Enable export buttons
    $exportGrid.disabled = false;
    $exportStats.disabled = false;

    // Show AI actions if connected
    if (aiConfig) $aiActions.classList.remove('hidden');
  };
  img.src = imageSrc;
}

function getActivePalette(): PaletteColor[] {
  let palette = fullPalette;

  // Filter excluded colors
  if (excludedHexes.size > 0) {
    palette = palette.filter((entry) => {
      const hex = entry.name.toUpperCase();
      return !excludedHexes.has(hex);
    });
  }

  // Convert to current system
  return convertPaletteToSystem(palette, currentSystem);
}

// ── Color statistics ────────────────────────────────────────────────────────

function updateColorStats(): void {
  // Count colors, skipping external pixels
  const counts = new Map<string, number>();

  for (const row of grid) {
    for (const pixel of row) {
      if (pixel.isExternal) continue;
      if (pixel.paletteId === TRANSPARENT_KEY) continue;

      const hex = rgbToHex(pixel.color.r, pixel.color.g, pixel.color.b);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }

  // Sort by count descending
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, entry) => sum + entry[1], 0);

  // Update total count
  $totalCount.textContent = total > 0 ? String(total) : '';

  // Render color list
  $colorList.innerHTML = '';

  // Also show excluded colors (with count 0) so user can click to restore them
  for (const exHex of excludedHexes) {
    if (!counts.has(exHex)) {
      sorted.push([exHex, 0]);
    }
  }

  for (const [hex, count] of sorted) {
    const item = document.createElement('div');
    item.className = 'color-item';
    if (excludedHexes.has(hex)) {
      item.classList.add('excluded');
    }

    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = hex;

    const key = document.createElement('span');
    key.className = 'color-key';
    key.textContent = getDisplayKey(hex, currentSystem);

    const countSpan = document.createElement('span');
    countSpan.className = 'color-count';
    countSpan.textContent = String(count);

    item.appendChild(swatch);
    item.appendChild(key);
    item.appendChild(countSpan);

    // Click to toggle exclusion
    item.addEventListener('click', () => toggleColorExclusion(hex));

    $colorList.appendChild(item);
  }
}

// ── Color exclusion ─────────────────────────────────────────────────────────

function toggleColorExclusion(hex: string): void {
  if (excludedHexes.has(hex)) {
    // Remove exclusion: requires full re-pixelation
    excludedHexes.delete(hex);
    processImage();
  } else {
    // Add exclusion: remap in-place
    excludedHexes.add(hex);
    const activePalette = getActivePalette();
    remapExcludedColors(grid, excludedHexes, activePalette);
    markBackground(grid);
    drawPreview($previewCanvas, grid, currentSystem);
    updateColorStats();
  }
}

// ── Settings events ─────────────────────────────────────────────────────────

function bindSettingsEvents(): void {
  // Granularity
  $granularity.addEventListener('input', () => {
    $granularityVal.textContent = $granularity.value;
  });
  $granularity.addEventListener('change', () => processImage());

  // Merge threshold
  $mergeThreshold.addEventListener('input', () => {
    $mergeVal.textContent = $mergeThreshold.value;
  });
  $mergeThreshold.addEventListener('change', () => processImage());

  // Pixel mode
  $pixelMode.addEventListener('change', () => processImage());

  // Color system
  $colorSystem.addEventListener('change', () => {
    currentSystem = $colorSystem.value as ColorSystem;
    // Only re-draw preview and update stats; no re-pixelation needed
    if (grid.length > 0) {
      drawPreview($previewCanvas, grid, currentSystem);
      updateColorStats();
    }
  });
}

// ── Preview tooltip ─────────────────────────────────────────────────────────

function bindPreviewEvents(): void {
  $previewCanvas.addEventListener('mousemove', (e) => {
    if (grid.length === 0) return;

    const hit = getCellAt($previewCanvas, grid, e.clientX, e.clientY);
    if (!hit) {
      $tooltip.classList.add('hidden');
      return;
    }

    const { cell } = hit;
    const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
    const displayKey = getDisplayKey(hex, currentSystem);
    $tooltip.textContent = `${displayKey} ${hex}`;

    // Position tooltip relative to the preview wrapper
    const wrapRect = $previewCanvas.parentElement!.getBoundingClientRect();
    $tooltip.style.left = `${e.clientX - wrapRect.left}px`;
    $tooltip.style.top = `${e.clientY - wrapRect.top}px`;
    $tooltip.classList.remove('hidden');
  });

  $previewCanvas.addEventListener('mouseleave', () => {
    $tooltip.classList.add('hidden');
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

function bindExportEvents(): void {
  $exportGrid.addEventListener('click', () => {
    if (grid.length > 0) exportKeyGrid(grid, currentSystem);
  });

  $exportStats.addEventListener('click', () => {
    if (grid.length > 0) exportStats(grid, currentSystem);
  });
}

// ── AI integration ──────────────────────────────────────────────────────────

function parseAiUrl(raw: string): AIServiceConfig | null {
  try {
    const url = new URL(raw);
    const token = url.searchParams.get('token') ?? '';
    // Remove token from URL to get the base
    url.searchParams.delete('token');
    return { url: url.origin + url.pathname.replace(/\/+$/, ''), token };
  } catch {
    return null;
  }
}

function bindAiEvents(): void {
  $aiTest.addEventListener('click', async () => {
    const config = parseAiUrl($aiUrl.value.trim());
    if (!config) {
      $aiStatus.textContent = 'Invalid URL';
      $aiStatus.className = 'ai-status error';
      return;
    }

    $aiStatus.textContent = 'Testing...';
    $aiStatus.className = 'ai-status';

    const ok = await healthCheck(config);
    if (ok) {
      $aiStatus.textContent = 'Connected';
      $aiStatus.className = 'ai-status connected';
      aiConfig = config;
      saveConfig(config);
      // Show AI actions when image is loaded
      if (imageSrc) {
        $aiActions.classList.remove('hidden');
      }
    } else {
      $aiStatus.textContent = 'Connection failed';
      $aiStatus.className = 'ai-status error';
      aiConfig = null;
      $aiActions.classList.add('hidden');
    }
  });

  $aiOptimize.addEventListener('click', async () => {
    if (!aiConfig || !imageSrc) return;

    // Show loading overlay
    $loadingOverlay.classList.remove('hidden');
    $loadingText.textContent = 'AI processing...';

    const prompt = $aiPrompt.value.trim() || DEFAULT_PROMPT;

    // Extract base64 from data URL
    const base64 = imageSrc.includes(',') ? imageSrc.split(',')[1] : imageSrc;

    const result = await generateImage(aiConfig, base64, prompt, (pct) => {
      $loadingText.textContent = pct < 100 ? `AI processing... ${pct}%` : 'Finalizing...';
    });

    if (result.success && result.image) {
      imageSrc = result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
      processImage();
    } else {
      alert(result.error ?? 'AI generation failed');
    }

    // Hide loading overlay
    $loadingOverlay.classList.add('hidden');
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────

init();
