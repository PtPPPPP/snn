# DeepSeek Harness Runtime Audit

审计基线：`deepseek-harness` 分支 `master`，提交 `141eb6fef83422698aef7a981029e843e8161534`。本文件只描述该提交的真实源码，不把方向性文档或未来接口当作当前能力。

## 结论

SNN 应选择独立 Runtime Process 边界：

```text
SNN AI Node
  -> SNN Agent Runtime
  -> DSH Client
  -> newline-delimited JSON-RPC over stdio
  -> DeepSeek Harness Runtime Process
```

当前 DSH 已有正式的 out-of-process SDK、JSON-RPC 协议、TypeScript Client 和 Server Plugin。直接 import `agent-loop`、`tools`、`session` 等内部包会把 Cordis 插件装配、生命周期和升级变化带入 SNN AI Node，没有必要。依据：`packages/sdk/README.md`；`packages/sdk/protocol/src/types.ts:93`；`packages/sdk/client/src/api.ts:22`；`packages/sdk/server/src/server.ts:53`。

当前 SDK 仍缺少两个 SNN 必需的线协议操作：单会话/单次运行取消，以及从持久化存储恢复会话。核心层具备这两项能力，但 JSON-RPC Request Map 只有 `initialize`、`session/prompt`、`shutdown`。因此本阶段只能建立稳定 SNN abstraction，并对缺口 fail loud，不能伪造完整 Agent Runtime 已可上线。依据：`packages/sdk/protocol/src/types.ts:101`；`packages/sdk/client/src/client.ts:179`；`packages/core/agent/src/runtime-types.ts:85`；`packages/core/agent-loop/src/index.ts:653`。

## Agent creation path

公开 Agent Service 在 `packages/core/agent/src/index.ts` 定义 `CreateAgentOptions`、`AgentHandle` 和 `AgentFactory`。`ctx.agents.create(...)` 委托当前 factory，默认 factory 是 `AgentLoop`：

- 类型与创建入口：`packages/core/agent/src/index.ts:80`、`:172`、`:183`、`:405`。
- 默认实现：`packages/core/agent-loop/src/index.ts:296`。
- 创建事务：`AgentLoop.createAgent(...)` 位于 `packages/core/agent-loop/src/index.ts:606`，负责 Session preparation、agent scope、setup、发布和反向 teardown。
- SDK Server 首次收到未知 `sessionId` 的 prompt 时延迟创建 Agent：`packages/sdk/server/src/server.ts:200`、`:218`，最终调用 `ctx.agents.create(...)`。

Agent 与 Session 共用同一个 `SessionId`。创建成功返回的 `AgentHandle` 同时持有 `agent` 和异步 `dispose()`；生命周期所有权属于调用方，而不是全局隐式单例。

## Agent loop path

默认 driver 是 `ReactLoopAgent`：`packages/core/agent-loop/src/agent.ts:64`。

真实入口和循环为：

```text
Agent.followup(message)
  -> Agent.send(..., "next-turn", true)
  -> wakeDriver()
  -> kick()
  -> turn()
  -> step()
  -> llm stream
  -> tool execution
  -> turn/end
  -> idle
```

源码位置：

- 用户消息入口 `followup(...)`：`packages/core/agent-loop/src/agent.ts:122`。
- 驱动循环 `kick()`：`packages/core/agent-loop/src/agent.ts:210`。
- Turn 状态机 `turn()`：`packages/core/agent-loop/src/agent.ts:246`。
- 单次模型请求与工具调用 `step()`：`packages/core/agent-loop/src/agent.ts:332`。
- 官方架构顺序图的文字版本：`docs/architecture.md:63`。

Agent loop 自己捕获已上报的运行失败，持久化结果通过 `turn/end` 表达；外部消费者不应依赖某个内部 Promise rejection 来判断整个 turn 的业务结果，而应读取 session events。

## Message, completion, abort and resume

普通用户输入通过 `Agent.followup(UserMessage)` 进入 `next-turn` inbox 并唤醒 driver；steering 通过 `Agent.steer(...)` 进入最近的 `next-step`；不唤醒的上下文通过 `Agent.inject(...)` 进入下一步。接口定义在 `packages/core/agent/src/runtime-types.ts:124` 附近，实现位于 `packages/core/agent-loop/src/agent.ts:113` 至 `:130`。

完成不是单一 callback，而是持久化的 `turn/end`：

- `completed`、`max-tokens` 表示正常或令牌上限结束。
- `aborted` 携带取消原因。
- `blocked`、`error`、`interrupted` 表示拒绝、运行错误或崩溃恢复关闭。

类型定义：`packages/core/session/src/types.ts:143`、`:153`、`:236`。

核心取消通过 `Agent.cancel(cause, options)` 实现。它清空或保留 inbox，并 abort 当前 activity 的 `AbortController`；后续 LLM stream 与 Tool execution 共用/传递这个 signal。定义：`packages/core/agent/src/runtime-types.ts:85`；实现：`packages/core/agent-loop/src/agent.ts:134`。

核心恢复通过 `ctx.agents.resume(...)` -> `AgentLoop.resume(...)` -> `sessionPersistence.prepare(...)` 完成。位置：`packages/core/agent/src/index.ts:424`；`packages/core/agent-loop/src/index.ts:653`；`packages/session/session-persistence/src/coordinator.ts:720`。

但是 SDK 线协议当前没有 cancel 或 resume 方法。`HarnessClient` 源码明确说明“no wire-level cancel”，请求超时只放弃客户端等待，服务端工作继续到 Runtime 关闭：`packages/sdk/client/src/client.ts:179`。同样，`session/prompt` 对未知 ID 的行为是新建，而不是加载持久化 Session：`packages/sdk/server/src/server.ts:200`、`:218`。

## Session path

Session 是 append-only `SessionEvent` 日志和模型历史的事实来源：

- `Session`：`packages/core/session/src/index.ts:425`。
- detached create/restore：`packages/core/session/src/index.ts:482`。
- live registry `SessionStore`：`packages/core/session/src/index.ts:792`。
- create/prepare：`packages/core/session/src/index.ts:830`、`:863`。
- fork：`packages/core/session/src/index.ts:1081`。
- durable event vocabulary：`packages/core/session/src/types.ts:236`。

Session ID 是 branded `SessionId`，不是任意内部对象引用。每个 event 有连续 `seq`、`time`、`type`、`data`；`deriveMessages()` 从日志投影模型历史。Session lifecycle 由 store/agent owner 管理，dispose 会退出 registry 并发出 `session/disposed`。

持久化是独立 capability：

- 抽象 persistence service：`packages/session/session-persistence/src/index.ts:133`、`:155`。
- JSONL provider：`packages/session/session-persistence-jsonl/src/index.ts:176`、`:184`。
- SQLite provider：`packages/session/session-persistence-sqlite/src/index.ts:97`、`:105`。

恢复不是 Session 自己扫描磁盘，而是 persistence `prepare(id, signal)` 返回 `SessionPreparation`，再由 AgentLoop 原子发布。这是 SNN 不应复制的生命周期逻辑。

## Tool registry path

真实 Tool Registry 是 `ctx.tools` 对应的 `ToolRuntime`：`packages/core/tools/src/index.ts:787`。

注册有两条合法路径：

- 底层 `ctx.tools.register(ToolDefinition)`：`packages/core/tools/src/index.ts:1037`。返回精确 disposer；同层重复名称和保留名称失败。
- 类型友好的 `defineTool(...)`：`packages/core/tools/src/schema.ts:545`。它编译参数/输出 schema 并生成符合 `ToolDefinition` 的执行函数。

Tool schema 的模型可见字段是 `name`、`description`、`parameters`；成功输出必须声明 output schema 和 render。执行输入包含 `callId`、`name`、lossless JSON arguments、可选 Agent 和必需 `AbortSignal`。定义：`packages/core/tools/src/index.ts:212`、`:314`。

Tool pipeline 为：

```text
tools/pre-execute
  -> monotonic guards / approval
  -> tools/execute
  -> tool body
  -> tools/post-execute
  -> finalized ToolExecutionResult
```

扩展事件定义：`packages/core/tools/src/index.ts:152`、`:163`、`:175`；统一执行入口：`:1342`。`PreToolDecision` 是 `allow | deny | ask`：`:588`。`ask` 只在 approval service 返回 `allowed-once` 时继续，否则 fail closed。

Tool call ID 使用 LLM 的 branded `CallId`，日志中的 `tool/call.callId` 与 `tool/result.message.toolCallId` 配对：`packages/core/session/src/types.ts:283`、`:295`。

错误不会静默吞掉：registry 将未知工具、参数错误、body/policy/output 错误规范化为 materialized `ToolExecutionFailure`，并最终记录 `tool/result.error {name, code}`。

Timeout 是协作式能力：ToolDefinition 可声明 `timeoutMs`，但由独立 `timeout-policy` plugin 的 `tools/execute` wrapper 强制，位置：`packages/core/tools/src/index.ts:249`；`packages/guard/timeout-policy/src/index.ts:56`。工具仍必须观察/转发 `exec.signal` 并收敛，核心不会强杀同进程代码。

## Approval and permission hooks

Approval 是独立 seam，不属于 Tool Registry 的复制实现：

- `approval/request` waterfall：`packages/interaction/user-approval/src/index.ts:30`。
- `ApprovalService`：`packages/interaction/user-approval/src/index.ts:192`。
- 请求执行与 fail-closed 逻辑：`packages/interaction/user-approval/src/index.ts:257`。
- durable audit pair：`approval/asked`、`approval/decided`，定义于 `packages/interaction/user-approval/src/index.ts:44`、`:55`。

`ask` policy 没有 answerer 时返回 `unavailable`，不会默认放行。取消中的 approval 结果为 `cancelled`。SNN 只应把 `approval/asked` 投影成自己的 `approval.required`，不应让前端绑定 `approval/request` 或 Cordis scope。

## SDK and external invocation

官方 TypeScript SDK 高层 API 是：

- `DeepSeekHarness`：拥有一个可复用的 Runtime subprocess，`packages/sdk/client/src/api.ts:22`。
- `HarnessSession`：用稳定 session ID 运行 prompt 并观察到下一次 idle，`packages/sdk/client/src/api.ts:132`。
- `HarnessClient`：spawn 子进程、管理 stdio JSON-RPC、订阅通知并完成 EOF/SIGTERM/SIGKILL teardown，`packages/sdk/client/src/client.ts:184`。

Wire transport 是 newline-delimited JSON-RPC 2.0 over stdio：`packages/sdk/protocol/src/transport.ts:62`。当前请求：

```text
initialize
session/prompt
shutdown
```

当前通知：

```text
session.event
session.status
subagent.started
subagent.finished
```

权威定义：`packages/sdk/protocol/src/types.ts:93`、`:101`。Server 把所有 `session/event` 和 `agent/status` 转成通知：`packages/sdk/server/src/server.ts:71`、`:75`。

独立 Runtime 可由 `dsh-jsonrpc-agent <cordis.yml>` 启动。它要求显式配置，不提供隐式默认；stdout 只允许协议帧，诊断走 stderr；stdin EOF/SIGTERM 会 dispose Runtime。依据：`packages/examples/jsonrpc-demo/src/runner.ts`；`packages/examples/jsonrpc-demo/README.md:7`、`:15`、`:17`。

DSH 也有 headless profile，但它是“一次任务、无 server”的 runner，不是 SNN 所需的长驻多 Session RPC 边界：`docs/architecture.md:25`。因此 SNN 应使用 JSON-RPC SDK Runtime，而不是解析 headless CLI 输出。

## Event mechanism and SNN projection

DSH 有三类事件：

1. Durable Session events：通过 `session/event` 广播并可恢复，`docs/architecture.md:57`。
2. Live Agent events：`agent/created`、`agent/status`、`agent/pre-step`、`agent/request`、`agent/error` 等，定义于 `packages/core/agent/src/runtime-types.ts:151` 至 `:290`。
3. Capability events：例如 `tools/pre-execute`、`tools/execute`、`tools/post-execute`、`approval/request`。

SDK 对外主要投影 durable `session.event` 与 `session.status`，不会把所有 live Agent/Capability callback 暴露出去。SNN Event Adapter 应从 durable events 得到可回放事件：

| DSH input | SNN event |
|---|---|
| `assistant/chunk` `block-start reasoning` | `reasoning.started` |
| `assistant/chunk` `reasoning-delta` | `reasoning.delta` |
| `assistant/chunk` `block-end reasoning` | `reasoning.completed` |
| `assistant/chunk` `block-start text` | `message.started` |
| `assistant/chunk` `text-delta` | `message.delta` |
| `assistant/message` | `message.completed` |
| `tool/call` | `tool.started` |
| `tool/result` without error | `tool.completed` |
| `tool/result` with error | `tool.failed` |
| `approval/asked` | `approval.required` |
| `turn/end completed|max-tokens` | `run.completed` |
| `turn/end aborted` | `run.cancelled` |
| other terminal `turn/end` | `run.failed` |

`run.started` 由 SNN Runtime 在接受 `sendMessage` 时产生，使用 SNN 自己的 `runId`。DSH 事件名只允许出现在 `ai-node/src/agent/event-adapter.mjs` 和 DSH Client 私有层，不能进入 Web UI 或 SNN public API。

## Windows behavior

DSH 已提供官方 PowerShell provider。`PwshLocalExecutor` 通过 `ctx.subprocess` 启动 `pwsh -NoLogo -NoProfile -NonInteractive -Command`，并处理取消、超时、UTF-8 和 Windows executable resolution：`packages/shell/pwsh-local/README.md:5`、`:33`。SNN 后续 Runtime 配置应选官方 win32/pwsh composition，不应安装额外 bash，也不应在 Adapter 内自行实现 shell。

## Recommended SNN integration boundary

选择 Option B：

```text
SNN Route
  -> SnnAgentRuntime
  -> DshRuntimeAdapter
  -> DshClient
  -> official @deepseek-ai/dsh-sdk-client
  -> dsh-jsonrpc-agent process
```

理由：

- 官方已经把 JSON-RPC stdio 定义为 out-of-process Runtime SDK。
- DSH 自己拥有 Cordis plugin tree、Agent/Session ownership、Tool Registry、approval、persistence 和 teardown；SNN import 内部包会复制装配责任。
- 进程隔离能让 DSH 升级、崩溃、日志和强制回收不污染 AI Node 的现有 Chat lifecycle。
- SNN 只需要稳定的 session/run/event 模型，Web 和 route 不需要知道 Cordis、SessionEventMap 或 ToolDefinition。

本阶段不把 Runtime 挂到公共 route，不修改现有 `/api/ai/chat` 与 `/api/ai/chat/stream`，也不让浏览器直接连接 DSH。

## DSH_EXTENSION_REQUIRED

### `session/cancel`

需要在 `packages/sdk/protocol` 增加 typed request，在 `packages/sdk/server` 查找 server-owned live Agent 并调用：

```ts
agent.cancel({ kind: "user" })
```

请求应明确 session/run ownership、幂等语义和未知/已 idle session 的结果。不能用 SDK `close()` 代替，因为 `close()` 会终止整个 Runtime 和所有 Session。

### `session/resume`

需要在 `packages/sdk/protocol` 增加 typed request，在 `packages/sdk/server` 通过已配置 `sessionPersistence` 调用：

```ts
ctx.agents.resume({ resumeSessionId, ... })
```

当前 `session/prompt` 的未知 ID 分支调用 `ctx.agents.create(...)`，不是 persistence resume。扩展必须明确不存在、损坏、版本不支持和 live identity collision 的 wire error。

上述两项都需要修改官方 DSH SDK/protocol/server，因此本轮只记录，不修改只读仓库。

## Smoke status

没有运行 live Agent smoke。官方 SDK Runtime 启动需要完整 `cordis.yml`，实际模型 turn 需要 provider 配置和凭据；本轮没有使用或写入任何 API Key。

```text
LIVE_AGENT_SMOKE_NOT_RUN_NO_API_KEY
```

