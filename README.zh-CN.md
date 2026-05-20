# Pixel Bean — 拼豆图案生成器

上传图片，自动生成拼豆图纸和采购清单。

**[English](./README.md)**

## 功能

- **图片像素化** — 可调粒度，支持主色模式和均色模式
- **5 套色号系统** — MARD、COCO、漫漫、盼盼、咪小窝（291 种颜色）
- **智能颜色合并** — 通过阈值自动合并相似颜色，减少色号数量
- **背景自动移除** — 识别并标记白色边界区域
- **颜色排除** — 点击排除不需要的颜色，自动重映射到最近色
- **导出图纸** — 下载带色号标注的网格图和颜色统计图（PNG 格式）
- **AI 图片优化（可选）** — 连接本地 AI 服务，将图片转换为平涂风格后再像素化，效果更好

## 项目结构

```
pixel-bean/
├── frontend/       纯前端静态页面（Vite + TypeScript）
│                   可部署到 GitHub Pages 或任何静态托管
├── ai-server/      可选的本地 AI 服务
│                   调用 Codex CLI 生成图片，通过 WebSocket 与前端通信
└── docs/           设计文档和实现计划
```

前端独立运行，不需要后端。AI 服务是可选的，仅在使用"AI 优化"功能时需要。

## 快速开始

### 前端

```bash
cd frontend
npm install
npm run dev          # 开发服务器 http://localhost:5173
```

### AI 服务（可选）

```bash
cd ai-server
npm install
cp .env.example .env # 编辑 TOKEN 和代理设置
npm start            # 启动在 http://localhost:3456
```

需要安装 [Codex CLI](https://github.com/openai/codex) 并完成登录（`codex login`）。

在前端页面顶部输入 AI 服务地址（如 `http://localhost:3456?token=你的密码`），点击"测试连接"。连接成功后，上传图片时会出现"AI 优化"按钮。

### 构建部署

```bash
cd frontend
npm run build        # 输出到 dist/
```

将 `dist/` 目录部署到 GitHub Pages 或其他静态托管即可。

## 使用流程

1. 打开页面，拖放或点击上传一张图片
2. 调节**粒度**（横向格子数）和**合并阈值**
3. 选择**像素化模式**（主色=卡通风格，均色=真实风格）
4. 选择你使用的**色号系统**（MARD、COCO 等）
5. 在颜色列表中点击不需要的颜色进行排除
6. 点击**导出图纸**或**导出统计**下载 PNG

### AI 优化流程（可选）

1. 连接 AI 服务（填地址 → 测试连接）
2. 上传图片后点击 **AI 优化**
3. 等待 Codex 处理（约 1-5 分钟，页面会显示实时进度）
4. AI 会将图片转换为简洁、平涂、轮廓清晰的风格
5. 处理完成后自动用 AI 生成的图替换原图进行像素化

## AI 服务协议

AI 服务使用 **WebSocket** 进行图片生成（避免 Cloudflare Tunnel 等反向代理的 HTTP 超时问题）。

| 端点 | 协议 | 用途 |
|------|------|------|
| `GET /health?token=...` | HTTP | 健康检查 |
| `/generate?token=...` | WebSocket | 图片生成 |

WebSocket 消息流程：

```
客户端 → 服务端:  { "image": "base64...", "prompt": "..." }
服务端 → 客户端:  { "type": "progress", "text": "正在生成图片..." }  (多条)
服务端 → 客户端:  { "type": "done", "success": true, "image": "base64..." }
```

多人同时使用时请求会排队，一次只运行一个 Codex 进程。

## 通过 Cloudflare Tunnel 部署 AI 服务

如果你想让 AI 服务通过公网访问：

1. 在 Cloudflare 面板将子域名（如 `ai.你的域名.com`）指向 `http://localhost:3456`
2. 不需要额外的 cloudflared 配置 — WebSocket 原生支持
3. 前端填入 `https://ai.你的域名.com?token=你的密码`

## .env 配置说明

```bash
# ai-server/.env
TOKEN=changeme              # API 认证密码
PORT=3456                   # 服务端口
https_proxy=http://127.0.0.1:8119  # 代理地址（如果需要）
```

## 致谢

像素化算法和拼豆颜色数据参考了 [Zippland/perler-beads](https://github.com/Zippland/perler-beads) 项目，该项目基于 Apache License 2.0 授权。

## 许可证

[MIT](./LICENSE) — Copyright (c) 2024-2026 Feng Liu
