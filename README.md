# SNN 社团网站

SNN（Smart Neural Network）学生科技社团的官方网站，面向人工智能、机器人与创客方向，集中展示社团定位、活动机制、共创项目和招募方式。

## 网站内容

- **社团介绍**：说明 SNN 面向新手、项目驱动和成果公开的理念
- **共创项目**：展示提示词工程、低空无人机和具身智能等项目方向
- **活动机制**：介绍技术小课、项目冲刺与开放交流
- **加入方式**：通过公众号二维码获取活动、项目和招募信息
- **响应式页面**：适配桌面端与移动端浏览，含暗色模式（`prefers-color-scheme`）

## 技术栈

- [Next.js](https://nextjs.org/) 16
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/) 5
- [Vinext](https://github.com/cloudflare/vinext) + [Vite](https://vite.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/)

## 本地运行

### 环境要求

- Node.js `>= 22.13.0`
- npm
- `bash`（脚本依赖 shell 工具，Windows 请用 Git Bash 或 WSL）

### 启动开发服务器

```bash
npm install
npm run dev
```

启动后打开终端显示的本地地址，通常为 <http://localhost:5173>。

### 构建

```bash
npm run build
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 构建并验证部署产物 |
| `npm run start` | 启动已构建的网站 |
| `npm test` | 执行构建验证与页面元数据测试 |
| `npm run lint` | 检查代码规范 |
| `npm run export:static` | 生成静态站点到 `ftp-upload/`（用于 FTP 部署） |
| `npm run build:ftp` | `export:static` 的别名 |

## 项目结构

```text
.
├── app/                      # 页面入口与样式
│   ├── _sections/            # 首页各区块子组件（Hero/About/Projects/…）
│   │   ├── icons.tsx         #   内联 SVG 图标（箭头等）
│   │   └── data.ts           #   项目/活动数据源
│   ├── ai/                   # SNN AI 聊天页
│   ├── page.tsx              # 首页（仅拼装各区块）
│   ├── layout.tsx            # 根布局 + metadata（含 OG/Twitter）
│   └── globals.css           # 全局样式 + 设计变量 + 暗色模式
├── public/assets/            # Logo、机械臂图片、公众号二维码、OG 图等静态资源
├── lib/                      # 共享 TS 模块（AI 客户端等）
├── build/                    # Vite 构建插件
├── worker/                   # Cloudflare Worker 入口
├── scripts/                  # 安装、构建、静态导出与产物验证脚本
├── ai-node/                  # SNN AI 本地推理节点（独立 Node 服务）
├── cloudflare-ai-gateway/    # Cloudflare AI 网关（独立 Worker）
├── docs/                     # 文档
├── tests/                    # 自动化测试
└── vite.config.ts            # Vinext、Vite 与本地绑定配置
```

## 设计约定

- **颜色体系**：`app/globals.css` 的 `:root` 定义了设计变量。色阶用 `--ink-100`（标题）、`--ink-60`（正文）、`--ink-30`（分隔线）；`--lime` 是品牌高亮色，其上的文字始终用 `--on-lime`（固定深色，不随暗色反转）。
- **暗色模式**：通过 `@media (prefers-color-scheme: dark)` 覆盖变量实现，无需额外主题切换逻辑。
- **图标**：统一使用 `app/_sections/icons.tsx` 里的内联 SVG 组件（`currentColor` 描边），不要直接写 emoji 字符。
- **组件拆分**：首页按区块拆在 `app/_sections/`，新增区块请在 `page.tsx` 拼装，不要把逻辑堆回单文件。

## 静态导出与 FTP 部署

```bash
npm run export:static
```

该命令会把首页 SSR 渲染为静态 HTML，连同 `public/assets`、SNN AI 页面一起输出到 `ftp-upload/` 目录，可直接通过 FTP 上传到虚拟主机/静态服务器。

> 注意：`ftp-upload/ai-config.js` 中的 AI 接口地址默认指向占位路径，使用 AI 聊天功能前需更新为实际的推理服务地址。

## 部署说明

项目使用 Vinext 构建，可部署到 Cloudflare Workers。远程构建环境应运行：

```bash
npm run build
```

`.openai/hosting.json` 预留了可选的 D1 与 R2 配置项；配置绑定后，`vite.config.ts` 会在本地开发时模拟对应资源。当前配置未启用 D1 或 R2，网站的展示功能无需这些资源。

## 相关项目

- [Intent2Prompt](https://github.com/PtPPPPP/intent2prompt)
- [低空无人机哨兵](https://github.com/PtPPPPP/low-altitude-drone-sentinel)
- [具身智能训练平台](https://github.com/PtPPPPP/embodied-training-platform)

## License

本项目暂未声明开源许可证。
