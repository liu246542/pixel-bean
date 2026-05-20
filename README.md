# Pixel Bean

A browser-based perler bead pattern generator. Upload any image, choose a bead
color system, and instantly get a printable pixel pattern with a bead count
summary.

## Features

- Pixelate any image to a configurable grid size
- Supports multiple bead color systems: MARD, COCO, 漫漫, 盼盼, 咪小窝
- Dominant-color or average-color pixel reduction modes
- Erase individual cells on the output grid
- Export the pattern as a PNG or PDF

## Usage

```bash
cd frontend
npm install
npm run dev        # start local dev server
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

Open `http://localhost:5173` in your browser.

### Steps

1. Click **Upload Image** and choose a photo or graphic.
2. Set the **grid width** (number of bead columns).
3. Choose a **color system** that matches the beads you own.
4. Select a **pixelation mode** (dominant or average).
5. Click **Generate Pattern**.
6. Optionally erase cells by clicking them on the grid.
7. Click **Export** to download the printable pattern.

## Development

```
frontend/          Vite + TypeScript SPA
  src/
    main.ts        App entry point
    types.ts       Shared TypeScript interfaces and constants
    style.css      Global CSS variables and reset
  index.html
  vite.config.ts
  tsconfig.json
  package.json
docs/              Design specs and implementation plans
```

## Attribution

Bead color data is derived from the
[Zippland/perler-beads](https://github.com/Zippland/perler-beads) project,
used under the **Apache License 2.0**.

> Copyright 2024 Zippland
>
> Licensed under the Apache License, Version 2.0 (the "License");
> you may not use this file except in compliance with the License.
> You may obtain a copy of the License at
>
>     http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS,
> WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
> See the License for the specific language governing permissions and
> limitations under the License.

## License

This project is released under the [MIT License](./LICENSE).
