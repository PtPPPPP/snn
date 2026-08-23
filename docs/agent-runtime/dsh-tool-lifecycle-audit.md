# DeepSeek Harness Tool Lifecycle Audit

审计基线：`deepseek-harness` 的 `master` 分支，提交 `141eb6fef83422698aef7a981029e843e8161534`。本文件只描述当前源码。

## Conclusion

DSH 核心已有完整 Tool Registry、policy、approval、timeout、cancellation 和 durable result。当前 SDK 只发送 `session.event` 与 `session.status`，所以 SNN 能看到 durable `tool/call` 和 `tool/result`，却无法知道 Tool body 是否真的开始执行。

`tool/call` 不是 `tool.started`。它写入后才进入 `tools/pre-execute`，可能被 deny、approval fail-closed、timeout 或 cancellation 阻止，完全不调用 Tool body。SNN 不得把它映射为 public `tool.started`。

## DSH Tool Lifecycle

```text
LLM ToolCallBlock
  -> AgentLoop append tool/call
  -> ToolRuntime prepare
  -> tools/pre-execute
  -> approval / guard
  -> tools/execute waterfall
  -> ToolRuntime.dispatchToolBody
  -> registered ToolDefinition.execute
  -> tools/post-execute
  -> materialize final result
  -> tools/result live event
  -> AgentLoop append tool/result
```

### Tool request

`tool/call` 是 durable Session event，字段为 `turn`、`step`、`callId`、`name`、原始 JSON arguments，定义在 `packages/core/session/src/types.ts:283`。

Agent loop 在 `runGroup.startCall()` 中先调用 `appendToolCall(...)`，再调用 `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(...)`：`packages/core/agent-loop/src/tool-calls.ts:157`、`:263`。它只表示模型请求已经进入 DSH scheduler。

### True execution start

`tools/pre-execute` 是 policy waterfall：`packages/core/tools/src/index.ts:152`。`ToolRuntime.prepareExecution()` 在它之后处理 approval、guard 和 cancellation：`packages/core/tools/src/index.ts:1459`。

`tools/execute` 是 around-dispatch waterfall：`packages/core/tools/src/index.ts:163`、`:1574`。它仍可能被 wrapper 短路，不能证明 body 已调用。

真正 body 开始点在 `ToolRuntime.dispatchToolBody()`：它设置 `state.bodyInvoked = true`，然后调用 `await tool.execute(...)`，见 `packages/core/tools/src/index.ts:1532`。当前这里没有 durable Session event，也没有 SDK JSON-RPC notification。

### Terminal result

Tool registry 在 post-execute、content finalization 和 lossless materialization 后调用 `tools/result`：`packages/core/tools/src/index.ts:1631`、`:1657`。Agent loop 随后追加 durable `tool/result`：`packages/core/agent-loop/src/tool-calls.ts:281`。

失败必须通过 `message.content` 内 `ToolResultBlock.isError === true` 判断。顶层 `error` 是可选信息，可能不存在：`packages/llm/llm/src/types.ts:90`、`packages/core/session/src/types.ts:295`。

### Call ID, retry, timeout, cancellation, approval

LLM 的 `ToolCallBlock.id` 是 `CallId`；`tool/call.callId` 与 `tool/result` 的 `ToolResultBlock.toolCallId` 一一配对：`packages/llm/llm/src/types.ts:80`、`:90`。

ToolRuntime 没有默认通用 retry engine；`tools/execute` waterfall 允许 deployment wrapper 实现 retry、timeout 或 metrics：`packages/core/tools/src/index.ts:154`。SNN 不实现 retry。

`timeoutMs` 是协作式 budget，由 timeout policy plugin 在 `tools/execute` wrapper 执行：`packages/core/tools/src/index.ts:249`、`packages/guard/timeout-policy/src/index.ts:56`。已开始 Tool body 必须观察 `exec.signal` 并收敛。

Agent cancellation 的 signal 会进入 Tool execution。未开始的 Tool call 会得到 `ABORTED_BEFORE_DISPATCH` synthetic result，已开始 body 会等待收敛：`packages/core/tools/src/index.ts:1518`、`:1532`；`packages/core/agent-loop/src/tool-calls.ts:248`。

`tools/pre-execute` 可返回 `ask`。没有 answerer、拒绝或取消都不会 allow：`packages/core/tools/src/index.ts:1690`；`packages/interaction/user-approval/src/index.ts:257`。当前 SDK 没有 approval answer request，SNN 只映射 `approval.required`。

## SDK Boundary and Runtime Wiring

官方 protocol request 只有 `initialize`、`session/prompt`、`shutdown`；notification 只有 `session.event`、`session.status`、`subagent.started`、`subagent.finished`：`packages/sdk/protocol/src/types.ts:93`、`:101`。SDK Server 只订阅 `session/event` 和 `agent/status`：`packages/sdk/server/src/server.ts:71`、`:75`。

SDK Client 与 Runtime bin 都是可发布 package，当前版本为 `0.1.0-rc.8`：`packages/sdk/client/package.json`、`packages/examples/jsonrpc-demo/package.json`。Runtime bin 是 `dsh-jsonrpc-agent`，要求显式 `DSH_CORDIS_CONFIG`，没有内置默认配置：`packages/examples/jsonrpc-demo/src/runner.ts:25`。

DeepSeek provider 默认从 `DEEPSEEK_API_KEY` 读取凭据：`packages/llm/llm-deepseek/src/index.ts:47`、`:67`。

没有在 SNN 业务源码中写入或硬编码本地 DSH 路径；本阶段继续保留注入式 SDK factory。没有 API Key 时不能进行真实 Agent Tool Loop smoke。

## Built-in Read-only Tool

DSH 内置 filesystem Tool 的真实名称是 `read`，不是 `read_file`。它读取 UTF-8 文本，参数为 `file_path`、可选 `offset` 和 `limit`：`packages/fs/tool-fs/src/read.ts:69`、`:76`。

`write` 是独立 Tool，会在执行前解析 sandbox policy：`packages/fs/tool-fs/src/write.ts:62`、`:69`。因此 SNN UI metadata 不能代替 DSH policy。

## SNN Tool Execution Bridge

Bridge 使用 run-scoped state：

```text
requested -> started -> completed
                     -> failed
```

- durable `tool/call` 只记录 `requested`，不发 public event；
- 只有 verified body-start fact 才发 `tool.started`；
- terminal result 只有在 `started` 后才发 `tool.completed` 或 `tool.failed`；
- 重复 request/start/terminal、completed/failed 冲突、未知 callId、Session mismatch 和缺失 start 都只进入内部 diagnostic；
- `run.completed`、`run.failed`、`run.cancelled`、client failure 和 `dispose` 都释放 state。

public payload 只包含 `name`、`displayName`、`risk`、`approvalPolicy`、`category`、`policy`。不会包含 Tool input、Tool output、result meta、stderr、environment、credential 或 DSH exception class。

## Default Tool Policy Projection

```text
READ     -> allow
WRITE    -> deny
EXEC     -> deny
EXTERNAL -> deny
unknown  -> deny
```

这是 SNN product policy projection，不是执行层拦截。真正 enforcement 必须发生在 DSH `tools/pre-execute` seam。

当前 SDK `initialize` 没有 Tool metadata 或 per-session policy 字段；SDK Server 创建 Agent 时也没有从 SNN request 配置 `agent.ctx.on('tools/pre-execute', ...)` 的入口。Adapter 接到 durable event 时已晚于执行，不能补救。

## DSH_EXTENSION_REQUIRED

### Verified Tool body-start notification

需要在 `packages/core/tools/src/index.ts` 的 `ToolRuntime.dispatchToolBody()`，于 `state.bodyInvoked = true` 后、`tool.execute(...)` 前发布专用 live event。随后在以下包增加 typed `tool.execution.started` notification：

```text
packages/sdk/protocol/src/types.ts
packages/sdk/server/src/server.ts
packages/sdk/client/src/types.ts
```

事件至少需要 sessionId、callId、tool name。不能复用 `tool/call` 或泛化的 `tools/execute`，因为两者都不能证明 Tool body 实际开始。

### DSH-enforced SNN policy configuration

DSH 已有正确 enforcement seam：`tools/pre-execute`。但 SDK runtime 协议没有 SNN 向已创建 Session 传入 Tool metadata/risk policy 的接口。

最小 extension 是在 `packages/sdk/protocol/src/types.ts` 和 `packages/sdk/server/src/server.ts` 增加显式 policy configuration，并在 server 创建 Agent 时于 `agent.ctx` 使用 `tools/pre-execute` listener 执行 READ/WRITE/EXEC/EXTERNAL 映射。

不需要重写 Tool Registry；没有该 extension，SNN 只能投影默认 policy，不能声称高风险 Tool 已由 SDK runtime 强制拒绝。

