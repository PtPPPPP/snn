# SNN · Smart Neural Network

**Build intelligence. Make it real.**

学生共建的 AI 实验室与技术社区。我们围绕人工智能、智能体与机器人，把一个问题变成可运行、可解释、可继续迭代的系统。

这个仓库包含 SNN 网站、AI 工作台、火箭回收交互实验，以及配套的 AI Node 和网关服务。

[网站](https://snnai.cn/) · [SNN AI](https://snnai.cn/ai) · [火箭实验](https://snnai.cn/play/rocket)

## 在这里探索什么

| 页面 | 路径 | 内容 |
| --- | --- | --- |
| 首页 | `/` | 实验室介绍、产品展示、开源项目、社区活动与加入方式 |
| SNN AI | `/ai` | 对话、深度思考、联网搜索及 Agent 文件工作区，按服务能力开放 |
| 回收挑战 | `/play/rocket` | 控制连续油门，与 Energy PPO 策略一起完成火箭回收 |
| 怎样推理 | `/play/rocket/explain` | 查看输入、神经元计算和油门输出，支持回放与对象选择 |
| 怎样学习 | `/play/rocket/train` | 探索真实 PPO 训练记录、权重变化，以及可交互的简化教学实验 |

### SNN AI

- 支持流式回答、停止生成、历史记录、会话恢复与删除。
- 使用 Markdown 和 KaTeX 展示列表、代码块、表格与数学公式。
- 提供深度思考、联网搜索及 Agent 模式；界面按后端返回的能力状态启用功能。
- Agent 工作区支持上传、预览、下载，以及受限的文件编辑。
- 桌面侧栏与移动抽屉共享同一套交互，长内容在自身容器内滚动。

首页产品预览标注为“界面示例”，不是实时模型回复。启动网站不代表模型服务已经连接，服务状态以实际接口返回为准。

### 火箭学习实验室

从亲手控制火箭开始，再逐步观察网络如何做决策、如何根据反馈调整权重。

回收挑战与推理页在浏览器中运行公开的 PPO 权重和物理计算；训练页展示从初始化开始记录的 PPO 训练过程。页面中的 `y = x²` 小实验用于解释前向计算、误差与权重更新，不等同于真实 PPO 训练算法，也不代表模型已经学会稳定着陆。

模型来源、记录格式和复现说明见 [PPO 训练记录](docs/PPO-TRAINING-RECORD.md)。

### 开源项目与社区

- [Intent2Prompt](https://github.com/PtPPPPP/intent2prompt)：把模糊想法整理成结构化提示词。
- [低空无人机哨兵](https://github.com/PtPPPPP/low-altitude-drone-sentinel)：探索低空感知与安全监测。
- [具身智能训练平台](https://github.com/PtPPPPP/embodied-training-platform)：面向机器人学习与仿真训练。

社区通过技术小课、项目冲刺和开放交流推进实践。加入方式与公众号二维码保留在首页。

## 技术栈

| 部分 | 实现 |
| --- | --- |
| 页面与组件 | Next.js 16 路由约定、React 19、TypeScript |
| 构建 | Vinext + Vite |
| 网站运行时 | Cloudflare Workers + Assets |
| 样式 | CSS Modules、原生 CSS、统一 Design Tokens |
| 内容渲染 | react-markdown、remark-gfm、remark-math、KaTeX |
| 验证 | ESLint、TypeScript、Node.js Test Runner、Playwright |

具体版本以 [package.json](package.json) 和 [package-lock.json](package-lock.json) 为准。

## 本地运行

### 环境要求

- 推荐使用 **Node.js 24.16.0**，与 [.nvmrc](.nvmrc) 一致。
- 仓库声明的兼容版本为 Node.js `>=22.19.0`；固定版本的 DSH 不支持 Node.js 22.13.x。
- 使用 Node.js 配套的 npm，通过 lockfile 安装依赖。
- `npm run dev`、`npm run build` 和 `npm run verify` 含 shell 脚本；完整流程需要 Bash 与 GNU `timeout`。原生 PowerShell 可使用下面的 Windows 命令。

### Windows / PowerShell

在仓库目录执行：

```powershell
npm.cmd ci
powershell -ExecutionPolicy Bypass -File .\scripts\Start-Local.ps1
```

打开 [本地首页](http://127.0.0.1:5173/)。启动脚本固定使用 `127.0.0.1:5173`；保持终端运行，按 Ctrl+C 停止。

### Bash 环境

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

### AI 服务配置

网站前端和 AI 服务独立启动。仅查看首页、运行火箭计算或调整 UI，不需要配置真实模型。

浏览器当前通过 [public/ai-config.js](public/ai-config.js) 中的公开入口访问 SNN API：

- 对话：`https://api.snnai.cn/api/ai`
- Agent：`https://api.snnai.cn/api/agent`

连接其他开发环境时，修改公开 API 配置并重启预览；不要把内部模型地址、访问凭据或服务密钥写入浏览器配置。服务部署与主机设置见 [AI 主机配置](docs/ai-host-setup.md)。

### Agent 文件能力边界

| 类型 | 已实现能力 |
| --- | --- |
| 文本与代码 | 读取、编辑、创建和下载；前端工作区支持直接文本编辑 |
| PDF / DOCX | 上传、读取、提取；不修改原文档 |
| XLSX | 结构化检查；通过受限工具删除一条精确匹配的数据行，使用读取时的版本校验 |
| XLS / XLSM、加密或外部链接工作簿 | 不支持相应的 XLSX 编辑流程 |

XLSX 修改需要先通过 `workspace.spreadsheet.inspect` 得到唯一匹配和版本，再调用 `workspace.spreadsheet.patch`；它不是通用电子表格编辑器。具体能力仍受服务配置和工具权限约束。

SNN 负责产品界面与 API 边界，DeepSeek Harness 提供底层 Agent 运行时。前端不直接连接内部运行时，公开 Agent 不提供任意 Shell 执行能力。

## 构建与验证

### Windows 前端验证

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run test:ai-state
node --test tests/markdown-content.test.mjs
npx.cmd vinext build
npm.cmd run test:production-artifact
npm.cmd run test:rendered-html
npx.cmd playwright test --workers=3
```

Playwright 配置会在 Windows 优先寻找本机 Edge / Chrome。其他环境若缺少浏览器，可先执行 `npx playwright install chromium`。标准浏览器测试使用构建产物，自动启动 `127.0.0.1:3000` 测试服务器，因此需要先完成构建。

独立的全站交互测试需要先启动 5173 开发服务器：

```powershell
node --test tests/site-navigation.test.mjs tests/site-responsive.test.mjs
```

### 完整验证流程

在满足 shell 要求的环境中：

```bash
npm run verify
# npm test 是同一流程的别名
```

该流程包含 lint、AI 状态测试、AI Node / Gateway 测试、构建、产物与页面渲染检查。Playwright 浏览器测试需另行运行。

| 命令 | 用途 |
| --- | --- |
| `npm run test:ai-node` | AI Node 与 Agent 服务测试 |
| `npm run test:ai-gateway` | 网关、访问边界与流式转发测试 |
| `npm run test:browser-smoke` | Playwright 浏览器回归 |
| `npm run test:mobile-smoke` | 移动端回归 |
| `npm run test:workspace-edit-real-model` | 显式配置真实模型后的文件能力验证 |
| `npm run build` | 通过 shell 包装脚本生成生产构建 |
| `npm run test:production-artifact` | 检查 Worker 与 React 客户端产物 |
| `npm run gen:og` | 重新生成分享图，需要 Python 与 Pillow |

真实 Agent 测试需要固定版本的 DSH 构建产物；真实模型验证还需要单独配置模型服务。缺少前置条件时的 **skip 不等于通过**，模拟 API 的浏览器测试也不代表线上服务可用。CI 的 DSH 版本和启动方式以 [.github/workflows/ci.yml](.github/workflows/ci.yml) 为准。

## 设计约定

网站使用统一的**冷白、蓝灰浅色系统**，以排版、留白和真实产品展示建立层级。

- [app/design-tokens.css](app/design-tokens.css)：颜色、字号、间距、圆角、阴影与动效的统一来源；旧 `--snn-*` 变量映射到同一套值。
- [app/globals.css](app/globals.css)：基础样式和公共控件；首页专属规则放在首页模块，避免影响实验全屏布局。
- [app/home.module.css](app/home.module.css)：首页排版与响应式规则。
- [app/ai/ai-chat.module.css](app/ai/ai-chat.module.css)：聊天、输入框、侧栏与工作区样式。
- 首页示例使用真实消息组件；演示内容应明确标注，不伪造服务状态或尚未实现的能力。
- 交互支持键盘焦点和 `prefers-reduced-motion`；新增 UI 需检查手机与桌面，避免通过隐藏整页溢出掩盖布局问题。

本轮视觉验收覆盖 1440、1280、1024、768、430、390、360 七种宽度，详情见 [前端视觉重构报告](docs/SNN_FRONTEND_VISUAL_REDESIGN_REPORT.md)。报告中的截图由本地测试生成，保存在被 Git 忽略的 `.preview/` 目录，不随仓库分发。

## 项目结构

```text
app/
├── _components/          # Markdown 等共享组件
├── _sections/            # 首页区块、产品展示、导航与内容数据
├── ai/                   # 对话、Agent 与文件工作区
├── play/rocket/          # 回收挑战、推理和学习实验
├── design-tokens.css     # 全站设计变量
├── globals.css           # 基础样式与公共控件
├── home.module.css       # 首页布局
├── layout.tsx            # 共享导航、资源与页面元数据
└── page.tsx              # 首页入口
lib/                      # SNN API 客户端、持久化和火箭计算
public/
├── assets/               # Logo、二维码与分享图
├── fonts/                # 自托管字体
└── rocket/               # 模型权重与训练记录
ai-node/                  # 独立 AI 服务与 Harness 适配
cloudflare-ai-gateway/    # 独立网关实现
worker/                   # 网站 Worker 入口
shared/                   # 跨层共享内容
scripts/                  # 启动、构建、校验与数据处理
tests/                    # 单元、集成与浏览器测试
docs/                     # 部署、实验与设计记录
```

迁移机器前请阅读 [MIGRATION.md](MIGRATION.md)；历史交接文档中的实现状态需以当前源码为准。

## 部署

生产构建输出为：

```text
Worker: dist/server/index.js
Assets: dist/client/
Config: dist/server/wrangler.json
```

在已配置权限与生产环境的 shell 中执行：

```bash
npm run deploy:production
```

该命令依次完成构建、生产产物检查和 Cloudflare Workers 部署。配置、凭据和发布检查见 [生产检查清单](docs/production-checklist.md)。

- `NEXT_PUBLIC_SITE_URL` 用于生成站点分享元数据中的绝对地址。
- 浏览器 API 入口以 `public/ai-config.js` 为准；仅设置环境变量不会自动改写该文件。
- `.openai/hosting.json` 和 `vite.config.ts` 定义可选绑定与构建配置。
- 网站、AI Node 和网关是不同部署单元；网站构建成功不代表模型或 Agent 服务已就绪。
- 密钥和私有配置放在部署环境中，不提交到仓库。

## License

项目代码使用 [MIT License](LICENSE)。第三方字体与火箭资源另保留各自的许可说明，见 [public/fonts](public/fonts/) 和 [public/rocket/LICENSE.txt](public/rocket/LICENSE.txt)。

© 2026 SNN · Smart Neural Network
