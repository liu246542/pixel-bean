# Pixel Bean — 拼豆图案生成器设计文档

## 概述

一个模块化的拼豆（perler beads）图案生成工具，由纯前端静态页面和可选的本地 AI 图片优化服务组成。前端部署到 GitHub Pages，AI 服务在本地运行，通过用户配置的 URL + token 连接。

核心算法和颜色映射数据参考自 [Zippland/perler-beads](https://github.com/Zippland/perler-beads)（Apache License 2.0）。

## 项目结构

```
pixel-bean/
├── frontend/                    # Vite + vanilla TS
│   ├── src/
│   │   ├── main.ts              # 入口，初始化 UI 和事件绑定
│   │   ├── ui.ts                # DOM 操作、UI 状态管理
│   │   ├── pixelation.ts        # 像素化算法（主色/均色模式）
│   │   ├── color-merge.ts       # BFS 区域颜色合并
│   │   ├── background.ts        # 边界洪水填充去背景
│   │   ├── palette.ts           # 色板数据 + 色号系统切换
│   │   ├── export.ts            # 导出带 Key 图纸 + 颜色统计图
│   │   ├── ai-client.ts         # 可选：连接本地 AI 服务
│   │   ├── color-data.json      # 291 色 × 5 套色号映射数据
│   │   └── style.css            # 样式
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── ai-server/                   # 可选的本地 AI 服务
│   ├── server.ts                # HTTP server，token 验证 + 调用 codex exec
│   └── package.json
├── LICENSE
└── README.md
```

## 技术栈

- **前端**：Vite + vanilla TypeScript，零框架依赖，构建产物为纯静态文件
- **样式**：纯 CSS，使用 CSS 原生变量做主题，不引入 UI 框架
- **图像处理**：浏览器 Canvas API
- **AI 服务**：Node.js HTTP server，调用 Codex CLI 生成图片
- **部署**：GitHub Pages（前端），本地运行（AI 服务）

## 数据流

```
用户上传图片
    │
    ▼
[可选] AI 优化
  前端发送图片+prompt → 本地 AI 服务
  AI 服务调用 codex exec → 返回生成的图片 base64
  用户选择：使用 AI 图 or 使用原图
    │
    ▼
Canvas 加载图片，获取 ImageData
    │
    ▼
像素化（pixelation.ts）
  - 用户调节粒度 N（横向格子数）
  - 根据 N 和宽高比算出 N×M 网格
  - 每个网格取代表色（主色模式 or 均色模式）
  - 代表色 → 欧氏距离匹配最近的色板颜色
    │
    ▼
区域颜色合并（color-merge.ts）
  - 用户调节合并阈值
  - BFS 找连通的相似色区域
  - 区域内统一为出现最多的色号
    │
    ▼
背景移除（background.ts）
  - 从边界开始洪水填充
  - 标记连通的背景色单元格为 external
    │
    ▼
颜色排除（palette.ts）
  - 用户点击颜色列表排除某色
  - 被排除色的单元格重映射到最近可用色
    │
    ▼
导出（export.ts）
  - 带 Key 图纸：每格填色+标注色号，PNG 下载
  - 颜色统计图：色块+色号+数量列表，PNG 下载
```

## 核心算法

所有算法在浏览器端 Canvas API 上运行，参考自原项目并重新实现。

### 像素化

- 输入：原图 ImageData，粒度 N，模式（主色/均色）
- 将图像划分为 N×M 网格（M 根据宽高比自动计算）
- **主色模式（Dominant）**：每个网格内统计像素 RGB 出现频率，取最高频颜色
- **均色模式（Average）**：每个网格内取所有不透明像素的 RGB 均值
- 代表色通过欧氏距离匹配到最近的色板颜色

### 区域颜色合并

- 输入：初始映射数据，合并阈值
- 从未访问单元格开始 BFS，将欧氏距离小于阈值的邻近单元格归为同一区域
- 区域内统一为出现次数最多的色号

### 背景移除

- 定义背景色号列表（如 T1、H1 等浅色/白色）
- 从图像所有边界单元格开始洪水填充
- 标记所有与边界连通且颜色属于背景色列表的单元格为 external
- 统计和导出时忽略 external 单元格

### 颜色排除与重映射

- 用户排除某色号后，确定重映射目标色板（当前存在且未排除的颜色）
- 被排除色的单元格重映射到目标色板中欧氏距离最近的颜色
- 恢复颜色时触发完整重处理

## 色板系统

- 数据源：291 个标准 hex 颜色，每个颜色映射 5 套色号体系（MARD、COCO、漫漫、盼盼、咪小窝）
- 数据存储为 `color-data.json`，从原项目 `colorSystemMapping.json` 移植
- 预设色板组合：168 色、144 色、96 色等
- 用户切换色号系统后，所有显示的色号名称联动更新

## AI 服务接口

### 前端侧

- 页面顶部有 AI 服务连接区域：输入框 + 测试连接按钮
- 用户填入 `https://your-domain.com/generate?token=xxx`
- 测试连接：GET `{baseUrl}/health?token=xxx`，验证可用性
- 连接成功后显示"AI 优化"按钮
- 连接信息持久化到 localStorage

### API 协议

```
POST {baseUrl}/generate?token=xxx
Content-Type: application/json

Request:
{
  "image": "data:image/png;base64,...",
  "prompt": "chibi art style, simple flat colors, ..."
}

Response:
{
  "success": true,
  "image": "data:image/png;base64,..."
}

Error:
{
  "success": false,
  "error": "error message"
}
```

### AI Server 侧

1. 启动时从环境变量或配置文件读取 TOKEN
2. 请求到达 → 验证 URL 中的 token 参数
3. 将 base64 图片写入临时文件
4. 调用 `codex exec "{prompt}，输入图片: {path}，输出到: {outputPath}" --sandbox workspace-write`
5. 超时 120 秒
6. 读取输出图片，base64 编码返回
7. 清理临时文件

### 默认 Prompt

```
将这张图片转换为适合拼豆制作的风格：chibi art style, simple flat colors,
no gradients, no shading, white background, bold clean outlines,
minimal detail, 4-8 distinct solid colors, cartoon style
```

前端提供文本框让用户可编辑 prompt。

## UI 布局

```
┌─────────────────────────────────────────────────────┐
│  🔲 拼豆图案生成器              [AI服务: 输入框] [测试] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  左侧                          右侧                 │
│  ┌──────────────────┐          ┌──────────────────┐ │
│  │                  │          │  设置面板          │ │
│  │                  │          │  · 粒度滑块       │ │
│  │   预览 Canvas    │          │  · 合并阈值滑块    │ │
│  │  (悬停显示色号)   │          │  · 像素化模式切换  │ │
│  │                  │          │  · 色号系统选择    │ │
│  │                  │          │  · 色板选择       │ │
│  └──────────────────┘          ├──────────────────┤ │
│                                │  颜色统计列表      │ │
│  ┌──────────────────┐          │  · 色块 色号 数量  │ │
│  │  图片上传区域      │          │  · 点击可排除颜色  │ │
│  │  拖放 or 点击选择  │          │  · 总计 xxx 粒    │ │
│  │  [AI优化] 按钮    │          │                  │ │
│  └──────────────────┘          ├──────────────────┤ │
│                                │  [导出图纸] [导出统计]│
│                                └──────────────────┘ │
├─────────────────────────────────────────────────────┤
│  Based on Zippland/perler-beads (Apache 2.0)        │
└─────────────────────────────────────────────────────┘
```

- 左侧：操作区（预览 + 上传），视觉主体
- 右侧：控制区（参数调节 + 颜色列表 + 导出）
- 移动端：响应式堆叠，预览在上，控制在下
- AI 相关 UI 仅在连接成功后显示

## 功能范围（第一版）

### 包含

- 图片上传（拖放 + 点击选择）
- 像素化（粒度可调，主色/均色两种模式）
- 颜色映射到拼豆色板
- 5 套色号系统切换（MARD、COCO、漫漫、盼盼、咪小窝）
- 多种预设色板（168 色、144 色、96 色等）
- BFS 区域颜色合并（阈值可调）
- 背景自动移除
- 颜色排除与重映射
- 实时预览 Canvas（悬停显示色号）
- 导出带 Key 图纸 PNG
- 导出颜色统计图 PNG
- 可选 AI 图片优化（连接本地 Codex 服务）

### 不包含（后续迭代）

- 手动像素编辑（画笔/橡皮擦）
- 专心拼豆模式
- PWA 支持
- 图片裁剪
- 放大镜工具
- CSV 导入

## 许可证

项目使用 MIT License。README 中注明：

> 本项目的像素化算法和颜色映射数据参考了 [Zippland/perler-beads](https://github.com/Zippland/perler-beads) 项目，该项目基于 Apache License 2.0 授权。
