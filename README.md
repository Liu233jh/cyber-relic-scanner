# Cyber Relic Scanner — 赛博遗物：数据提取终端

> A real-time 3D text-layout engine where the silhouette of a damaged flight helmet physically displaces terminal text, styled as a deep-space derelict data recovery terminal.

**Live:** `https://liu233jh.github.io/cyber-relic-scanner/`

---

## Table of Contents

1. [Project Genesis: From Zero to Cyber Relic](#project-genesis)
2. [What This Actually Is](#what-this-actually-is)
3. [Conceptual Architecture](#conceptual-architecture)
4. [The Rendering Pipeline (Frame-by-Frame)](#the-rendering-pipeline)
5. [Project Structure](#project-structure)
6. [Technology Stack](#technology-stack)
7. [Getting Started](#getting-started)
8. [Development Journey (Changelog)](#development-journey)
9. [Deployment](#deployment)
10. [Configuration Reference](#configuration-reference)
11. [How To Swap The Model](#how-to-swap-the-model)
12. [License & Credits](#license--credits)

---

## Project Genesis

### Step 0 — Understanding the Foundations

This project began by studying two open-source repositories:

**`chenglou/pretext`** — A high-performance text layout engine (~0.0002ms per layout operation). Unlike CSS text layout, Pretext works at the grapheme level with canvas-based measurement, supporting breakable-fit-advance. Key exports: `prepareWithSegments()`, `layoutNextLine()`.

**`feitangyuan/pretext-3d`** — A proof-of-concept integrating Three.js 3D rendering with Pretext text layout. The core insight: render a 3D model to an offscreen mask, scan the mask for occupied pixels, carve legal text slots from the remaining horizontal space, and feed those slots to Pretext for line-by-line reflow. The text literally flows around the 3D object's silhouette in real time.

### Step 1 — Clone, Analyze, Install

```bash
git clone https://github.com/chenglou/pretext.git
git clone https://github.com/feitangyuan/pretext-3d.git
cd pretext-3d && pnpm install
```

### Step 2 — The "Text Black Hole" Interaction

The first innovation: extending the mask pipeline so text does not just avoid the 3D model — it also avoids the **mouse cursor**. A circular "black hole" region centered on the cursor repels text, creating the illusion that the user's pointer exerts gravitational pull on the typography.

This introduced `getMouseBlackHoleInterval()` in `mask-layout.mjs`, which computes the intersection of a circle at the mouse position with each text band, returning a blocked interval that gets merged with the model silhouette mask.

### Step 3 — Matrix Hacker Visual Overhaul

Theme pivot: dark terminal aesthetic with green-on-black text, CRT scanlines, wireframe 3D geometry, and glitch effects. A 13-part procedural voxel bust was created as a fallback model (hoodie + mask figure built from `BoxGeometry` + `EdgesGeometry` wireframe overlays).

### Step 4 — Mysterious Hacker Interaction Space

Introduced model-centric rotation (users drag to rotate the model itself, not orbit the camera), Three.js `SpotLight` for dramatic under-lighting, velocity-driven per-character glitch effects, and CSS `@keyframes flicker` with staggered delays for CRT authenticity.

### Step 5 — Real GLB Model Swap

Replaced the procedural voxel bust with **KhronosGroup DamagedHelmet** — a 3.6MB sci-fi flight helmet with battle-scarred PBR materials (CC BY 4.0 license). The model is loaded via Three.js `GLTFLoader` with automatic Box3 normalization and centering. A procedural fallback remains in the code for offline resilience.

### Step 6 — Cyber Relic: Data Extraction Terminal

The final thematic overhaul: deep navy-black background (`#05050A`), holographic cyan text (`#00F0FF`) with bloom-style `text-shadow`, cinematic three-point lighting (white key light raking across the helmet to expose scratch detail + cyan rim light for a cyber silhouette + subtle fill), cyan `EdgesGeometry` wireframe overlay on the GLB model (opacity 0.25), and corrupted flight-log tokens (`DATA_CORRUPTED`, `SECTOR_7G_OFFLINE`, `0xBADF00D`, `LIFE_SUPPORT_CRITICAL`, etc.).

### Step 7 — GitHub Pages Deployment

Configured `vite.config.js` with `base: '/cyber-relic-scanner/'`, moved static assets into Vite's `public/` directory, installed `gh-pages`, and deployed to `https://liu233jh.github.io/cyber-relic-scanner/`.

---

## What This Actually Is

This is **not** a decorative 3D background with text overlaid on top. The 3D model's visible silhouette is a **live spatial constraint** that shapes where text can legally appear. Every frame:

1. The model is rendered to an offscreen mask (white geometry on black background)
2. Pixel data is read back from the GPU
3. Each horizontal text band is scanned for occupied columns
4. Blocked intervals are merged and subtracted from the available line width
5. Pretext recomposes text into the surviving slots
6. DOM text nodes are repositioned in real time

The result: text that **flows around the 3D object**, dynamically updating as the model rotates or the mouse moves.

---

## Conceptual Architecture

```
┌─────────────────────────────────────────────────────┐
│                    USER INPUT                        │
│  Drag to rotate model   Move mouse to repel text    │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
               ▼                  ▼
┌──────────────────────┐  ┌──────────────────────────┐
│   VISIBLE SCENE       │  │   MASK SCENE              │
│   Three.js WebGL      │  │   Offscreen WebGL         │
│   - DamagedHelmet.glb │  │   - Same geometry         │
│   - 3-point lighting  │  │   - White override mat    │
│   - cyan wireframe    │  │   - Black background      │
│   → screen output     │  │   → pixel buffer          │
└──────────────────────┘  └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │   MASK ANALYSIS            │
                          │   mask-layout.mjs          │
                          │   - getMaskIntervalForBand │
                          │   - mergeIntervals         │
                          │   - carveTextLineSlots     │
                          │   - chooseSlot             │
                          │   - mouse black hole       │
                          └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │   TEXT LAYOUT              │
                          │   @chenglou/pretext        │
                          │   - prepareWithSegments    │
                          │   - layoutNextLine         │
                          │   → positioned text lines  │
                          └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │   DOM RECONCILIATION       │
                          │   main.mjs                 │
                          │   - syncLinePool           │
                          │   - update node positions  │
                          │   - applyGlitch (CSS)      │
                          │   → rendered text overlay  │
                          └──────────────────────────┘
```

---

## The Rendering Pipeline

### Frame Loop (`tick()`)

```
tick()
  │
  ├─ Update model rotation (idle spin or drag-driven)
  ├─ Decay mouse velocity
  ├─ Sync model + mask rotation
  │
  ├─ renderScene()       → visible WebGL frame to screen
  ├─ renderMask()        → offscreen WebGL → ImageData
  ├─ layoutCopy(mask)    → slot carving → Pretext reflow → DOM update
  └─ applyGlitch()       → per-character CSS transforms
```

### Mask Pipeline (`layoutCopy` → `layoutBlock` → `placeFlowLine`)

For every text line band (y, y + LINE_HEIGHT):

1. **`getMaskIntervalForBand()`** — scan the mask ImageData row-by-row for white pixels (threshold ≥ 26). Map mask coordinates back to viewport coordinates. Return `{ left, right }` or `null`.

2. **`getMouseBlackHoleInterval()`** — compute the intersection of a circle (radius 200px centered on cursor) with this band. Return `{ left, right }` or `null`.

3. **`mergeIntervals()`** — combine model mask + mouse black hole into a single list of blocked horizontal ranges, sorted and deduplicated.

4. **`carveTextLineSlots()`** — subtract blocked intervals from the full viewport width. Keep slots ≥ `MIN_SLOT_WIDTH` (80px).

5. **`chooseSlot()`** — pick the widest available slot. Tie-break by alignment preference.

6. **`layoutNextLine()`** — call Pretext with the chosen slot width. Get back a line of grapheme-breakable text that fits.

7. Position the line in the DOM at `(slot.left, band.y)`.

### Cache Key

```
`${viewportWidth}:${viewportHeight}:${modelRotationY}:${modelRotationX}:${mouseX}:${mouseY}`
```

Layout is recomputed only when this key changes — rotation granularity at 4 decimal places.

---

## Project Structure

```
pretext-3d/
├── index.html              # Entry HTML (scene-layer, copy-layer, scrub-track, status-chip)
├── main.mjs                # Core application (~700 lines)
│   ├── initScene()         #   Three.js setup, lighting, camera
│   ├── loadModel()         #   GLTFLoader → normalizeModel → addCyberWireframe
│   ├── normalizeModel()    #   Box3 centering + scale to 5.0 units
│   ├── addCyberWireframe() #   Cyan EdgesGeometry overlay on all meshes
│   ├── computeFitState()   #   Auto-camera distance from model bounds + FOV
│   ├── tick()              #   Frame loop: rotation, camera, mask, layout, glitch
│   ├── layoutCopy()        #   Full text reflow orchestration
│   ├── layoutBlock()       #   Block-level: lead lines + body paragraphs
│   ├── placeFlowLine()     #   Single line placement with fallback
│   ├── applyGlitch()       #   Proximity + velocity CSS jitter
│   ├── generateFlightLogText() #  Procedural corrupted-log text generator
│   └── createProceduralModel() #  Voxel bust fallback (13 BoxGeometry parts)
├── mask-layout.mjs         # Slot carving engine (~140 lines)
│   ├── getMaskIntervalForBand()    # Pixel → viewport interval scan
│   ├── getMouseBlackHoleInterval() # Circle-segment intersection
│   ├── mergeIntervals()            # Sort, clip, deduplicate blocked ranges
│   ├── carveTextLineSlots()        # Subtract blocked from free space
│   ├── chooseSlot()                # Widest-slot selection with alignment tie-break
│   ├── splitParagraphs()           # Text → paragraph array
│   ├── clamp() / lerp()            # Math utilities
│   └── getScrubPose() / shouldJustifyLine()  # Legacy utilities
├── mask-layout.test.mjs    # 12 unit tests for mask pipeline
├── styles.css              # Visual theme (~155 lines)
│   ├── :root               #   CSS custom properties (holo-cyan, bg)
│   ├── @keyframes flicker  #   CRT flicker with staggered nth-child delays
│   ├── @keyframes scanline #   Not animated via CSS, used conceptually
│   ├── .app::after         #   Scanline overlay (repeating-linear-gradient)
│   ├── .copy-line          #   Positioned text with text-shadow glow + mix-blend-mode: screen
│   ├── .scrub-track/fill   #   Progress bar chrome
│   └── .status-chip        #   Status indicator
├── vite.config.js          # Vite config: base path + pretext alias
├── package.json            # Dependencies + scripts (dev, build, check, deploy)
├── public/
│   └── assets/
│       └── model.glb       # DamagedHelmet GLB (3.6MB, gitignored)
└── dist/                   # Production build output (gitignored)
    ├── index.html
    └── assets/
        ├── index-*.js      # Bundled Three.js + Pretext + app code (~585KB)
        ├── index-*.css     # Bundled styles
        └── model.glb       # Copied from public/
```

---

## Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| 3D Rendering | **Three.js 0.166.1** | WebGL scene, GLB model loading, lighting, mask offscreen rendering |
| Text Layout | **@chenglou/pretext 0.0.3** | Grapheme-level text measurement and line breaking with arbitrary slot widths |
| Build Tool | **Vite 5.4** | Dev server with HMR, production bundling, static asset handling |
| Deployment | **gh-pages 6.3** | Automated `dist/` → `gh-pages` branch push |
| Testing | **Node.js built-in test runner** | 12 unit tests for mask pipeline logic |
| Fonts | System monospace stack | Courier New, JetBrains Mono, Fira Code, Cascadia Code, Consolas |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- pnpm (recommended) or npm

### Install

```bash
cd pretext-3d
pnpm install
```

### Development

```bash
pnpm dev
# → http://127.0.0.1:4173/cyber-relic-scanner/
```

Note: the dev server redirects to `/cyber-relic-scanner/` because `base` is configured in `vite.config.js` for GitHub Pages compatibility.

### Check

```bash
pnpm check
# Runs: node --check on main.mjs + mask-layout.mjs
#       node --test mask-layout.test.mjs (12 unit tests)
```

### Build

```bash
pnpm build
# Output: dist/
```

### Deploy to GitHub Pages

```bash
pnpm deploy
# Runs: vite build → gh-pages -d dist
```

Make sure the git remote `origin` points to your GitHub repo and GitHub Pages is enabled for the `gh-pages` branch in repo settings.

---

## Development Journey

### Phase 1 — Foundation (clone → analysis → first run)
- Cloned `chenglou/pretext` and `feitangyuan/pretext-3d`
- Analyzed Pretext core: `layout.ts` (915 lines), `line-break.ts` (1267 lines), `measurement.ts` (291 lines)
- Installed dependencies via pnpm, resolved proxy and port conflicts
- Got the base template running with Vite dev server

### Phase 2 — Text Black Hole Collapse
- Added `getMouseBlackHoleInterval()` to `mask-layout.mjs`
- Integrated mouse black hole into the mask pipeline alongside model silhouette
- Text now repels from both the 3D model AND the mouse cursor
- Added mouse velocity tracking for future glitch effects

### Phase 3 — Matrix Hacker Theme
- Replaced all text with hacker/security tokens (`0xDEADBEEF`, `ACCESS_DENIED`, `KERNEL_PANIC`, etc.)
- Created 13-part procedural voxel bust (hoodie + mask figure)
- Dual-material rendering: `MeshStandardMaterial` solid + `EdgesGeometry`/`LineBasicMaterial` wireframe
- Green spotlight from below, dark ambient
- CSS `@keyframes flicker` with staggered nth-child delays

### Phase 4 — Mysterious Hacker Interaction Space
- Replaced camera orbiting with model-centric rotation (drag to spin model)
- Model Y-axis: 360° via horizontal drag; X-axis: ±28° via vertical drag
- Idle auto-rotation at 0.12 rad/s
- Velocity-enhanced glitch: `letter-spacing` jitter, `translate` offset, `opacity` fade, dynamic `text-shadow`
- `mix-blend-mode: screen` on text for authentic CRT look
- Scanline overlay via `::after` pseudo-element

### Phase 5 — Real GLB Model Integration
- Downloaded KhronosGroup **DamagedHelmet.glb** (CC BY 4.0) via jsDelivr CDN (raw GitHub was too slow)
- 3.6MB, sci-fi damaged flight helmet with PBR textures
- `normalizeModel()`: Box3-based centering, scale to 5.0 units, DoubleSide materials
- Added `addCyberWireframe()`: cyan edge geometry overlay on all mesh children
- Procedural voxel bust retained as error fallback
- Model size reduced: scale target 7.8 → 5.0, fallback model 0.55x scale

### Phase 6 — Cyber Relic: Data Extraction Terminal (current)
- **Color overhaul**: `#00FF41` green → `#00F0FF` holographic cyan
- **Background**: `#010301` → `#05050A` (deep navy-black)
- **Lighting**: Three-point setup — white key light (intensity 120) raking across helmet to expose scratch detail, cyan rim light (intensity 80) for cyber silhouette, subtle fill light to prevent dead black
- **Text content**: Flight recorder log tokens — `DATA_CORRUPTED`, `SECTOR_7G_OFFLINE`, `0xBADF00D`, `MEMORY_FRAGMENT_LOST`, `EJECT_SYSTEM_FAILED`, `RECOVERING_LOGS...`, etc. (30 unique tokens, 90 paragraphs of 3-9 random tokens each)
- **Kicker/Title**: `EMERGENCY LOG RECOVERY` / `DERELICT OMEGA-7`
- **Camera fix**: Camera now dynamically tracks model center via `fitState.target` each frame instead of hardcoded lookAt
- **Static assets**: `model.glb` moved to `public/assets/` for Vite production build compatibility

### Phase 7 — Deployment
- Configured `vite.config.js` with `base: '/cyber-relic-scanner/'`
- Installed `gh-pages` for automated deployment
- Added `predeploy` and `deploy` scripts to `package.json`
- Pushed to `gh-pages` branch on `Liu233jh/cyber-relic-scanner`
- Live at `https://liu233jh.github.io/cyber-relic-scanner/`

---

## Configuration Reference

### Key Constants in `main.mjs`

| Constant | Value | Description |
|----------|-------|-------------|
| `BODY_FONT_SIZE` | 13px | Base text size |
| `BODY_LINE_HEIGHT` | 16px | Text line height (band scan granularity) |
| `MIN_SLOT_WIDTH` | 80px | Minimum horizontal slot for text placement |
| `MASK_SIZE` | 1024×576 | Offscreen mask render resolution |
| `MASK_PADDING` | 10px | Padding added around mask intervals |
| `GLITCH_RADIUS` | 300px | Distance from cursor for glitch activation |
| `GLITCH_VELOCITY_SCALE` | 0.012 | Mouse velocity influence on glitch intensity |

### Lighting Setup

| Light | Type | Color | Intensity | Position |
|-------|------|-------|-----------|----------|
| Ambient | `AmbientLight` | `#0a1a2a` | 0.45 | — |
| Key (scratch detail) | `SpotLight` | `#ffffff` | 120 | (5, 1.5, 6) |
| Rim (cyber silhouette) | `SpotLight` | `#00F0FF` | 80 | (-4, 2.5, -3) |
| Fill (prevent dead black) | `PointLight` | `#003344` | 3 | (0, -2, 4) |

### Model Normalization

- Bounding box computed via `THREE.Box3().setFromObject()`
- Scale factor: `5.0 / maxDimension` (uniform scale to fit in ~5 world units)
- Origin centering: `root.position -= scaledCenter`
- All materials forced to `THREE.DoubleSide`
- Wireframe overlay: `EdgesGeometry` with threshold angle 22°, cyan `0x00F0FF` at opacity 0.25

---

## How To Swap The Model

1. Place your `.glb` file at `public/assets/model.glb`
2. The existing code auto-loads from `./assets/model.glb`
3. `normalizeModel()` handles Box3 centering and scaling
4. Tune these functions if the framing looks off:
   - `normalizeModel()` — scale factor (`5.0 / maxDim`)
   - `computeFitState()` — FOV-based distance calculation
   - `addCyberWireframe()` — edge threshold (22) and opacity (0.25)

The procedural voxel fallback in `createProceduralModel()` runs automatically if the GLB fails to load.

---

## License & Credits

- **DamagedHelmet model**: KhronosGroup glTF Sample Assets, CC BY 4.0
- **Pretext**: [@chenglou/pretext](https://github.com/chenglou/pretext)
- **Original pretext-3d template**: [feitangyuan/pretext-3d](https://github.com/feitangyuan/pretext-3d)
- **Three.js**: MIT License
- **This project**: Built from scratch as described in the Development Journey above
