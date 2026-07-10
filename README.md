# SNN 社团网站

SNN（Smart Neural Network）学生科技社团的官方网站，面向人工智能、机器人与创客方向，集中展示社团定位、活动机制、共创项目和招募方式。

## 网站内容

- **社团介绍**：说明 SNN 面向新手、项目驱动和成果公开的理念
- **共创项目**：展示提示词工程、低空无人机和具身智能等项目方向
- **活动机制**：介绍技术小课、项目冲刺与开放交流
- **加入方式**：通过公众号二维码获取活动、项目和招募信息
- **响应式页面**：适配桌面端与移动端浏览

## 技术栈

- [Next.js](https://nextjs.org/) 16
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/) 5
- [Vinext](https://github.com/cloudflare/vinext) + [Vite](https://vite.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Drizzle ORM](https://orm.drizzle.team/)（可选 D1 数据库支持）

## 本地运行

### 环境要求

- Node.js `>= 22.13.0`
- npm

### Windows

```powershell
npm install
npx vite
```

启动后打开终端显示的本地地址，通常为 <http://localhost:5173>。

更详细的 Windows 操作说明见 [README-WINDOWS.md](./README-WINDOWS.md)。

### Linux

项目的完整脚本依赖 `bash`、`flock`、`curl` 和 GNU `timeout`：

```bash
npm run install:ci
npm run dev
```

## 常用命令

以下命令用于 Linux、WSL 或其他具备 Bash 工具链的环境：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 构建并验证部署产物 |
| `npm run start` | 启动已构建的网站 |
| `npm test` | 执行构建验证与页面元数据测试 |
| `npm run lint` | 检查代码规范 |
| `npm run validate:artifact` | 单独验证现有构建产物 |
| `npm run db:generate` | 根据数据库结构生成 Drizzle 迁移 |

> 原生 Windows 开发请使用前文的 `npx vite`。项目脚本包含 Linux shell 命令或环境变量语法，不能直接在原生 PowerShell 中完整运行。

## 项目结构

```text
.
├── app/                  # 页面、布局、样式与认证辅助代码
├── public/               # Logo、机械臂图片、公众号二维码等静态资源
├── db/                   # Cloudflare D1 与 Drizzle 数据库配置
├── drizzle/              # 数据库迁移文件
├── examples/d1/          # D1 数据库示例
├── scripts/              # 安装、构建与产物验证脚本
├── tests/                # 自动化测试
├── worker/               # Cloudflare Worker 入口
└── vite.config.ts        # Vinext、Vite 与本地绑定配置
```

网站主要内容位于 [`app/page.tsx`](./app/page.tsx)，全局样式位于 [`app/globals.css`](./app/globals.css)，图片资源位于 [`public/`](./public/)。

## 部署说明

项目使用 Vinext 构建，可部署到 Cloudflare Workers。远程构建环境应运行：

```bash
npm run build
```

`.openai/hosting.json` 预留了可选的 D1 与 R2 配置项；配置绑定后，`vite.config.ts` 会在本地开发时模拟对应资源。当前配置未启用 D1 或 R2，网站的静态展示功能无需这些资源。

## 相关项目

- [Intent2Prompt](https://github.com/PtPPPPP/intent2prompt)
- [低空无人机哨兵](https://github.com/PtPPPPP/low-altitude-drone-sentinel)
- [具身智能训练平台](https://github.com/PtPPPPP/embodied-training-platform)

## License

本项目暂未声明开源许可证。
