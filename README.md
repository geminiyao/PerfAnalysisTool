# PerfAnalysisTool

性能分析工具 - 支持 CPU、Memory、Power、FPS 等性能数据的可视化分析。

基于 Electron + React + TypeScript + Ant Design + ECharts 构建。

## 环境要求

- Node.js >= 18
- npm >= 9

## 安装依赖

```bash
npm install
```

> 注意：项目依赖了本地 vendor 包 `@tencent-ai/agent-sdk`（位于 `./vendor/agent-sdk`），`npm install` 会自动链接。

## 开发模式启动

```bash
npm run dev
```

启动后会自动打开 Electron 窗口，支持热更新。

## 构建产物

### 仅编译（不打包安装程序）

```bash
npm run build
```

编译产物输出到 `out/` 目录。

### 打包为 Windows 安装程序

```bash
npm run build:win
```

产物输出到 `dist/` 目录，生成 NSIS 安装包（`.exe`）。

### 打包为 macOS 应用

```bash
npm run build:mac
```

### 打包为 Linux 应用

```bash
npm run build:linux
```

## 项目结构

```
src/
├── main/           # Electron 主进程
│   ├── index.ts    # 主进程入口，创建窗口
│   ├── ipc-handlers.ts  # IPC 通信处理
│   └── ai/        # AI 分析相关模块
├── preload/        # 预加载脚本（contextBridge）
└── renderer/       # 渲染进程（React 前端）
    ├── components/ # 通用组件
    ├── modules/    # 业务模块
    ├── services/   # 服务层
    ├── store/      # 状态管理（Zustand）
    ├── styles/     # 全局样式
    ├── types/      # TypeScript 类型定义
    ├── App.tsx     # 根组件
    └── main.tsx    # 渲染进程入口
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 28 + electron-vite |
| 前端 | React 18 + TypeScript |
| UI | Ant Design 5 + Less |
| 图表 | ECharts 5 |
| 状态管理 | Zustand 5 |
| 构建 | Vite 5 + electron-builder |

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式启动 |
| `npm run build` | 编译（不打包） |
| `npm run build:win` | 打包 Windows 安装程序 |
| `npm run preview` | 预览已编译产物 |
