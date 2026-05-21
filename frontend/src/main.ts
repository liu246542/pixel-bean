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
  DEFAULT_GENERATE_PROMPT,
} from './ai-client';
import type { AIServiceConfig } from './ai-client';
import { showCropModal } from './crop';
import { enterFocusMode, exitFocusMode } from './focus';

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

const $uploadArea = document.getElementById('uploadArea') as HTMLElement;
const $fileInput = document.getElementById('fileInput') as HTMLInputElement;

const $imageActions = document.getElementById('imageActions') as HTMLDivElement;
const $cropBtn = document.getElementById('cropBtn') as HTMLButtonElement;

const $aiActions = document.getElementById('aiActions') as HTMLDivElement;
const $aiOptimize = document.getElementById('aiOptimize') as HTMLButtonElement;
const $aiGenerate = document.getElementById('aiGenerate') as HTMLButtonElement;
const $aiPromptWrap = document.getElementById('aiPromptWrap') as HTMLDivElement;
const $aiPrompt = document.getElementById('aiPrompt') as HTMLTextAreaElement;

const $originalCanvas = document.getElementById('originalCanvas') as HTMLCanvasElement;
const $originalPreview = document.getElementById('originalPreview') as HTMLImageElement;
const $previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;

const $tooltip = document.getElementById('tooltip') as HTMLDivElement;

const $editToggle = document.getElementById('editToggle') as HTMLButtonElement;
const $editToolbar = document.getElementById('editToolbar') as HTMLDivElement;
const $editPalette = document.getElementById('editPalette') as HTMLDivElement;
const $editDone = document.getElementById('editDone') as HTMLButtonElement;

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
const $focusBtn = document.getElementById('focusBtn') as HTMLButtonElement;
const $focusPanel = document.getElementById('focusPanel') as HTMLDivElement;
const $focusExitBar = document.getElementById('focusExitBar') as HTMLDivElement;
const $focusExit = document.getElementById('focusExit') as HTMLButtonElement;

const $loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;
const $loadingText = document.getElementById('loadingText') as HTMLParagraphElement;

// ── Application state ───────────────────────────────────────────────────────

const fullPalette: PaletteColor[] = buildFullPalette();
let currentSystem: ColorSystem = 'MARD';
let imageSrc: string | null = null;
let originalImageSrc: string | null = null;
let grid: MappedPixel[][] = [];
const excludedHexes = new Set<string>();
let aiConfig: AIServiceConfig | null = null;
let aiMode: 'optimize' | 'generate' | null = null;
let editMode = false;
let editColor: { rgb: { r: number; g: number; b: number }; hex: string } | null = null;

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
    $aiActions.classList.remove('hidden');
    $aiPromptWrap.classList.remove('hidden');
  }

  // Bind events
  bindUploadEvents();
  bindCropEvents();
  bindSettingsEvents();
  bindPreviewEvents();
  bindEditEvents();
  bindExportEvents();
  bindFocusEvents();
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
    originalImageSrc = imageSrc;
    $uploadArea.querySelector('span')!.textContent = '重新上传';
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

    // Show original image preview
    $originalPreview.src = imageSrc!;
    $originalPreview.classList.remove('hidden');

    // Enable export/focus buttons and show image actions
    $exportGrid.disabled = false;
    $exportStats.disabled = false;
    $focusBtn.disabled = false;
    $imageActions.classList.remove('hidden');
    $editToggle.classList.remove('hidden');

    // Show AI actions if connected
    if (aiConfig) {
      $aiActions.classList.remove('hidden');
      $aiPromptWrap.classList.remove('hidden');
    }
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

// ── Pixel editing ───────────────────────────────────────────────────────────

function bindEditEvents(): void {
  $editToggle.addEventListener('click', () => {
    editMode = true;
    $editToolbar.classList.remove('hidden');
    $editToggle.classList.add('hidden');
    $previewCanvas.style.cursor = 'crosshair';
    buildEditPalette();
  });

  $editDone.addEventListener('click', () => {
    editMode = false;
    editColor = null;
    $editToolbar.classList.add('hidden');
    $editToggle.classList.remove('hidden');
    $previewCanvas.style.cursor = '';
  });

  $previewCanvas.addEventListener('click', (e) => {
    if (!editMode || !editColor || grid.length === 0) return;
    const hit = getCellAt($previewCanvas, grid, e.clientX, e.clientY);
    if (!hit || hit.cell.isExternal) return;

    hit.cell.color = { ...editColor.rgb };
    hit.cell.paletteId = editColor.hex;
    drawPreview($previewCanvas, grid, currentSystem);
    updateColorStats();
  });
}

function buildEditPalette(): void {
  $editPalette.innerHTML = '';
  const colorsInGrid = new Map<string, { r: number; g: number; b: number }>();

  for (const row of grid) {
    for (const cell of row) {
      if (cell.isExternal || cell.paletteId === TRANSPARENT_KEY) continue;
      const hex = rgbToHex(cell.color.r, cell.color.g, cell.color.b);
      if (!colorsInGrid.has(hex)) colorsInGrid.set(hex, { ...cell.color });
    }
  }

  // Also add some common palette colors not in the grid
  const activePalette = getActivePalette();
  for (const pc of activePalette.slice(0, 30)) {
    const hex = pc.name.toUpperCase();
    if (!colorsInGrid.has(hex) && pc.color) colorsInGrid.set(hex, { ...pc.color });
  }

  for (const [hex, rgb] of colorsInGrid) {
    const swatch = document.createElement('div');
    swatch.className = 'edit-palette-color';
    swatch.style.backgroundColor = hex;
    swatch.title = getDisplayKey(hex, currentSystem);
    swatch.addEventListener('click', () => {
      editColor = { rgb, hex };
      $editPalette.querySelectorAll('.edit-palette-color').forEach(el => el.classList.remove('active'));
      swatch.classList.add('active');
    });
    $editPalette.appendChild(swatch);
  }
}

// ── Crop ────────────────────────────────────────────────────────────────────

function bindCropEvents(): void {
  $cropBtn.addEventListener('click', async () => {
    if (!originalImageSrc) return;
    const result = await showCropModal(originalImageSrc);
    if (result) {
      imageSrc = result;
      processImage();
    }
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

// ── Focus mode ──────────────────────────────────────────────────────────────

function bindFocusEvents(): void {
  $focusBtn.addEventListener('click', () => {
    if (grid.length === 0) return;
    // Hide normal UI, show focus UI
    $focusPanel.classList.remove('hidden');
    $focusExitBar.classList.remove('hidden');
    enterFocusMode(grid, currentSystem, $previewCanvas, $focusPanel);
  });

  $focusExit.addEventListener('click', () => {
    exitFocusMode($focusPanel);
    $focusPanel.classList.add('hidden');
    $focusExitBar.classList.add('hidden');
    // Restore normal preview
    drawPreview($previewCanvas, grid, currentSystem);
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
      // Show AI actions (generate works without image, optimize needs image)
      $aiActions.classList.remove('hidden');
      $aiPromptWrap.classList.remove('hidden');
    } else {
      $aiStatus.textContent = 'Connection failed';
      $aiStatus.className = 'ai-status error';
      aiConfig = null;
      aiMode = null;
      $aiActions.classList.add('hidden');
      $aiPromptWrap.classList.add('hidden');
    }
  });

  // AI 优化：第一次点击 → 切换到优化模式并填入默认 prompt；第二次点击 → 执行
  $aiOptimize.addEventListener('click', async () => {
    if (!aiConfig) return;

    if (aiMode !== 'optimize') {
      aiMode = 'optimize';
      $aiPrompt.value = DEFAULT_PROMPT;
      $aiPrompt.placeholder = '修改优化提示词（可自定义风格、比例等）';
      $aiPromptWrap.classList.remove('hidden');
      $aiPrompt.focus();
      $aiOptimize.textContent = '执行优化';
      $aiGenerate.textContent = 'AI 生成';
      return;
    }

    if (!imageSrc) {
      alert('请先上传一张图片');
      return;
    }

    $loadingOverlay.classList.remove('hidden');
    $loadingText.textContent = 'AI 优化中...';

    const prompt = $aiPrompt.value.trim() || DEFAULT_PROMPT;
    const base64 = imageSrc.includes(',') ? imageSrc.split(',')[1] : imageSrc;

    const result = await generateImage(aiConfig, base64, prompt, (text) => {
      $loadingText.textContent = text;
    });

    if (result.success && result.image) {
      imageSrc = result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
      processImage();
    } else {
      alert(result.error ?? 'AI 优化失败');
    }

    $loadingOverlay.classList.add('hidden');
  });

  // AI 生成：第一次点击 → 切换到生成模式并清空 prompt；第二次点击 → 执行
  $aiGenerate.addEventListener('click', async () => {
    if (!aiConfig) return;

    if (aiMode !== 'generate') {
      aiMode = 'generate';
      $aiPrompt.value = '';
      $aiPrompt.placeholder = '输入要生成的内容（如：一只可爱的猫咪、一朵向日葵）';
      $aiPromptWrap.classList.remove('hidden');
      $aiPrompt.focus();
      $aiGenerate.textContent = '执行生成';
      $aiOptimize.textContent = 'AI 优化';
      return;
    }

    const userPrompt = $aiPrompt.value.trim();
    if (!userPrompt) {
      $aiPrompt.focus();
      return;
    }

    $loadingOverlay.classList.remove('hidden');
    $loadingText.textContent = 'AI 生成中...';

    const prompt = `${userPrompt}。${DEFAULT_GENERATE_PROMPT}`;
    const result = await generateImage(aiConfig, '', prompt, (text) => {
      $loadingText.textContent = text;
    });

    if (result.success && result.image) {
      imageSrc = result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
      originalImageSrc = imageSrc;
      $uploadArea.querySelector('span')!.textContent = '重新上传';
      processImage();
    } else {
      alert(result.error ?? 'AI 生成失败');
    }

    $loadingOverlay.classList.add('hidden');
  });
}

// ── Boot ────────────────────────────────────────────────────────────────────

init();
