# SNN Production Checklist

本清单只用于部署前检查，不会执行部署、DNS 修改或 Secret 上传。

## 当前生产 AI 链路

```text
Browser → https://snnai.cn (Worker + React) → api.snnai.cn → Cloudflare Tunnel → AI11 127.0.0.1:8787 → ai-node → Qwen
```

- `api.snnai.cn` 通过命名 Tunnel 直接指向 ai-node（127.0.0.1:8787），不经过 Gateway Worker。
- `cloudflare-ai-gateway/` 目前**不在生产请求路径中**，保留作为未来可选的限流/校验层。
- AI Node 默认绑定 `127.0.0.1`，通过 Tunnel 暴露 HTTPS，不直接暴露公网。
- Qwen/模型 API Key 只能保存在 AI Node 环境中。

## 配置

部署前在部署环境提供真实值：

```text
SNN_PUBLIC_ORIGIN=https://snnai.cn
AI_GATEWAY_URL=https://api.snnai.cn/api/ai
QWEN_UPSTREAM_API_KEY=<AI Node Secret，如需要>
```

## Agent BFF 生产配置

生产启用 Agent 浏览器功能时，AI Node 环境必须设置：

```text
SNN_AGENT_INTERNAL_ENABLED=true
SNN_AGENT_PUBLIC_ENABLED=true
SNN_AGENT_PUBLIC_COOKIE_SECURE=true
SNN_AI_ALLOWED_ORIGINS=https://snnai.cn
SNN_AGENT_PUBLIC_WORKSPACE_BASE=<server-owned directory>
SNN_AGENT_PUBLIC_OWNERSHIP_ROOT=<server-owned directory>
# 以及 Phase 2 所需的 DSH SDK/Runtime/Cordis 配置
```

验证清单：

- `SNN_AGENT_PUBLIC_COOKIE_SECURE=true`（生产必须，HTTPS 下使用 Secure cookie）
- `SNN_AI_ALLOWED_ORIGINS` 必须精确包含 `https://snnai.cn`，不得使用 `*`
- `SNN_AGENT_PUBLIC_WORKSPACE_BASE` 和 `SNN_AGENT_PUBLIC_OWNERSHIP_ROOT` 指向服务器专用目录
- Internal Agent listener (`SNN_AGENT_INTERNAL_HOST`) 仍然是 `127.0.0.1`
- Agent 关闭时：`/ai/` 正常对话不受影响，ModeSwitch 显示 "Agent · 不可用"

运行：

```bash
npm run preflight:production -- --strict
```

预检只读配置和构建产物，发现占位域名、localhost public endpoint、HTTP public URL、缺失绑定或前端凭据时退出失败，不会打印 Secret，也不会部署。

## 部署顺序

1. 准备并验证 Qwen Runtime 与 AI Node，确认只监听 `127.0.0.1`。
2. 确认 Cloudflare Tunnel 将 `api.snnai.cn` 指向 `127.0.0.1:8787`。
3. 配置网站正式域名与 HTTPS。
4. 运行 `npm run verify` 与 production preflight。
5. 由维护者部署 Website。
6. 通过 `/`、`/ai/`、Gateway status 和一次人工 SSE 请求做 smoke。

## 缓存与 SSE

- Chat JSON 使用 `Cache-Control: no-store`。
- SSE 使用 `Cache-Control: no-cache, no-transform`，不得缓存或缓冲。
- Status 是实时状态，也不得长缓存。
- 静态 hash 资产可由 hosting 层设置长期缓存；HTML 不应设置 immutable 长缓存。

## 回滚

发现异常时，回滚 Website 到上一份已验证版本，恢复上一份配置，再重新执行 status、`/ai/` 与 SSE smoke。不要用 DNS 临时绕过安全边界。
