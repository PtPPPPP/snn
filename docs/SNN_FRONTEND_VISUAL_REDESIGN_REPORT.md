# SNN FRONTEND VISUAL REDESIGN REPORT

日期：2026-09-08

最终方向：**浅色、冷白、蓝灰、产品优先**。以用户最后提出的“不要深色，还是浅色调好看”为准。

验收预览：[首页](http://127.0.0.1:5173/) · [SNN AI](http://127.0.0.1:5173/ai)

## 1. Baseline

初始审计版本为 `832433c`，开始时工作区干净。已经启动真实网站并检查首页、导航、About、Projects、Activities、Join、Footer、AI 空白状态及移动界面，保存 1440 / 390 的改前截图。

按用户中途要求，先同步到 GitHub `main` 的 `3c65a4b`（Markdown 与数学公式支持），再继续视觉重构。本地改动与这次远端更新没有重叠，同步未发生冲突。新依赖已安装，package.json 和 lockfile 与该提交一致。

视觉交付时，所有改动保留在 main 工作区，没有创建分支或 worktree，没有 commit、push 或部署。之后用户授权润色 README 并将这轮改动提交到本地 Git；该授权不包含推送或部署。

交付前发现远端又新增 `cc59704`（限制首页页脚样式作用范围）；该提交尚未合并，本轮验收基线仍是 `3c65a4b`。本次重构已经把首页页脚样式限定在首页模块内。

## 2. Visual problems found

- 全局样式和聊天样式存在多轮追加覆盖，字体、间距、响应式规则重复。
- 首页首屏以社团介绍和简化网络插画为主，SNN AI 缺少具体产品展示。
- About 和活动的同等权重卡片过多，项目没有明确的重点。
- 标题、正文、标签之间的字号差异缺少稳定规律，桌面与手机的阅读节奏不同。
- 聊天空白状态突出本地节点实现说明，侧栏状态区域挤占历史记录的位置。
- 手机上 Agent 状态标签可能换行，侧栏、工作区弹层的可见性与键盘焦点需要一起验证。
- 实验页和新增 Markdown 样式使用大量独立颜色，难以跟随全站视觉调整。

保留的品牌内容：SNN 原 Logo、Smart Neural Network 名称、蓝灰工程风格、AI / Robotics 方向、真实项目仓库、公众号二维码，以及全部火箭实验入口和计算功能。

## 3. References and principles used

查阅用户指定的官方页面，提炼原则而非复制页面：

- [Linear](https://linear.app/)：产品界面成为展示主体，细分隔线与明确的文字层级。
- [Vercel](https://vercel.com/)：共同的内容边界、栅格与稳定的响应式布局。
- [Raycast](https://www.raycast.com/)：工作空间感、输入框层级与内外圆角区分。
- [Framer](https://www.framer.com/)：简短 Hero 文案与编辑式版面。

最终没有采用最初要求中的深色配色，按照后续反馈改为浅色。没有加入视频背景、WebGL、粒子、霓虹效果或新的动画库。

## 4. Design system changes

新增 `app/design-tokens.css`，统一颜色、间距、圆角、字号、阴影和动效。原有 `--snn-*` 名称映射到同一套变量，供网站和 AI / 实验页继续使用。

| 层级 | 最终值 |
| --- | --- |
| 背景 | #f7f8fa |
| Surface 1 / 2 / 3 | #fcfcfd / #f0f2f5 / #e7ebf0 |
| 主文字 / 次文字 / 辅助文字 | #202630 / #505b6b / #606b7b |
| 强调色 / 选中背景 | #416582 / #e5edf4 |
| 圆角 | 6 / 10 / 16 / 24 px |
| 正文 / 辅助字号 | 16 / 12 px |
| 主标题 / 二级标题 | 响应式 Display 44–80 px；H2 30–46 px |
| 快速交互 / 面板 | 150 / 220 ms |

全局 CSS 回归基础样式和公共按钮；首页的排版集中在首页模块中。聊天的核心样式重新整理，移除重复的布局覆盖。三个文字层级在四种背景上的颜色对比度均经过自动检查，达到 4.5:1。

## 5. Homepage changes

- Hero 使用“Build intelligence. Make it real.”，配合短中文定位、一个主按钮和一个次按钮。
- 新增 SNN AI 界面展示，使用真实 ChatMessage 组件与同一套 composer 样式；明确标注“界面示例”，展示内容不是线上模型回复。
- 首页展示输入框可以进入真实 /ai 页面，非交互的示例条目不伪装成可操作按钮。
- About 改为左右分栏和逐行原则说明。
- 火箭回收成为 Featured Project，保留回收、推理、学习三个入口；示意图明确区别于真实实验计算。
- 三个现有开源项目保留原链接，呈现为层级较轻的项目列表。
- Activities 改为有节奏的横向条目，手机自然重排为纵向。
- Join 和 Footer 保留原公众号二维码、联系邮箱、项目链接和回到顶部。
- 全页使用连续的冷白空间与细分隔线，没有不同 section 之间突然切换视觉语言。

## 6. AI UI changes

- 桌面 240 px 侧栏，历史列表获得主要空间，服务状态移到侧栏底部。
- 空白页聚焦用户可以开展的思考、代码和实验任务；加入真实项目与实验链接。
- Assistant 回复保持无外框；用户消息使用轻微抬高的浅灰背景。
- Composer 使用 24 px 外圆角、10 px 内部按钮圆角、双层轻阴影、焦点描边。
- 保留深度思考、联网搜索、Agent、文件上传、预览、编辑、下载、历史、删除与取消行为。
- 添加对话和工作区加载骨架；保留离线、错误、停止、禁用等真实状态。
- 新同步的 Markdown 标题、列表、引用、代码块、表格和公式统一使用设计变量；长代码与宽公式在内容容器内部滚动。
- 修复侧栏可见性过渡干扰初始焦点的问题，并验证 Escape 关闭和焦点返回。
- 输入框下方增加轻微的内容遮罩，避免浮动输入框底部透出被截断的消息。

没有改动 AI API、流式协议、历史持久化、Agent 运行时或后端合约。

## 7. Responsive changes

实际运行以下宽度：**1440、1280、1024、768、430、390、360**，每个宽度检查全部五个公开页面。

手机单独调整标题对齐、展示区侧栏、项目布局、实验入口、导航菜单、页脚列数与输入框边距；不是只缩小字号。

补充运行已有 320、390、768、820、1024、1366 与横屏验证。确认输入框保留在视口内，长消息和多行输入不会造成页面横向溢出；最后一条消息有输入框上方的保留空间。

## 8. Motion changes

交互采用 150 ms 的背景、边框、颜色变化；侧栏使用 220 ms 位移；确认框使用小幅位移和透明度过渡。按压状态仅移动 1 px。

加载状态使用轻微透明度变化。全站支持 prefers-reduced-motion，首页不运行常驻动画。没有引入动画依赖，原实验的必要计算动画保留。

## 9. Files changed

公共设计与内容：

- app/design-tokens.css
- app/globals.css
- app/home.module.css
- app/_sections/Hero.tsx
- app/_sections/ProductPreview.tsx
- app/_sections/Nav.module.css
- app/_sections/AboutSection.tsx
- app/_sections/ProjectsSection.tsx
- app/_sections/ActivitiesSection.tsx
- app/_sections/JoinSection.tsx
- lib/site.ts
- lib/ai-copy.ts

AI 与 Markdown：

- app/ai/ai-chat.module.css
- app/ai/ai-chat.tsx
- app/_components/markdown-content.css

实验页颜色统一：

- app/play/rocket/rocket.module.css
- app/play/rocket/explain/lesson.module.css
- app/play/rocket/train/network.module.css
- app/play/rocket/train/studio.module.css
- app/play/rocket/train/update-playground.module.css

验收与文档：

- README.md（用户授权提交前补充整理）
- playwright.config.mjs
- tests/browser-smoke.spec.mjs
- tests/mobile-browser-smoke.spec.mjs
- tests/browser-agent-smoke.spec.mjs
- tests/visual-redesign.spec.mjs
- docs/SNN_FRONTEND_VISUAL_REDESIGN_REPORT.md

火箭物理、PPO 权重、训练逻辑、图表选择算法与运行时文件没有最终改动。

## 10. Visual validation

使用本机 Edge / Chromium 实际渲染并截图，检查对齐、字号、行距、长文本、导航、侧栏、输入框、重点项目与 Hero 到内容的过渡。最终图为浅色；目录中的 before / iteration / review 文件仅为过程记录。

主要截图：

- [1440 首页首屏](../.preview/visual-redesign/after-home-1440-top.png)
- [1440 首页全页](../.preview/visual-redesign/after-home-1440.png)
- [1440 AI](../.preview/visual-redesign/after-ai-1440.png)
- [390 首页首屏](../.preview/visual-redesign/after-home-390-top.png)
- [390 首页全页](../.preview/visual-redesign/after-home-390.png)
- [390 AI](../.preview/visual-redesign/after-ai-390.png)
- [390 侧栏](../.preview/visual-redesign/after-ai-390-sidebar.png)
- [1440 Markdown 与公式](../.preview/visual-redesign/after-ai-1440-markdown.png)
- [390 Markdown 与公式](../.preview/visual-redesign/after-ai-390-markdown.png)

截图与浏览器测试使用确定性的离线状态或 API 测试数据，没有伪装成真实模型在线验收。测试会检查页面错误、导航、滚动边界、焦点和渲染结果，不仅检查 build。

## 11. Build/test results

最终自检通过。测试合计 **331 通过、0 失败、58 跳过**；跳过项全部来自原有真实运行时环境前置条件，未将跳过算作通过。

已通过的检查：

| 检查 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| AI 状态、布局合约、Markdown | 36 | 0 | 0 |
| 火箭物理与训练计算 | 25 | 0 | 0 |
| AI Node | 183 | 0 | 52 |
| Gateway | 11 | 0 | 0 |
| 生产 HTML 与就绪规则 | 9 | 0 | 0 |
| 原有全站导航与响应式集成 | 2 | 0 | 0 |
| 完整 Playwright 浏览器回归 | 65 | 0 | 6 |

Lint、TypeScript、Windows 文档指定的 `npx vinext build` 和生产产物检查通过。没有以这些命令代称完整的 `npm test` 流程。

52 个 AI Node 检查因缺少相邻 DSH 构建 SDK / 夹具而由原测试跳过；真实运行时相关的浏览器测试同样有环境前置条件。

## 12. Remaining visual debt

- 真机 Safari、真实软键盘和真实模型服务未在本轮验证；浏览器中的设备尺寸模拟不等同于真机。
- 原有实验图的科学数据配色保留，部分图表内部小字号及历史 CSS 结构未作算法级重写。
- 仓库原有 playwright.prodcheck.config.mjs 仍有 1 条匿名默认导出 lint 警告，不影响 lint 退出结果。
- 视觉交付后，用户已授权整理 README 并提交本地版本；线上发布不属于本轮操作。

VISUAL_REDESIGN_COMPLETE=true
