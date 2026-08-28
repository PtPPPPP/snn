# SNN AI 模型电脑部署说明

这份说明给**实际运行 Qwen 的同学电脑**使用。网站开发电脑不需要安装模型、Qwen Runtime 或 cloudflared。

## 最终结构

```text
Qwen Runtime          http://127.0.0.1:8000/v1
        ↑
SNN AI Node           http://127.0.0.1:8787
        ↑
cloudflared Tunnel    api.snnai.cn
```

三项本地程序必须运行在同一台模型电脑上。Qwen Runtime 不得直接被 Tunnel 指向。

> `cloudflare-ai-gateway/` Worker 目前**不在生产请求路径中**，保留作为未来可选的
> 限流/校验层。如需启用，参见该目录 README。

## 1. 先运行并验证 Qwen Runtime

先使用项目负责人确认的**官方模型名称、来源与量化版本**。不要下载群聊来源不明的 GGUF。

Runtime 必须只监听：

```text
127.0.0.1:8000
```

先验证：

```powershell
curl.exe http://127.0.0.1:8000/v1/models
```

再向 `/v1/chat/completions` 发一个中文测试。把 `/v1/models` 返回的真实模型 ID 记录下来；不要照抄示例模型名。

## 2. 配置并启动 SNN AI Node

模型电脑先更新项目代码：

```powershell
git pull origin main
```

然后在 `ai-node/` 内创建 `.env`：

```powershell
Copy-Item .env.example .env
```

至少填写真实 Runtime 返回的模型 ID：

```text
SNN_AI_NODE_HOST=127.0.0.1
SNN_AI_NODE_PORT=8787
QWEN_UPSTREAM_BASE_URL=http://127.0.0.1:8000/v1
QWEN_MODEL=<运行时真实模型 ID>
```

### 启用 Agent 文件编辑时的完整配置

普通聊天能工作，不等于 Agent 文件编辑已经可用。启用 Agent 前，模型电脑必须先在固定 DSH 提交上完成构建，并在 `ai-node/.env` 中填写以下占位符对应的**本机真实值**；不得把密钥或个人绝对路径提交到 Git。

```text
# 用 git rev-parse --short HEAD 的结果标记当前运行中的 SNN 版本。
SNN_RELEASE_ID=<CURRENT_SNN_COMMIT>

SNN_AGENT_INTERNAL_ENABLED=true
SNN_AGENT_PUBLIC_ENABLED=true
SNN_AGENT_PUBLIC_COOKIE_SECURE=true
SNN_AI_ALLOWED_ORIGINS=https://snnai.cn

SNN_AGENT_DSH_SDK_PATH=<DSH_ROOT>/packages/sdk/client/lib/index.js
SNN_AGENT_DSH_TOOL_HOST_PATH=<DSH_ROOT>/packages/fs/tool-fs/lib/index.js
SNN_AGENT_DSH_RUNTIME_EXECUTABLE=<NODE_24_PATH>/node.exe
SNN_AGENT_DSH_RUNTIME_ARGUMENTS=["<DSH_ROOT>/packages/examples/jsonrpc-demo/lib/bin.js"]
SNN_AGENT_DSH_CORDIS_CONFIG=<DSH_ROOT>/examples/jsonrpc-agent/cordis.yml
SNN_AGENT_DSH_RUNTIME_CWD=<AGENT_DATA_ROOT>/runtime-default
SNN_AGENT_DSH_PROVIDER=<VALIDATED_DSH_PROVIDER>
SNN_AGENT_DSH_MODEL=<QWEN_RUNTIME_MODEL_ID>

SNN_AGENT_WORKSPACE_ID=snn-workspace-default
SNN_AGENT_SESSION_METADATA_ROOT=<AGENT_DATA_ROOT>/session-metadata
SNN_AGENT_PUBLIC_WORKSPACE_BASE=<AGENT_DATA_ROOT>/public-workspaces
SNN_AGENT_PUBLIC_OWNERSHIP_ROOT=<AGENT_DATA_ROOT>/ownership
DSH_SESSION_ROOT=<AGENT_DATA_ROOT>/dsh-sessions
SNN_AGENT_DSH_ENV_PASSTHROUGH=DEEPSEEK_API_KEY,DEEPSEEK_BASE_URL,DSH_SESSION_ROOT
SNN_AGENT_DSH_ENV_REQUIRED=DEEPSEEK_API_KEY,DEEPSEEK_BASE_URL,DSH_SESSION_ROOT
```

`<DSH_ROOT>` 必须是 pinned 提交 `852ae5321a3d68bc0b11c5cc6f3145dde6530500` 的构建目录。Canonical Node 是 `24.16.x`；兼容版本为 Node `>=22.19.x`；Node `22.13.x` 不支持该 DSH。

每个公开 Agent Session 都会获得独立的 Workspace、`DSH_CWD`、`DSH_HOME` 和 `DSH_AGENTS_HOME`。不要手工把这些目录指向公共用户目录，也不要开启 Shell、命令执行或私网抓取。

从项目根目录启动：

```powershell
npm run ai:node
```

验证：

```powershell
curl.exe http://127.0.0.1:8787/api/ai/status
```

状态必须是 `online: true` 后，才继续 Cloudflare 配置。

启用 Agent 后，状态还必须同时满足：

```text
capabilities.agent = true
capabilities.agentReadiness.runtimeReady = true
```

`toolsReady` 和 `modelToolCallingVerified` 当前会如实显示为 `unknown`，直到经过真实模型验收；它们不能被当作已验证。

流式聊天验证：

```powershell
$body = @{ messages = @(@{ role = "user"; content = "用一句话介绍 SNN AI。" }) } |
  ConvertTo-Json -Compress
curl.exe -N -X POST http://127.0.0.1:8787/api/ai/chat/stream `
  -H "content-type: application/json" `
  --data $body
```

终端应持续显示 `event: delta`，最后显示 `event: done`。更新后要重启 AI Node：先在旧进程按 `Ctrl + C`，再重新运行 `npm run ai:node`。

## 3. 在模型电脑安装 cloudflared

在 Cloudflare Dashboard 创建 Tunnel，选择 Windows 安装说明，并只在**模型电脑**以管理员身份执行 Dashboard 给出的安装命令：

```text
cloudflared.exe service install <TUNNEL_TOKEN>
```

`<TUNNEL_TOKEN>` 只能保存在模型电脑和 Cloudflare 配置中，不得提交 Git、发到群聊或写入本文档。

创建 Tunnel Published Application：

```text
Hostname: ai-origin.example.com
Service:  http://127.0.0.1:8787
```

不要将 Tunnel 指向 `127.0.0.1:8000`。

## 4. 保护 AI Origin（可选，当前生产未启用 Gateway）

> 当前生产链路 `api.snnai.cn` 通过 Tunnel 直接指向 ai-node，
> **不经过** `cloudflare-ai-gateway` Worker。以下步骤仅在启用
> Gateway 层时需要执行。

在 Cloudflare Zero Trust 为 AI Origin 域名创建 Self-hosted Access Application：

- 创建只给 Gateway 使用的 Service Token
- 添加 `Service Auth` Policy，仅允许这个 Service Token
- 不要创建允许所有人的 Policy

Gateway Worker 会在访问 Origin 时自动带上 Service Token；没有 Token 的直接 Origin 请求应被 Access 拒绝。

## 5. 最终检查顺序

1. Qwen `/v1/models` 正常。
2. Qwen `/v1/chat/completions` 能生成中文。
3. AI Node `/api/ai/status` 为 Online。
4. AI Node `/api/ai/chat` 能返回真实模型回复。
5. Tunnel 显示 Healthy。
6. 网站 `/ai/` 显示 Online 并能聊天。
7. 关闭 AI Node 后，网站 `/ai/` 仍能打开且显示 Offline。

## 6. 真实模型文件编辑验收

这一步会创建无敏感内容的临时公开 Agent Session，分别验收文本文件和 XLSX 工作簿。文本验收要求模型通过 `workspace.open`、`read` 和 `edit`/`write` 将 `Hello world.` 改为 `Hello SNN.`；XLSX 验收要求模型按 inspect → patch → inspect 的顺序删除合成工作簿中的精确目标行，并下载后重新打开验证。所有临时 Session 最后都会删除。只有负责模型电脑的人明确允许时才执行。

先确认模型电脑已经运行当前代码：

```powershell
git pull --ff-only origin main
git rev-parse --short HEAD
```

将上一步提交写入 `SNN_RELEASE_ID` 后重启 AI Node，再从项目根目录执行：

```powershell
$env:SNN_REAL_MODEL_AGENT_BASE_URL = "https://api.snnai.cn/api/agent"
$env:SNN_REAL_MODEL_ORIGIN = "https://snnai.cn"
npm run test:workspace-edit-real-model
```

成功必须显示真实 `tool.completed:read`，以及真实 `tool.completed:edit` 或 `tool.completed:write`；同时必须显示真实 `tool.completed:workspace.spreadsheet.inspect` 和 `tool.completed:workspace.spreadsheet.patch`。下载的文本内容必须精确等于 `Hello SNN.`；下载的 XLSX 必须可以重新打开，且仅目标行消失、非目标行和第二工作表保持。如果环境变量未设置，测试显示 `skipped` 是预期保护行为，不是通过。

如果网站静态界面已经更新但 API 返回的 `releaseId` 缺失、旧版本，或下载接口仍返回 `405`，说明模型电脑上的 AI Node 没有拉取当前 `main` 或没有重启。先解决版本漂移，再排查模型工具调用。

## 维护建议

手动验证稳定后，可按 Cloudflare 官方 Windows 文档让 cloudflared 以 Windows Service 在开机后自动运行。AI Node 也建议先手动启动验证，再通过 Windows 任务计划程序设置开机启动；不要引入第三方守护程序。
