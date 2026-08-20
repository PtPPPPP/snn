# SNN Production Checklist

本清单只用于部署前检查，不会执行部署、DNS 修改或 Secret 上传。

## 链路

```text
Browser → SNN Website / React → Public HTTPS Gateway → Cloudflare Access → Private AI Origin → 127.0.0.1 AI Node → Local Model Runtime
```

- Browser 只请求相对 `/api/ai`，不应知道 AI Origin、AI Node 或模型 URL。
- AI Node 默认绑定 `127.0.0.1`，不直接暴露公网。
- Gateway → Origin 的 Access Client ID、Client Secret 只能通过 Worker Secret 提供。
- Qwen/模型 API Key 只能保存在 AI Node 环境中。

## 配置

部署前在部署环境提供真实值：

```text
SNN_PUBLIC_ORIGIN=https://<正式网站域名>
SNN_AI_GATEWAY_URL=https://<正式 Gateway 域名>
AI_ORIGIN_URL=https://<Access 保护的 Origin 域名>
ALLOWED_ORIGINS=https://<正式网站域名>
AI_CHAT_RATE_LIMIT_NAMESPACE_ID=<真实 namespace id>
AI_STATUS_RATE_LIMIT_NAMESPACE_ID=<真实 namespace id>
CF_ACCESS_CLIENT_ID=<Worker Secret>
CF_ACCESS_CLIENT_SECRET=<Worker Secret>
QWEN_UPSTREAM_API_KEY=<AI Node Secret，如需要>
```

运行：

```bash
npm run preflight:production -- --strict
```

预检只读配置和构建产物，发现占位域名、localhost public endpoint、HTTP public URL、缺失绑定或前端凭据时退出失败，不会打印 Secret，也不会部署。

## 部署顺序

1. 准备并验证 Qwen Runtime 与 AI Node，确认只监听 `127.0.0.1`。
2. 创建/确认 Cloudflare Tunnel 与 Access Application。
3. 配置 Gateway Worker vars、Rate Limit bindings 和 Worker Secrets。
4. 配置网站正式域名与 HTTPS。
5. 运行 `npm run verify` 与 production preflight。
6. 由维护者分别部署 Gateway 与 Website。
7. 通过 `/`、`/ai/`、Gateway status 和一次人工 SSE 请求做 smoke。

## 缓存与 SSE

- Chat JSON 使用 `Cache-Control: no-store`。
- SSE 使用 `Cache-Control: no-cache, no-transform`，不得缓存或缓冲。
- Status 是实时状态，也不得长缓存。
- 静态 hash 资产可由 hosting 层设置长期缓存；HTML 不应设置 immutable 长缓存。

## 回滚

发现异常时，回滚 Website 与 Gateway 到上一份已验证版本，恢复上一份配置，再重新执行 status、`/ai/` 与 SSE smoke。不要用 DNS 临时绕过 Gateway。
