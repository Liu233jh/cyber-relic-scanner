# 本地启动指南

## 前提

- 已安装 **Node.js**（版本 ≥ 18）
- 已安装 **pnpm**：`npm install -g pnpm`

## 首次安装

打开终端（CMD / PowerShell / Git Bash），进入项目目录：

```bash
cd D:\pretext-test\pretext-3d
pnpm install
```

## 启动开发服务器

```bash
pnpm dev
```

启动后会显示：

```
VITE v5.4.21  ready in xxx ms
➜  Local:   http://127.0.0.1:4173/cyber-relic-scanner/
```

在浏览器打开 `http://127.0.0.1:4173/cyber-relic-scanner/` 即可看到效果。

> 为什么地址多了一层 `/cyber-relic-scanner/`？因为 `vite.config.js` 中配置了 `base: '/cyber-relic-scanner/'`，这是为了和 GitHub Pages 线上地址保持一致。直接访问 `http://127.0.0.1:4173/` 会自动重定向。

## 停止服务器

在终端按 `Ctrl + C`。

## 启动了就正常，没什么需要特别注意的
