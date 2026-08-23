# SNN · Smart Neural Network

> **学生科技社团官方网站** — 聚焦人工智能、机器人与智能系统，以真实项目驱动学习与协作。

SNN 是一支面向 AI / 机器人 / 创客方向的学生技术社团。本站集中呈现社团定位、活动机制、共创项目与招募方式，并集成 **SNN AI** 在线工作台。

## 预览

- **品牌定位**：面向新手开放、项目驱动、成果可见
- **共创项目**：Intent2Prompt · 低空无人机哨兵 · 具身智能训练平台
- **活动机制**：技术小课（20 min）· 项目冲刺（2–4 周）· 开放交流
- **加入我们**：扫码关注公众号，获取活动预告与招募信息
- **全响应式**：桌面 1440 / 1024 与移动 390 / 320 均适配

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 框架 | [Next.js 16](https://nextjs.org/) · [React 19](https://react.dev/) · [TypeScript 5](https://www.typescriptlang.org/) |
| 构建 | [Vinext](https://github.com/cloudflare/vinext) + [Vite](https://vite.dev/) |
| 运行时 | [Cloudflare Workers](https://workers.cloudflare.com/) |
| 样式 | 原生 CSS + Design Tokens（见 `app/globals.css`） |

## 快速开始

### 环境要求

- **Node.js** `>= 22.13.0`
- **npm** `>= 10`
- **bash** — 脚本依赖 shell（Windows 请使用 Git Bash / WSL）

### 安装与启动

```bash
npm install          # 安装依赖
npm run dev          # 本地开发，打开终端提示的地址（通常 http://localhost:5173）
```

### 构建与验收

```bash
npm run build        # 仅生成生产构建
npm run verify       # 完整验收：lint + AI 单测 + 构建 + 产物校验 + 页面渲染测试
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发服务器（Vite + Vinext） |
| `npm run build` | React / Vinext 生产构建（Cloudflare Workers） |
| `npm run build:production` | 与 `build` 相同的明确生产 React 构建 |
| `npm run deploy:production` | 部署已验证的 Vinext Worker + React 客户端产物到 Cloudflare Workers |
| `npm run start` | 预览已构建产物 |
| `npm run verify` | 一键验收：`lint` → `AI 单测` → `build` → `产物校验` → `渲染测试` |
| `npm test` | `verify` 别名 |
| `npm run lint` | ESLint 校验 |
| `npm run test:artifact` | 校验 Worker 产物完整性 |
| `npm run test:production-artifact` | 校验生产目标是 Worker + React（并阻断遗留静态模板混入） |
| `npm run test:rendered-html` | 校验构建后页面可渲染性 |
| `npm run gen:og` | 重新生成 `og.png`（需 Python + Pillow） |

## 项目结构

```text
.
├── app/                      # 路由与样式
│   ├── _sections/            # 首页区块（Hero / About / Projects / Activities / Join）
│   │   ├── icons.tsx         # 内联 SVG 图标（currentColor）
│   │   └── data.ts           # 项目 / 活动数据源
│   ├── ai/                   # SNN AI 聊天页
│   ├── page.tsx              # 首页拼装
│   ├── layout.tsx            # 根布局 + SEO/OG/Twitter
│   └── globals.css           # 全局样式与 Design Tokens
├── public/assets/            # Logo、二维码、OG 图等静态资源
├── lib/                      # 共享模块（AI 客户端等）
├── worker/                   # Cloudflare Worker 入口
├── ai-node/                  # 本地推理节点（独立服务）
├── cloudflare-ai-gateway/    # AI 网关（独立 Worker，当前不在生产链路中）
├── scripts/                  # 构建 / 导出 / 校验脚本
├── tests/                    # 自动化测试
└── vite.config.ts            # Vinext + Vite 配置
```

## 设计约定

- **色彩**：`app/globals.css :root` 为单一事实源。`--ink-100`（标题）/ `--ink-60`（正文）/ `--ink-30`（分隔线）；`--lime` 为品牌高亮，其上文字固定用 `--on-lime` 深色。
- **图标**：统一使用 `app/_sections/icons.tsx` 内联 SVG（`currentColor` 描边），禁止直接使用 emoji。
- **分层**：首页按区块拆分于 `app/_sections/`，在 `app/page.tsx` 拼装；新增区块遵循此约定，避免单文件膨胀。

## 部署（Cloudflare Workers Builds）

生产运行时为 Cloudflare Worker（SSR），静态资源由同 Worker 的 Assets 承载：

```text
Runtime: dist/server/index.js
Assets:  dist/client/
```

**Git 集成（Workers Builds）**
```text
Build command:   npm run build
Deploy command:  npx wrangler deploy --config dist/server/wrangler.json
```

**CLI 手动部署**
```bash
npm run deploy:production
# 等价于: build → production-artifact 校验 → wrangler deploy --config dist/server/wrangler.json
```

构建环境变量：
- `NEXT_PUBLIC_SITE_URL=https://snnai.cn` — OG/favicon 绝对地址所需
- `AI_GATEWAY_URL` — 可选；若设置，构建命令需将其写入 `public/ai-config.js`（见该文件头注释）

`.openai/hosting.json` 已预留可选 D1 / R2 绑定，`vite.config.ts` 会在本地模拟；当前展示功能无需启用。

OG 图：`scripts/gen-og.py`（依赖 Python + Pillow），修改品牌后执行 `npm run gen:og` 重新生成 `public/assets/og.png`。

## 相关项目

- [Intent2Prompt](https://github.com/PtPPPPP/intent2prompt)
- [低空无人机哨兵](https://github.com/PtPPPPP/low-altitude-drone-sentinel)
- [具身智能训练平台](https://github.com/PtPPPPP/embodied-training-platform)

## License

[MIT](./LICENSE) © 2026 SNN · Smart Neural Network
