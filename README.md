# Pixel Bean

A feature-rich perler bead (fuse bead) pattern generator with AI integration, guided assembly instructions, and multi-board support.

**[中文说明](./README.zh-CN.md)**

## Features

### Core
- **Image pixelation** — board-aware presets (粗/中/细/精) or custom input, dominant-color or average-color modes
- **Granularity = long edge** — ensures patterns fit on the expected number of boards regardless of image orientation
- **9 bead color systems** — MARD, MARD (A-M), COCO, Manman, Panpan, Mixiaowo, Hama, Perler, Artkal-S (417 colors)
- **MARD (A-M)** — 221-color subset matching real-world store stock (default)
- **CIEDE2000 color matching** — perceptual color difference for accurate bead color mapping
- **Smart color reduction** — merge similar colors with adjustable threshold
- **Pattern noise cleanup** — auto-remove isolated single-cell color artifacts
- **Majority filter (去毛刺)** — 3×3 smoothing to remove edge fringe and anti-aliasing artifacts
- **Background removal** — flood-fill detection of border-connected white areas
- **Color exclusion** — click to remove unwanted colors, auto-remap to nearest match
- **Image cropping** — built-in crop with aspect ratio presets (1:1, 4:3, 16:9, etc.)
- **Auto-trim** — one-click removal of white/transparent borders (tolerates stray pixels)
- **5-cell grid emphasis** — every 5th line drawn thicker for easier counting

### Board Splitting
- **Multi-board patterns** — split large patterns into 50×50 / 29×29 / 25×25 pegboard sections
- **Default 50×50** — matches common large pegboards
- **Visual overlay** — red dashed lines with A1/A2/B1/B2 board labels on preview
- **Full-size boards** — edge boards padded to standard size (matches real pegboards)
- **Dynamic presets** — granularity presets auto-calculate based on selected board size
- Integrated across all modes: preview, PDF, focus mode, guide mode

### Focus Mode (Immersive Assembly)
- **Fullscreen overlay** — distraction-free bead placement
- **Per-color guidance** — highlights one color at a time, dims the rest
- **Click-to-mark regions** — tap a connected area to mark it complete
- **Checkbox completion** — mark an entire color as done
- **Crosshair with coordinates** — cursor-following tooltip shows R/C position
- **Board navigation** — switch between boards with ◀/▶ when splitting is enabled
- **Board-local coordinates** — ruler shows position within the current board
- **Progress tracking** — per-color bars and overall bead count

### Guide Mode (Text Instructions)
- **Color mode** — step-by-step placement per color: "Row 5: C1-C8 (8), C22-C30 (9)"
- **Row mode** — row-by-row instructions (cross-stitch Row Parking method): each row's color segments in order
- **Board splitting** — independent instructions per board for parallel assembly
- **Preview canvas** — collapsible pattern preview highlighting active color/row
- **Step navigation** — prev/next buttons to walk through colors or rows
- **Export** — copy to clipboard or download as text file

### Editor Mode (Immersive Pixel Editing)
- **Fullscreen overlay** — large canvas for precise cell selection
- **Color palette** — colors from current grid + additional palette colors
- **Undo/redo** — 50-step history with no-op paint detection
- **Save/cancel** — apply changes or discard without affecting the main grid

### Export
- **PNG grid** — key-labeled pattern with color codes in each cell
- **PNG stats** — color legend with swatch, key, hex, count
- **PDF** — multi-page: overview + per-board detail pages (auto-split when cells are small) + color legend with pagination
- **CSV** — compatible with Zippland/perler-beads format, import and export

### AI Integration (Optional)
- **AI optimize** — transform uploaded images into bead-friendly flat-color style
- **AI generate** — create images from text descriptions with bead-style presets
- **Bilingual prompts** — Chinese + English for better adherence
- **Two-step prompt** — default style keywords pre-filled, user adds content
- **Real-time progress** — WebSocket streaming with progress bar and ETA
- **Auto-retry** — up to 3 attempts on transient failures
- **Heartbeat** — keeps connection alive through Cloudflare Tunnel

### Other
- **Manual save/restore** — save current state to localStorage, auto-restore on reload
- **Responsive layout** — sticky controls on mobile, single-column stacking
- **Canvas recovery** — redraws on visibility change (background tab return)
- **Re-pixelate on system change** — switching color systems re-processes the image with the new palette

## Architecture

```
pixel-bean/
├── frontend/       Pure static SPA (Vite + vanilla TypeScript, ~50KB gzip)
│                   Deployable to GitHub Pages, Vercel, or any static host
├── ai-server/      Optional local Node.js service for AI image generation
│                   Calls Codex CLI via WebSocket, with queue and retry
└── docs/           Design specs and implementation plans
```

The frontend works standalone — no backend needed for core functionality.

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev          # dev server at http://localhost:5173
```

### AI Server (optional)

```bash
cd ai-server
npm install
cp .env.example .env # edit TOKEN and proxy settings
npm start            # starts on http://localhost:3456
```

Requires [Codex CLI](https://github.com/openai/codex) installed and authenticated (`codex login`).

### Production Build

```bash
cd frontend
npm run build        # outputs to dist/
```

Deploy `dist/` to GitHub Pages or any static host. GitHub Actions auto-deploys on push to master.

## AI Service

The AI server uses **WebSocket** for image generation (avoids HTTP timeout issues with reverse proxies).

| Endpoint | Protocol | Purpose |
|----------|----------|---------|
| `GET /health?token=...` | HTTP | Health check |
| `/generate?token=...` | WebSocket | Image generation |

Features: request queuing, 20s heartbeat, auto-retry (3 attempts), frontend disconnect cancellation, 50-image history.

### Cloudflare Tunnel

1. Point a subdomain to `http://localhost:3456`
2. No extra cloudflared config needed — WebSocket is natively supported
3. Enter `https://your.domain?token=yourtoken` in the frontend

## Attribution

Pixelation algorithms and bead color data derived from [Zippland/perler-beads](https://github.com/Zippland/perler-beads) (Apache License 2.0).

## License

[MIT](./LICENSE) — Copyright (c) 2026 Feng Liu
