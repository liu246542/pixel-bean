# Pixel Bean

A modular perler bead (fuse bead) pattern generator. Upload an image, pixelate it, map colors to real bead palettes, and export a printable pattern with bead counts.

**[中文说明](./README.zh-CN.md)**

## Features

- **Image pixelation** — adjustable grid size, dominant-color or average-color modes
- **5 bead color systems** — MARD, COCO, 漫漫, 盼盼, 咪小窝 (291 colors)
- **Smart color merging** — reduce similar colors with adjustable threshold
- **Background removal** — auto-detect white borders
- **Color exclusion** — remove unwanted colors, auto-remap to nearest match
- **Export** — download key-labeled grid PNG and color statistics PNG
- **Optional AI optimization** — connect to a local AI service (via Codex CLI) to transform images into bead-friendly flat-color style before pixelation

## Architecture

```
pixel-bean/
├── frontend/       Pure static SPA (Vite + vanilla TypeScript)
│                   Deployable to GitHub Pages, Vercel, or any static host
├── ai-server/      Optional local Node.js service for AI image generation
│                   Calls Codex CLI, communicates with frontend via WebSocket
└── docs/           Design specs and implementation plans
```

The frontend works standalone — no backend needed for core functionality. The AI server is optional and only required for the "AI optimize" feature.

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

In the frontend, enter the AI service URL (e.g. `http://localhost:3456?token=yourtoken`) and click "Test Connection". Once connected, an "AI Optimize" button appears when you upload an image.

### Production Build

```bash
cd frontend
npm run build        # outputs to dist/
```

Deploy `dist/` to GitHub Pages or any static host.

## AI Service Protocol

The AI server uses **WebSocket** for image generation (avoids HTTP timeout issues with reverse proxies like Cloudflare Tunnel).

| Endpoint | Protocol | Purpose |
|----------|----------|---------|
| `GET /health?token=...` | HTTP | Health check |
| `/generate?token=...` | WebSocket | Image generation |

WebSocket message flow:

```
Client → Server:  { "image": "base64...", "prompt": "..." }
Server → Client:  { "type": "progress", "text": "正在生成图片..." }  (multiple)
Server → Client:  { "type": "done", "success": true, "image": "base64..." }
```

Requests are queued — only one Codex process runs at a time.

## Deployment with Cloudflare Tunnel

If you want to expose the AI server via Cloudflare Tunnel:

1. Point a subdomain (e.g. `ai.yourdomain.com`) to `http://localhost:3456`
2. No extra cloudflared configuration needed — WebSocket is natively supported
3. In the frontend, enter `https://ai.yourdomain.com?token=yourtoken`

## Attribution

Pixelation algorithms and bead color data are derived from [Zippland/perler-beads](https://github.com/Zippland/perler-beads), used under the **Apache License 2.0**.

## License

[MIT](./LICENSE) — Copyright (c) 2024-2026 Feng Liu
