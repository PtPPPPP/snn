# SNN 求职准备：AI 应用 / Agent 开发与测试开发

整理日期：2026-10-16。依据本地源码、依赖、测试和项目报告；没有验证当前线上服务、远端 PR 或 CI 状态。岗位准备以 AI 应用 / Agent 开发、测试开发为主。

## 1. 项目定位

SNN 是学生科技社区网站，包含 AI 对话与 Agent 文件工作台、交互式 AI 教学、招新笔试与阅卷等模块。求职时以一个核心模块展开，其他模块作为补充，避免把整站功能堆进一段经历。

- AI 应用 / Agent 开发：突出产品 API、开源运行时集成、工具权限、文件工作流、流式状态管理。
- 测试开发：突出跨层测试设计、确定性 Mock、真实运行时集成、模型验收、异常与安全边界。
- 个人贡献按实际经历调整。源码只能证明项目存在这些实现，不能证明全部由某个人独立设计完成。AI 辅助开发的部分，应能说明自己做了哪些需求判断、方案选择、代码审查与验证。

## 2. 实际技术栈

| 层次 | 已见到的技术 | 在项目中的用途 | 面试准备重点 |
| --- | --- | --- | --- |
| 前端语言 | TypeScript、JavaScript | React 页面、API 客户端和状态逻辑；AI Node 多为 `.mjs` JavaScript ES Modules | 类型与运行时校验的区别，Promise、异步取消、模块化 |
| 页面框架 | React 19、Next.js 16 路由约定 | 页面组织、客户端组件、交互状态 | Hooks、Effect 清理、竞态、SSR / hydration |
| 构建与适配 | Vinext、Vite、Cloudflare Vite Plugin | 将使用 Next.js 路由约定的应用构建为 Worker 和客户端资源 | 实际构建链与运行位置；不要讲成标准 `next build` / Vercel 部署 |
| 样式 | CSS Modules、CSS 自定义属性、Design Tokens；Tailwind CSS 4 也已接入 | 局部样式、全站设计变量、响应式布局 | Flex / Grid 的 `min-width: 0`，长内容溢出、移动端 |
| 内容渲染 | react-markdown、remark-gfm、remark-math、rehype-katex、KaTeX | Markdown、表格、代码和数学公式 | 流式内容渲染、布局边界；不要把 Markdown 渲染等同于文档解析 |
| 前端存储 | IndexedDB、localStorage | 对话记录、活动会话标识与偏好 | 异步写入顺序、删除与保存竞态；本地历史不等于云端同步 |
| 应用后端 | Node.js、原生 HTTP、ES Modules | AI Node、请求校验、上游模型适配、文件服务 | 事件循环、流、AbortSignal、超时、资源清理；没有依据写成 Express / NestJS |
| AI 接口 | OpenAI-compatible HTTP API | 调用 `/v1/models`、`/v1/chat/completions` 等接口 | 模型参数、流式 chunk、工具调用、结束原因；兼容协议不代表一定使用 OpenAI 模型 |
| Agent 运行时 | DeepSeek Harness、官方 SDK、独立子进程、stdio JSON-RPC | 复用运行循环和底层执行，通过 SNN 适配层映射会话、工具与事件 | 运行时复用、边界隔离、生命周期；不是自研整个 Agent Loop |
| 实时通信 | SSE、Fetch、ReadableStream、TextDecoder、AbortController | 增量回答、工具活动、终态、取消与心跳 | TCP chunk 与 SSE frame 不对齐、UTF-8 拆包、终态去重、注释心跳 |
| 文件处理 | 受限 PDF / DOCX 解析、ZIP / XML、`@office-kit/xlsx`、SHA-256 | 文档提取、XLSX 定向修改、完整性与版本校验、分块上传 | 文件格式边界、乐观并发、写后验证；PDF 暂无 OCR |
| 部署 | Cloudflare Workers、Assets、Wrangler；AI 主机通过 Tunnel 接入 | 网站边缘运行、静态资源、AI Origin 连接 | 网站 Worker 与 AI Node 是两个部署单元，边缘层不运行大模型 |
| 认证与数据 | Cloudflare D1 / SQLite、Drizzle schema / migrations、Cloudflare Access、jose / JWT / JWKS | 招新笔试与阅卷模块 | API 当前主要使用 D1 参数化 SQL；不要称所有查询都由 ORM 完成 |
| 交互可视化 | Three.js、React Three Fiber、Drei、Canvas / SVG | 神经网络教学、三维交互、火箭计算展示 | 浏览器性能、动画调度、按需加载、WebGL 回退；不是 Agent 核心依赖 |
| 测试与工程 | Node.js Test Runner、assert、Playwright、ESLint、TypeScript、GitHub Actions | 单元 / 集成 / 浏览器回归、静态检查和 CI | 测试分层、夹具、可复现环境、skip 与 pass 的区别 |

具体依赖版本以 `package.json`、lockfile 为准。仓库推荐 Node.js 24.16.0，声明兼容 >=22.19.0；本次定向测试实际使用内置 Node.js 24.19.0。

R2 存在可选绑定配置，本次未确认实际业务使用，不列作核心经验。Python / PyTorch / Stable-Baselines3 在训练记录中出现，属于另一个教学与离线实验话题，不能据此称 AI Node 是 Python 后端，也不能把上游模型说成自己从零研发。

## 3. 截图中需要调整的表述

| 原表述 | 建议 | 原因 |
| --- | --- | --- |
| Node.js / React | 分写为前端 React / TypeScript；后端 Node.js / JavaScript | 前后端职责和语言不同 |
| 独立网关部署于 Workers，已上线运行 | 写网站部署方案和已实现网关能力；生产链路另行核验 | `cloudflare-ai-gateway/README.md` 顶部注明该 Worker 不在生产请求路径；同文后面的旧说明仍有冲突 |
| 独立设计实现，20+ 模块 | 写实际负责的适配层、事件、权限和文件流程 | 文件或模块数量难说明工程价值，个人独立贡献不能靠源码判断 |
| 13 个工具 | 可写“维护 13 项工具元数据和两类公开能力配置” | 注册包含 `workspace.execute`，但公开能力不授予 Shell，不等于对所有用户开放 13 个工具 |
| 保证不破坏文档结构 | 改为“受限 XLSX 格式下，通过版本、唯一匹配及序列化后重读校验降低误改风险” | 不能对任意 Office 文件作绝对保证 |
| ai-node 217 项通过 | 必须补充同次总数 270、跳过 53 | 不带 DSH 的历史运行并未执行全部集成测试 |
| 270 项全部通过、真实模型 8/8 | 仅在可提供对应版本与报告时保留，标注为历史验收 | 本次没有重现固定 DSH 与真实模型验收 |
| 相关 PR 的 GitHub CI 全通过 | 投递前核对实际 PR、commit 和链接 | 本地工作区没有 `.git`，本次未访问远端 CI；配置文件存在不等于 CI 当前通过 |

`AGENTS.md` 中部分架构属于方向性要求，交接文档也有旧状态。判断当前实现先看源码；判断当前生产链路需要实际部署证据。本次不修改或恢复部署。

## 4. 简历版本 A：AI 应用 / Agent 开发

**SNN AI 工作台｜Agent 系统集成与文件工作流开发｜项目时间按真实经历填写**

技术栈：TypeScript、React、Node.js、DeepSeek Harness、OpenAI-compatible API、SSE、Cloudflare Workers、Playwright。

- 基于固定版本 DeepSeek Harness 构建 SNN 产品适配层，封装运行时客户端、会话控制及事件转换，通过独立进程与 SDK 接入运行时，保持前端依赖 SNN API。
- 实现模型接口与 SSE 增量响应，处理客户端取消、上游超时和 Agent 心跳保活，区分完成、取消、失败及 token 上限截断等运行终态。
- 维护工具注册与只读 / 编辑能力配置，实现文档提取、文件分块上传及受限 XLSX 精确行删除；通过 SHA-256 版本、唯一匹配和写后重读校验约束文件修改，公开能力不授予 Shell，并限制网络抓取的 SSRF 风险。

根据自己实际负责的部分使用“负责”“参与”“实现”。若复测和证据归档完成，可追加一条验证结果；不要为了量化硬塞历史数字。

## 5. 简历版本 B：测试开发

**SNN AI 工作台｜Agent 接口与文件工作流自动化测试｜项目时间按真实经历填写**

技术栈：JavaScript / TypeScript、Node.js Test Runner、Playwright、HTTP / SSE、GitHub Actions、Mock / Fixture。

- 围绕浏览器、SNN API 与 Agent 运行时设计分层验证：以 Mock 上游覆盖接口与异常路径，以固定 DSH 运行时验证会话、工具和事件链路，以真实模型用例检查自然语言驱动的文件操作。
- 覆盖 SSE 流式转发、取消传播、空闲超时、心跳清理和运行终态，结合 Playwright 验证文件工作区与移动端交互；通过下载并解析实际文件判断修改结果，避免仅依据模型回复判定成功。
- 针对权限与数据一致性设计负向用例，包括公开能力无 Shell、私网 / 回环地址抓取拒绝、重定向逐跳检查、XLSX 旧版本拒绝与多匹配拒绝；CI 配置包含 lint、服务测试、构建和固定运行时验收。

只有确实做过测试设计和实现，才使用上述职责措辞。若原本主要负责功能开发，可写“为核心流程补充自动化验证”，不要将已有套件全算作自己的测试平台建设。

历史量化数据可作为独立佐证：项目报告记载 AI Node 在未配置 DSH 时 217 pass / 53 skip，在配置固定 DSH 时 270 pass / 0 skip；另记录真实模型验收 8/8。必须说明它们属于历史运行记录，本次仅复测了后文列出的定向用例。

## 6. 60 秒项目介绍

### AI 应用方向

> SNN 是面向学生科技社区的平台，我重点介绍其中的 AI 工作台。它同时支持流式对话和受限文件 Agent。工程上，前端调用 SNN API，Node.js 服务通过适配层集成 DeepSeek Harness，运行循环由开源运行时承担，产品侧负责 API、事件、能力配置和工作区边界。一个比较具体的流程是 XLSX 精确删行：先检查工作表并返回文件版本和匹配数量，只允许唯一匹配，修改后重新解析校验，再通过受控文件服务写回。我希望重点展示的是把模型能力接入真实业务，并处理权限、状态和失败情况的工程能力。

### 测试开发方向

> 我用 SNN AI 工作台说明如何测试一个带模型和工具调用的系统。验证分为三层：Mock 模型验证确定性接口逻辑，固定 Agent 运行时验证真实集成链路，真实模型验证自然语言任务能否调用工具并产生正确文件。判断成功不看模型说了什么，而是下载文件检查实际内容；SSE 还要检查取消、超时和最终状态。模型用例成本高、输出有波动，因此适合验收；可重复的底层断言和异常测试适合日常 CI。

以上是讲述模板，个人职责需要替换为自己的真实贡献。

## 7. 面试核心追问与回答要点

### 1）这和封装一个模型 API 有什么区别？

普通对话主要是请求与回答；文件 Agent 还涉及模型选择工具、执行副作用、接收工具结果、继续生成，以及会话和失败状态。SNN 复用 DSH 的循环，自己实现产品边界、能力策略、文件流程与可观测事件。不要宣称自研整个 Agent Runtime。

### 2）为什么使用适配层和独立进程？

前端需要稳定的 SNN 领域模型，不适合直接消费运行时内部通知。适配层集中处理运行时类型、工具事件和终态；子进程边界分离生命周期和依赖。代价是多了一层 RPC、启动和退出处理。进程隔离本身不等于安全沙箱，仍需文件和工具权限校验。

证据：`ai-node/src/agent/dsh-client.mjs`、`runtime-adapter.mjs`、`event-adapter.mjs`、`runtime-manager.mjs`。

### 3）为什么用 SSE？为什么不直接 EventSource？

当前需求主要是服务端持续向浏览器输出事件，SSE 与 HTTP 链路适配。这里通过 Fetch POST 提交消息并读取 ReadableStream，原生 EventSource 不直接提供这种 POST body 用法。实现要把 UTF-8 字节增量解码，缓存不完整事件，按空行划分 SSE frame，忽略注释心跳，并检查终态。不能假设一个网络 chunk 就是一条完整 JSON。

证据：`lib/ai-client.ts`、`ai-node/src/sse.mjs`、`ai-node/src/agent/sse-heartbeat.mjs`。

### 4）取消、超时和截断如何区分？

用户取消通过 AbortSignal 等机制尽量传递上游；Agent 路径还通过 SDK 请求取消。空闲超时是长时间没有数据，需要关闭相关资源并返回受控错误；心跳解决连接空闲，不代表模型完成。token 上限导致的部分输出映射为 `run.incomplete`，不能假装完整成功。适配层防止同一运行出现多个终态。

### 5）文件修改如何防止“删错了还说成功”？

XLSX inspect 返回基于原始字节的 SHA-256 版本、目标表和匹配数；patch 重新读取并检查版本，只接受一个匹配，拒绝无匹配、多匹配以及不支持的结构。修改后序列化并重新读取，检查目标消失、行数符合预期，再调用受控替换。文件服务在工作区锁内再次校验版本。验收下载最终文件检查实际字节对应的内容。

证据：`ai-node/src/agent/spreadsheets/spreadsheet-service.mjs`、`workspace/file-ingestion-service.mjs`。

### 6）模型被文档里的恶意指令诱导怎么办？

提示词要求把文件和网页视为不可信数据，但真正的权限不能靠提示词。公开能力只授予选定工具，服务端约束工作区与文件 ID，不提供任意 Shell；fetch 在连接时检查 DNS 解析的目标并对每次重定向重新检查。只能说这些措施缩小风险，不能说已经完全解决提示注入。

证据：`ai-node/src/agent/capabilities/built-ins.mjs`、`workspace/workspace-url-fetch.mjs`。

### 7）怎么为 Agent 设计测试分层？

| 层次 | 测试对象 | 推荐断言 | 主要限制 |
| --- | --- | --- | --- |
| 单元 / 组件逻辑 | 事件适配、权限解析、SSE parser、文件服务 | 输入输出、不变量、错误码、终态次数 | 不能证明跨层装配正确 |
| HTTP 集成 | Gateway / AI Node 与 Mock 上游 | headers、状态码、首块可见、取消 / 超时 | Mock 不证明真实模型能力 |
| 固定运行时集成 | 实际 DSH 进程 + Mock 模型 | SDK、工具、持久化与事件链路 | 需要固定版本构建；仍非真实模型 |
| 浏览器端到端 | Playwright + 页面与 API | 上传 / 编辑 / 下载、取消、布局和恢复 | 模拟 API 的用例不证明线上服务可用 |
| 真实模型验收 | 自然语言目标 + 真实工具执行 | 工具结果、下载文件、明确终态 | 成本、时延、随机性与模型环境 |

解释每一层解决什么问题，比单独报“多少条测试”更重要。

### 8）怎么测试流式响应没有被缓冲？

让 Mock 上游先发第一块，等待测试释放同步屏障后再发剩余数据。在上游还未结束时断言客户端已经收到第一块。只检查最终拼接字符串正确，无法证明是流式转发。还应测试任意分块、UTF-8 拆分、注释帧、无终态 EOF 和客户端中途断开。同步屏障属于进一步完善用例的方法，不代表所有现有用例都采用它。

### 9）怎么处理模型测试的不确定性？

确定性逻辑使用夹具与 Mock；真实模型用例固定模型配置和受控样本，以状态和文件内容作为判定依据，避免依赖回答措辞。区分“提示中指定工具”的 guided 用例与“只给自然语言目标”的用例。8/8 表示这些用例当次成功，不代表所有任务成功率 100%，也不等于性能测试。多次运行成功率、首 token 延迟、总耗时和故障分布可作为后续评测指标，目前不能编造数据。

### 10）270 个测试与 53 个 skip 该怎么解释？

历史报告中，53 个 skip 与未配置固定 DSH 的集成环境有关。缺环境时跳过是一种显式状态，不能当作已验证。CI 的独立任务构建指定 commit 的 DSH，再运行相应验收，有助于复现，但必须核对实际日志。报告总数时应一起给出 pass / fail / skip、代码版本、运行命令与依赖条件。

### 11）聊天历史为什么用 IndexedDB？如何避免串会话？

对话是结构化、可增长的数据，使用异步 IndexedDB；当前活动会话 ID 等轻量偏好保存在 localStorage。项目还有按会话串行队列，以及对生成结果、导航结果是否仍可应用的判断。可以结合“切会话后旧请求返回”“删除后迟到保存”两种竞态解释。浏览器本地历史与服务端 Agent 执行会话属于不同状态，不要说成已经实现统一云同步。

证据：`lib/ai-conversation-store.ts`、`ai-conversation-queue.mjs`、`ai-conversation-state.mjs`。

### 12）测试开发还需要补哪些基础？

先掌握当前项目能支撑的 HTTP、SSE、异步 JavaScript、断言、Mock、夹具、隔离和 CI。再补 SQL、Linux 进程与日志、测试设计方法、接口鉴权、性能测试的吞吐与分位延迟。Python / pytest、压测工具可根据目标 JD 补齐，但本项目没有实现的工具不能提前写成经验。

## 8. 三个可展开的真实技术案例

按“触发条件 → 原因 → 方案 → 如何验证 → 限制”讲，不把代码存在说成自己亲历过的线上事故。

1. **排队期间 SSE 空闲断开**：模型暂时无输出导致代理长连接空闲；使用 `: ping\n\n` 注释帧，每 15 秒发送，结束和连接关闭时清理计时器。项目代码注释保存了历史链路观察，但实际超时阈值依环境变化，不能当作全平台常量。
2. **XLSX 旧版本覆盖与匹配歧义**：Agent 看过文件后文件可能变化，文本目标也可能出现多次；使用内容版本、唯一匹配、写前重校验和写后重新解析。讨论的是受限操作，并非通用 Excel 编辑器。
3. **上传上限和附件上下文上限不一致**：历史报告记录可上传的大 PDF 被更小的附件声明上限拒绝；区分存储、预览、编辑、提取、附件元数据限制，避免混用一个大小概念。文件能上传不代表全文都进入模型上下文。

## 9. 本次验证与证据边界

已阅读主 README、交接 / 迁移文档、相关源码、CI 配置及历史能力报告。项目目录没有 `.git`，不能比较提交或确认个人贡献；要求中的相邻 `../conversation` 归档在此机器不存在。没有恢复 Git、安装项目依赖、修改业务代码、访问真实模型或发布服务。

本机没有项目 `node_modules`，PATH 中没有 `npm.cmd`。尝试标准 npm 测试命令时未能启动测试；随后通过已有 Node.js 直接执行不依赖外部包的定向用例：

```text
node --test cloudflare-ai-gateway/test/*.test.mjs
11 tests / 11 pass / 0 fail / 0 skip

node --test ai-node/test/sse-heartbeat.test.mjs ai-node/test/agent-events.test.mjs ai-node/test/capabilities.test.mjs ai-node/test/workspace-url-fetch.test.mjs
27 tests / 27 pass / 0 fail / 0 skip
```

这些结果仅覆盖本次所选用例，不代表 AI Node 全量、浏览器、lint、build、真实模型或当前生产服务全部通过。历史 270/270 与 8/8 来源是 `docs/agent-runtime/workspace-agent-capability-report.md`，本次未重跑。

## 10. 准备顺序

1. 先练熟 60 秒介绍，画出浏览器 → SNN API → AI Node → Adapter → DSH / 模型的逻辑边界；部署链路和生产组件状态另讲。
2. 精读一条 SSE 链路和一条 XLSX 工具链路，能定位代码、解释正常与异常路径。
3. AI 方向重点练工具调用、运行时复用、权限、终态；测试方向重点练测试分层、Mock 边界、文件断言和失败归因。
4. 形成自己的贡献清单：我做了什么、为什么这样选、遇到什么问题、拿什么证据验证。回答不了的细节先补理解再写简历。
5. 投递前在依赖齐全的环境复测、保存日志，补充可公开的演示与 CI / PR 链接。演示需清楚标注真实运行、Mock 或录屏，隐藏个人文件和凭据。

不需要为了求职立即更换技术栈。当前最有价值的准备是把已实现的工程流程讲清楚，并能证明自己的判断与验证能力。
