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

从项目根目录启动：

```powershell
npm run ai:node
```

验证：

```powershell
curl.exe http://127.0.0.1:8787/api/ai/status
```

状态必须是 `online: true` 后，才继续 Cloudflare 配置。

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

## 维护建议

手动验证稳定后，可按 Cloudflare 官方 Windows 文档让 cloudflared 以 Windows Service 在开机后自动运行。AI Node 也建议先手动启动验证，再通过 Windows 任务计划程序设置开机启动；不要引入第三方守护程序。
