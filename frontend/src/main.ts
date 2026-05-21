import './style.css';

import type { MappedPixel, ColorSystem, PixelationMode, PaletteColor } from './types';
import { EditHistory } from './history';
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
import { removeIsolatedNoise } from './noise-cleanup';
import { drawPreview, getCellAt, drawBoardSplitOverlay } from './preview';
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
import { autoSave, autoLoad, restoreGrid, exportCsv, importCsv } from './storage';
import { exportPdf } from './pdf-export';
import { enterFocusMode, isFocusActive, redrawFocus } from './focus';
import { showGuideModal } from './guide';

// ── Helpers ─────────────────────────────────────────────────────────────────

let fakeProgressTimer: ReturnType<typeof setInterval> | null = null;

function startFakeProgress(): void {
  if (fakeProgressTimer) { clearInterval(fakeProgressTimer); fakeProgressTimer = null; }
  const startTime = Date.now();
  const expectedMs = 4 * 60 * 1000;
  $loadingProgress.style.width = '0%';
  $loadingPct.textContent = '0%';
  $loadingEta.textContent = '预计需要 3-5 分钟';

  fakeProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    // Asymptotic curve: approaches 95% but never reaches it
    const pct = Math.min(95, Math.round((1 - Math.exp(-elapsed / expectedMs * 3)) * 95));
    $loadingProgress.style.width = `${pct}%`;
    $loadingPct.textContent = `${pct}%`;

    const remaining = Math.max(0, Math.round((expectedMs - elapsed) / 60000));
    if (remaining > 0) {
      $loadingEta.textContent = `预计还需 ${remaining} 分钟`;
    } else {
      $loadingEta.textContent = '耗时较长，请耐心等待...';
    }
  }, 1000);
}

function stopFakeProgress(success: boolean): void {
  if (fakeProgressTimer) { clearInterval(fakeProgressTimer); fakeProgressTimer = null; }
  if (success) {
    $loadingProgress.style.width = '100%';
    $loadingPct.textContent = '100%';
    $loadingEta.textContent = '';
  }
}

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
const $editUndo = document.getElementById('editUndo') as HTMLButtonElement;
const $editRedo = document.getElementById('editRedo') as HTMLButtonElement;
const $editDone = document.getElementById('editDone') as HTMLButtonElement;

const $granularity = document.getElementById('granularity') as HTMLInputElement;
const $mergeThreshold = document.getElementById('mergeThreshold') as HTMLInputElement;
const $pixelMode = document.getElementById('pixelMode') as HTMLSelectElement;
const $colorSystem = document.getElementById('colorSystem') as HTMLSelectElement;

const $boardSplitToggle = document.getElementById('boardSplitToggle') as HTMLInputElement;
const $boardSize = document.getElementById('boardSize') as HTMLSelectElement;

const $totalCount = document.getElementById('totalCount') as HTMLSpanElement;
const $colorList = document.getElementById('colorList') as HTMLDivElement;

const $saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const $exportGrid = document.getElementById('exportGrid') as HTMLButtonElement;
const $exportStats = document.getElementById('exportStats') as HTMLButtonElement;
const $exportPdf = document.getElementById('exportPdf') as HTMLButtonElement;
const $exportCsv = document.getElementById('exportCsv') as HTMLButtonElement;
const $importCsv = document.getElementById('importCsv') as HTMLInputElement;
const $focusBtn = document.getElementById('focusBtn') as HTMLButtonElement;
const $guideBtn = document.getElementById('guideBtn') as HTMLButtonElement;

const $loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;
const $loadingText = document.getElementById('loadingText') as HTMLParagraphElement;
const $loadingProgress = document.getElementById('loadingProgress') as HTMLDivElement;
const $loadingPct = document.getElementById('loadingPct') as HTMLSpanElement;
const $loadingEta = document.getElementById('loadingEta') as HTMLParagraphElement;

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
const editHistory = new EditHistory();

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
  bindSaveEvent();
  bindExportEvents();
  bindCsvEvents();
  bindFocusEvents();
  bindAiEvents();

  // Auto-restore last session
  const saved = autoLoad();
  if (saved) {
    grid = restoreGrid(saved);
    currentSystem = saved.system;
    $granularity.value = String(saved.granularity);
    syncPresetState('granularityPresets', $granularity.value);
    $mergeThreshold.value = String(saved.mergeThreshold);
    syncPresetState('mergePresets', $mergeThreshold.value);
    $pixelMode.value = saved.mode;
    $colorSystem.value = saved.system;
    redrawPreview();
    updateColorStats();
    $saveBtn.disabled = false;
    $exportGrid.disabled = false;
    $exportStats.disabled = false;
    $exportPdf.disabled = false;
    $exportCsv.disabled = false;
    $focusBtn.disabled = false;
    $guideBtn.disabled = false;
    $editToggle.classList.remove('hidden');
  }

  // Redraw canvas when returning from background (browsers may discard canvas content)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && grid.length > 0) {
      if (isFocusActive()) {
        redrawFocus();
      } else {
        redrawPreview();
      }
    }
  });
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
    let cols = parseInt($granularity.value, 10);
    if (!cols || cols < 10) cols = 10;
    if (cols > 200) cols = 200;
    $granularity.value = String(cols);

    let threshold = parseInt($mergeThreshold.value, 10);
    if (isNaN(threshold) || threshold < 0) threshold = 0;
    if (threshold > 100) threshold = 100;
    $mergeThreshold.value = String(threshold);

    const rows = Math.max(1, Math.round(cols * (img.height / img.width)));

    const activePalette = getActivePalette();
    const fallback = activePalette[0];

    const mode = $pixelMode.value as PixelationMode;

    grid = pixelate(imageData, cols, rows, activePalette, mode, fallback);
    mergeColors(grid, threshold);
    removeIsolatedNoise(grid);
    markBackground(grid);
    redrawPreview();
    updateColorStats();

    // Show original image preview
    $originalPreview.src = imageSrc!;
    $originalPreview.classList.remove('hidden');

    // Enable export/focus buttons and show image actions
    $saveBtn.disabled = false;
    $exportGrid.disabled = false;
    $exportStats.disabled = false;
    $exportPdf.disabled = false;
    $exportCsv.disabled = false;
    $focusBtn.disabled = false;
    $guideBtn.disabled = false;
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
    redrawPreview();
    updateColorStats();
  }
}

// ── Settings events ─────────────────────────────────────────────────────────

function syncPresetState(groupId: string, val: string): void {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.preset-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.val === val);
  });
}

function bindPresetGroup(groupId: string, input: HTMLInputElement): void {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.preset-btn') as HTMLElement | null;
    if (!btn) return;
    const val = btn.dataset.val;
    if (!val) return;
    input.value = val;
    group.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    processImage();
  });
  // Sync active state when input changes manually
  input.addEventListener('change', () => {
    const val = input.value;
    group.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', (b as HTMLElement).dataset.val === val);
    });
  });
}

function bindSettingsEvents(): void {
  // Granularity with presets
  bindPresetGroup('granularityPresets', $granularity);
  $granularity.addEventListener('change', () => processImage());

  // Merge threshold (减色) with presets
  bindPresetGroup('mergePresets', $mergeThreshold);
  $mergeThreshold.addEventListener('change', () => processImage());

  // Pixel mode
  $pixelMode.addEventListener('change', () => processImage());

  // Color system
  $colorSystem.addEventListener('change', () => {
    currentSystem = $colorSystem.value as ColorSystem;
    if (grid.length > 0) {
      redrawPreview();
      updateColorStats();
    }
  });

  // Board split
  $boardSplitToggle.addEventListener('change', () => {
    $boardSize.disabled = !$boardSplitToggle.checked;
    if (grid.length > 0) {
      redrawPreview();
    }
  });
  $boardSize.addEventListener('change', () => {
    if (grid.length > 0 && $boardSplitToggle.checked) {
      redrawPreview();
    }
  });
}

function redrawPreview(): void {
  if (grid.length === 0) return;
  drawPreview($previewCanvas, grid, currentSystem);
  if ($boardSplitToggle.checked) {
    drawBoardSplitOverlay($previewCanvas, grid.length, grid[0].length, parseInt($boardSize.value));
  }
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

function updateUndoRedoButtons(): void {
  $editUndo.disabled = !editHistory.canUndo();
  $editRedo.disabled = !editHistory.canRedo();
}

function bindEditEvents(): void {
  $editToggle.addEventListener('click', () => {
    editMode = true;
    $editToolbar.classList.remove('hidden');
    $editToggle.classList.add('hidden');
    $previewCanvas.style.cursor = 'crosshair';
    editHistory.push(grid);
    updateUndoRedoButtons();
    buildEditPalette();
  });

  $editDone.addEventListener('click', () => {
    editMode = false;
    editColor = null;
    $editToolbar.classList.add('hidden');
    $editToggle.classList.remove('hidden');
    $previewCanvas.style.cursor = '';
    editHistory.clear();
  });

  $editUndo.addEventListener('click', () => {
    const prev = editHistory.undo();
    if (prev) {
      grid = prev;
      redrawPreview();
      updateColorStats();
      updateUndoRedoButtons();
    }
  });

  $editRedo.addEventListener('click', () => {
    const next = editHistory.redo();
    if (next) {
      grid = next;
      redrawPreview();
      updateColorStats();
      updateUndoRedoButtons();
    }
  });

  $previewCanvas.addEventListener('click', (e) => {
    if (!editMode || !editColor || grid.length === 0) return;
    const hit = getCellAt($previewCanvas, grid, e.clientX, e.clientY);
    if (!hit || hit.cell.isExternal) return;

    hit.cell.color = { ...editColor.rgb };
    hit.cell.paletteId = editColor.hex;
    redrawPreview();
    updateColorStats();
    editHistory.push(grid);
    updateUndoRedoButtons();
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

function bindSaveEvent(): void {
  $saveBtn.addEventListener('click', () => {
    if (grid.length === 0) return;
    autoSave(grid, currentSystem, $pixelMode.value as PixelationMode, parseInt($granularity.value), parseInt($mergeThreshold.value));
    $saveBtn.textContent = '已保存';
    setTimeout(() => { $saveBtn.textContent = '保存'; }, 1500);
  });
}

function bindExportEvents(): void {
  $exportGrid.addEventListener('click', () => {
    if (grid.length > 0) exportKeyGrid(grid, currentSystem);
  });

  $exportStats.addEventListener('click', () => {
    if (grid.length > 0) exportStats(grid, currentSystem);
  });

  $exportPdf.addEventListener('click', () => {
    if (grid.length > 0) {
      const bs = $boardSplitToggle.checked ? parseInt($boardSize.value) : undefined;
      exportPdf(grid, currentSystem, undefined, bs);
    }
  });
}

// ── CSV import/export ───────────────────────────────────────────────────────

function bindCsvEvents(): void {
  $exportCsv.addEventListener('click', () => {
    if (grid.length > 0) exportCsv(grid);
  });

  $importCsv.addEventListener('change', async () => {
    const file = $importCsv.files?.[0];
    if (!file) return;
    try {
      grid = await importCsv(file);
      imageSrc = null;
      originalImageSrc = null;
      redrawPreview();
      updateColorStats();
      $saveBtn.disabled = false;
    $exportGrid.disabled = false;
      $exportStats.disabled = false;
      $exportPdf.disabled = false;
    $exportCsv.disabled = false;
      $focusBtn.disabled = false;
    $guideBtn.disabled = false;
      $editToggle.classList.remove('hidden');
    } catch (e) {
      alert(`导入失败: ${e instanceof Error ? e.message : e}`);
    }
    $importCsv.value = '';
  });
}

// ── Focus mode ──────────────────────────────────────────────────────────────

function bindFocusEvents(): void {
  $focusBtn.addEventListener('click', () => {
    if (grid.length === 0 || isFocusActive()) return;
    const bs = $boardSplitToggle.checked ? parseInt($boardSize.value) : undefined;
    const ok = enterFocusMode(grid, currentSystem, () => {
      $focusBtn.disabled = false;
    }, bs);
    if (ok) $focusBtn.disabled = true;
  });

  $guideBtn.addEventListener('click', () => {
    if (grid.length === 0) return;
    showGuideModal(grid, currentSystem);
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
    startFakeProgress();

    const prompt = $aiPrompt.value.trim() || DEFAULT_PROMPT;
    const base64 = imageSrc.includes(',') ? imageSrc.split(',')[1] : imageSrc;

    const result = await generateImage(aiConfig, base64, prompt, (text) => {
      $loadingText.textContent = text;
    });

    stopFakeProgress(result.success);

    if (result.success && result.image) {
      imageSrc = result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
      originalImageSrc = imageSrc;
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
      $aiPrompt.value = DEFAULT_GENERATE_PROMPT;
      $aiPrompt.placeholder = 'AI 优化 / 生成提示词';
      $aiPromptWrap.classList.remove('hidden');
      // Put cursor at the beginning so user can type content first
      $aiPrompt.focus();
      $aiPrompt.setSelectionRange(0, 0);
      $aiGenerate.textContent = '执行生成';
      $aiOptimize.textContent = 'AI 优化';
      return;
    }

    const userPrompt = $aiPrompt.value.trim();
    if (!userPrompt || userPrompt === DEFAULT_GENERATE_PROMPT) {
      $aiPrompt.focus();
      $aiPrompt.setSelectionRange(0, 0);
      return;
    }

    $loadingOverlay.classList.remove('hidden');
    $loadingText.textContent = 'AI 生成中...';
    startFakeProgress();

    const prompt = userPrompt;
    const result = await generateImage(aiConfig, '', prompt, (text) => {
      $loadingText.textContent = text;
    });

    stopFakeProgress(result.success);

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
