# Cyber Relic Scanner — 赛博遗物：数据提取终端

> 一个实时 3D 文字排版引擎。受损飞行头盔的剪影会物理性地"推开"终端文字，整体风格设定为深空废弃飞船的数据提取终端。

**线上地址：** <https://liu233jh.github.io/cyber-relic-scanner/>

---

## 目录

- [这是什么](#这是什么)
- [从零开始的构建历程](#从零开始的构建历程)
- [核心架构](#核心架构)
- [渲染管线（逐帧详解）](#渲染管线逐帧详解)
- [项目文件结构](#项目文件结构)
- [技术栈](#技术栈)
- [本地运行](#本地运行)
- [部署到 GitHub Pages](#部署到-github-pages)
- [如何替换 3D 模型](#如何替换-3d-模型)
- [配置参数速查](#配置参数速查)
- [许可证与致谢](#许可证与致谢)

---

## 这是什么

这**不是**一个普通的 3D 装饰背景上叠了几行字。

3D 模型的可见剪影是一个**实时的空间约束**，它决定了文字能出现在屏幕的哪些位置。每一帧：

1. 将 3D 模型渲染到离屏遮罩（白色几何体 + 黑色背景）
2. 从 GPU 读回像素数据
3. 逐行扫描每个文字带的占用列
4. 将遮挡区间合并，从可用行宽中扣除
5. Pretext 排版引擎将文字重排到剩余的合法槽位中
6. DOM 文字节点实时更新位置

结果：文字**绕开 3D 物体流动**，随模型旋转和鼠标移动动态变化。

---

## 从零开始的构建历程

### 第 0 步：理解地基

这个项目始于对两个开源仓库的深入分析：

- **`chenglou/pretext`** — 一个高性能文字排版引擎（每次排版约 0.0002ms）。不同于 CSS 排版，Pretext 在字形（grapheme）级别工作，基于 Canvas 测量，支持可断行的自适应推进。核心 API：`prepareWithSegments()`、`layoutNextLine()`。

- **`feitangyuan/pretext-3d`** — 一个概念验证项目，将 Three.js 3D 渲染与 Pretext 文字排版集成。核心思路：把 3D 模型渲染到离屏遮罩 → 扫描遮罩中的占用像素 → 从剩余水平空间中切出合法的文字槽位 → 将槽位喂给 Pretext 逐行重排。文字真正地"绕开"3D 物体的剪影流动。

### 第 1 步：克隆、分析、跑起来

```bash
git clone https://github.com/chenglou/pretext.git
git clone https://github.com/feitangyuan/pretext-3d.git
cd pretext-3d && pnpm install
```

期间解决了代理冲突、端口占用、pnpm 内部兼容性等一系列环境问题，最终用 `npx vite` 成功启动了开发服务器。

### 第 2 步：文字黑洞 · 坍塌交互

第一个创新：扩展遮罩管线，让文字不仅避开 3D 模型，也避开**鼠标光标**。一个以光标为中心的圆形"黑洞"区域排斥文字，制造指针对排版施加引力般的错觉。

在 `mask-layout.mjs` 中新增了 `getMouseBlackHoleInterval()` 函数，计算鼠标圆圈与每个文字带的交集，返回的遮挡区间与模型剪影遮罩合并处理。

### 第 3 步：Matrix Hacker 视觉大改版

主题切换：黑底绿字的终端美学，CRT 扫描线，3D 线框几何体，故障（glitch）特效。

创建了一个 13 部件的程序化体素半身像作为后备模型——用 `BoxGeometry` + `EdgesGeometry` 线框叠加层拼出兜帽面具人像。

### 第 4 步：神秘黑客交互空间

- **模型自转交互**：用户拖拽旋转模型本身（而非相机环绕），Y 轴 360° 水平旋转，X 轴 ±28° 垂直倾斜，松手后自动慢转
- **聚光灯照明**：从下方打绿色 `SpotLight`，低环境光营造神秘感
- **速度驱动的故障效果**：`letter-spacing` 抖动、`translate` 偏移、`opacity` 淡出、动态 `text-shadow`，强度由鼠标距离 + 移动速度共同决定
- **CRT 闪烁动画**：CSS `@keyframes flicker` 配合 nth-child 错峰延迟
- **扫描线叠加**：`::after` 伪元素 + 重复线性渐变

### 第 5 步：真实 GLB 模型替换

用 **KhronosGroup DamagedHelmet**（科幻破损飞行头盔，CC BY 4.0 许可，3.6MB）替换了程序化体素模型。

- 通过 jsDelivr CDN 下载（GitHub Raw 在国内太慢，只有 3KB/s）
- `GLTFLoader` 异步加载，自动 Box3 包围盒归一化居中
- 新增 `addCyberWireframe()` 函数：在所有网格上叠加青色 `EdgesGeometry` 线框（阈值角 22°，透明度 0.25）
- 模型缩小：缩放目标从 7.8 单位降至 5.0 单位
- 后备体素模型保留，加载失败时自动切换
- 修复了相机居中 bug：`computeFitState` 计算的 `target` 和 `baseDistance` 之前从未被应用到相机

### 第 6 步：赛博遗物 · 数据提取终端（当前版本）

**视觉大换血：**

| 元素 | 旧（Matrix） | 新（Cyber Relic） |
|------|-------------|------------------|
| 背景色 | `#010301` 深绿黑 | `#05050A` 深海蓝黑 |
| 文字色 | `#00FF41` 终端绿 | `#00F0FF` 全息青 |
| 发光阴影 | 绿色 glow | 青色 bloom |
| 模型灯光 | 单点绿光 | 三点布光（白+青+补光） |

**文字内容彻底重写：** 受损飞行记录日志令牌——`DATA_CORRUPTED`、`SECTOR_7G_OFFLINE`、`0xBADF00D`、`MEMORY_FRAGMENT_LOST`、`EJECT_SYSTEM_FAILED`、`RECOVERING_LOGS...`、`LIFE_SUPPORT_CRITICAL`、`HULL_BREACH_DETECTED` 等 30 个独特令牌，生成 90 段随机组合文本。

**三点布光系统：**

| 灯光 | 类型 | 颜色 | 强度 | 位置 | 作用 |
|------|------|------|------|------|------|
| 环境光 | `AmbientLight` | `#0a1a2a` | 0.45 | — | 防止死黑 |
| 主光 | `SpotLight` | `#ffffff` | 120 | (5, 1.5, 6) | 从右侧扫过头盔，暴露划痕细节 |
| 轮廓光 | `SpotLight` | `#00F0FF` | 80 | (-4, 2.5, -3) | 左后方青色勾边，赛博轮廓 |
| 补光 | `PointLight` | `#003344` | 3 | (0, -2, 4) | 底部冷色补充 |

### 第 7 步：GitHub Pages 部署

- 配置 `vite.config.js`：`base: '/cyber-relic-scanner/'`
- 静态资源移至 `public/assets/`（Vite 打包时自动复制到 `dist/` 根目录）
- 安装 `gh-pages`，添加 `predeploy` 和 `deploy` 脚本
- 推送到 `Liu233jh/cyber-relic-scanner` 的 `gh-pages` 分支
- 线上地址：<https://liu233jh.github.io/cyber-relic-scanner/>

---

## 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                     用户输入                              │
│    拖拽旋转模型         移动鼠标推开文字                    │
└──────────────┬────────────────────┬──────────────────────┘
               │                    │
               ▼                    ▼
┌──────────────────────┐  ┌──────────────────────────┐
│   可见场景            │  │   遮罩场景                 │
│   Three.js WebGL     │  │   离屏 WebGL              │
│   · DamagedHelmet    │  │   · 相同几何体             │
│   · 三点布光          │  │   · 白色覆盖材质           │
│   · 青色线框叠加      │  │   · 黑色背景               │
│   → 屏幕输出          │  │   → 像素缓冲区             │
└──────────────────────┘  └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │   遮罩分析                 │
                          │   mask-layout.mjs         │
                          │   · getMaskIntervalForBand│
                          │   · mergeIntervals        │
                          │   · carveTextLineSlots    │
                          │   · chooseSlot            │
                          │   · 鼠标黑洞               │
                          └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │   文字排版                 │
                          │   @chenglou/pretext       │
                          │   · prepareWithSegments   │
                          │   · layoutNextLine        │
                          │   → 定位后的文字行         │
                          └──────────┬───────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────┐
                          │   DOM 协调                 │
                          │   main.mjs                │
                          │   · syncLinePool          │
                          │   · 更新节点位置           │
                          │   · applyGlitch（CSS）    │
                          │   → 渲染后的文字叠加层     │
                          └──────────────────────────┘
```

---

## 渲染管线（逐帧详解）

### 主循环 `tick()`

```
tick()
  │
  ├─ 更新模型旋转（空闲自转 或 拖拽驱动）
  ├─ 衰减鼠标速度
  ├─ 同步模型 + 遮罩旋转
  │
  ├─ renderScene()         → 可见 WebGL 帧渲染到屏幕
  ├─ renderMask()          → 离屏 WebGL → ImageData
  ├─ layoutCopy(mask)      → 槽位切割 → Pretext 重排 → DOM 更新
  └─ applyGlitch()         → 逐字符 CSS 变换
```

### 遮罩管线（`layoutCopy` → `layoutBlock` → `placeFlowLine`）

对于每个文字行带（y, y + LINE_HEIGHT）：

1. **`getMaskIntervalForBand()`** — 逐行扫描遮罩 ImageData 中的白色像素（阈值 ≥ 26）。将遮罩坐标映射回视口坐标，返回 `{ left, right }` 或 `null`。

2. **`getMouseBlackHoleInterval()`** — 计算以光标为中心、半径 200px 的圆与该行带的交集，返回 `{ left, right }` 或 `null`。

3. **`mergeIntervals()`** — 将模型遮罩 + 鼠标黑洞合并为一张去重排序后的水平遮挡区间列表。

4. **`carveTextLineSlots()`** — 从完整视口宽度中扣除所有遮挡区间。保留宽度 ≥ `MIN_SLOT_WIDTH`（80px）的槽位。

5. **`chooseSlot()`** — 选择最宽的可用槽位。宽度相同时按对齐偏好决定（左/右）。

6. **`layoutNextLine()`** — 调用 Pretext，用选中的槽位宽度排版一行可断行文字。

7. 将文字行定位到 DOM 中的 `(slot.left, band.y)`。

### 缓存键

```
`${viewportWidth}:${viewportHeight}:${modelRotationY}:${modelRotationX}:${mouseX}:${mouseY}`
```

仅在此键变化时重新排版——旋转精度保留 4 位小数。

---

## 项目文件结构

```
pretext-3d/
├── index.html              # 入口 HTML
├── main.mjs                # 核心应用（~700 行）
│   ├── initScene()         #   Three.js 初始化：渲染器、场景、灯光、相机
│   ├── loadModel()         #   GLTFLoader 加载 → normalizeModel → addCyberWireframe
│   ├── normalizeModel()    #   Box3 包围盒归一化居中，缩放到 5.0 单位
│   ├── addCyberWireframe() #   在所有网格上叠加青色 EdgesGeometry 线框
│   ├── computeFitState()   #   根据模型包围盒 + FOV 自动计算相机距离
│   ├── tick()              #   帧循环：旋转、相机、遮罩、排版、故障效果
│   ├── layoutCopy()        #   完整文字重排编排
│   ├── layoutBlock()       #   块级排版：标题行 + 正文段落
│   ├── placeFlowLine()     #   单行放置（含回退搜索）
│   ├── applyGlitch()       #   基于距离+速度的 CSS 逐字符抖动
│   ├── generateFlightLogText()  # 飞行日志文本生成器（30 个令牌，90 段）
│   └── createProceduralModel()  # 体素后备模型（13 个 BoxGeometry 部件）
├── mask-layout.mjs         # 槽位切割引擎（~140 行）
│   ├── getMaskIntervalForBand()    # 像素 → 视口区间扫描
│   ├── getMouseBlackHoleInterval() # 圆-线段交集计算
│   ├── mergeIntervals()            # 排序、裁剪、去重遮挡区间
│   ├── carveTextLineSlots()        # 从自由空间中扣除遮挡
│   ├── chooseSlot()                # 最宽槽位选择 + 对齐偏好
│   ├── splitParagraphs()           # 文本 → 段落数组
│   └── clamp() / lerp()            # 数学工具
├── mask-layout.test.mjs    # 12 个遮罩管线单元测试
├── styles.css              # 视觉主题（~155 行）
│   ├── :root               #   CSS 自定义属性（全息青、背景色）
│   ├── @keyframes flicker  #   CRT 闪烁动画，nth-child 错峰
│   ├── .app::after         #   扫描线叠加层
│   ├── .copy-line          #   定位文字 + text-shadow 发光 + mix-blend-mode: screen
│   ├── .scrub-track/fill   #   进度条装饰
│   └── .status-chip        #   状态指示器
├── vite.config.js          # Vite 配置：base 路径 + pretext 别名
├── package.json            # 依赖 + 脚本（dev, build, check, deploy）
├── public/
│   └── assets/
│       └── model.glb       # DamagedHelmet GLB 模型（3.6MB，gitignore 排除）
└── dist/                   # 生产构建输出（gitignore 排除）
```

---

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 3D 渲染 | **Three.js 0.166.1** | WebGL 场景、GLB 加载、三点布光、离屏遮罩渲染 |
| 文字排版 | **@chenglou/pretext 0.0.3** | 字形级文字测量与任意宽度槽位的断行 |
| 构建工具 | **Vite 5.4** | 开发服务器（HMR）、生产打包、静态资源处理 |
| 部署 | **gh-pages 6.3** | 自动将 `dist/` 推送到 `gh-pages` 分支 |
| 测试 | **Node.js 内置 test runner** | 12 个遮罩管线逻辑单元测试 |
| 字体 | 系统等宽字体栈 | Courier New, JetBrains Mono, Fira Code, Cascadia Code, Consolas |

---

## 本地运行

### 环境要求

- Node.js ≥ 18
- pnpm（推荐）或 npm

### 安装

```bash
cd pretext-3d
pnpm install
```

### 开发

```bash
pnpm dev
# 浏览器访问：http://127.0.0.1:4173/cyber-relic-scanner/
```

> 注意：开发服务器会自动重定向到 `/cyber-relic-scanner/`，因为 `vite.config.js` 中配置了 `base: '/cyber-relic-scanner/'`（GitHub Pages 兼容）。

### 语法检查 + 单元测试

```bash
pnpm check
# 依次执行：
#   node --check main.mjs        → 语法检查
#   node --check mask-layout.mjs → 语法检查
#   node --test mask-layout.test.mjs → 12 个单元测试
```

### 生产构建

```bash
pnpm build
# 输出到 dist/
```

---

## 部署到 GitHub Pages

### 首次部署

1. 在 GitHub 上创建仓库（例如 `Liu233jh/cyber-relic-scanner`）
2. 确保 `vite.config.js` 中 `base` 与仓库名一致：`'/cyber-relic-scanner/'`
3. 确保 `public/assets/model.glb` 存在
4. 关联远程仓库：

```bash
git remote set-url origin https://github.com/Liu233jh/cyber-relic-scanner.git
```

5. 运行部署：

```bash
pnpm deploy
# 等价于：vite build → gh-pages -d dist
```

6. 在 GitHub 仓库 **Settings → Pages** 中，确保 Source 选择 `gh-pages` 分支

### 后续更新

每次修改后只需运行：

```bash
pnpm deploy
```

---

## 如何替换 3D 模型

1. 将你的 `.glb` 文件放到 `public/assets/model.glb`
2. 代码中已配置从 `./assets/model.glb` 自动加载
3. `normalizeModel()` 会自动处理 Box3 居中和缩放
4. 如果画框效果不理想，调整以下函数：

| 函数 | 调整项 |
|------|--------|
| `normalizeModel()` | 缩放系数 `5.0 / maxDim` |
| `computeFitState()` | 基于 FOV 的距离计算 |
| `addCyberWireframe()` | 边缘阈值角 `22`、透明度 `0.25` |

如果 GLB 加载失败，`createProceduralModel()` 中的程序化体素后备模型会自动启用。

---

## 配置参数速查

### `main.mjs` 关键常量

| 常量 | 值 | 说明 |
|------|------|------|
| `BODY_FONT_SIZE` | 13px | 正文文字大小 |
| `BODY_LINE_HEIGHT` | 16px | 文字行高（行带扫描粒度） |
| `MIN_SLOT_WIDTH` | 80px | 文字放置的最小水平槽位宽度 |
| `MASK_SIZE` | 1024×576 | 离屏遮罩渲染分辨率 |
| `MASK_PADDING` | 10px | 遮罩区间额外内边距 |
| `GLITCH_RADIUS` | 300px | 故障效果激活距离（距光标） |
| `GLITCH_VELOCITY_SCALE` | 0.012 | 鼠标速度对故障强度的影响系数 |

### 三点布光参数

| 灯光 | 类型 | 颜色 | 强度 | 位置 |
|------|------|------|------|------|
| 环境光 | `AmbientLight` | `#0a1a2a` | 0.45 | — |
| 主光（划痕细节） | `SpotLight` | `#ffffff` | 120 | (5, 1.5, 6) |
| 轮廓光（赛博勾边） | `SpotLight` | `#00F0FF` | 80 | (-4, 2.5, -3) |
| 补光（防死黑） | `PointLight` | `#003344` | 3 | (0, -2, 4) |

### 模型归一化流程

1. `Box3().setFromObject(root)` — 计算世界空间包围盒
2. `scale = 5.0 / maxDimension` — 统一缩放到约 5 个世界单位
3. `root.position -= scaledCenter` — 平移使模型居中于原点
4. 所有材质强制 `THREE.DoubleSide`
5. `EdgesGeometry(geo, 22)` — 在几何体锐边上叠加青色线框（透明度 0.25）

---

## 许可证与致谢

- **DamagedHelmet 模型**：KhronosGroup glTF Sample Assets，CC BY 4.0
- **Pretext 排版引擎**：[@chenglou/pretext](https://github.com/chenglou/pretext)
- **原始 pretext-3d 模板**：[feitangyuan/pretext-3d](https://github.com/feitangyuan/pretext-3d)
- **Three.js**：MIT License
- **本项目**：如上述构建历程所述，从零迭代开发
