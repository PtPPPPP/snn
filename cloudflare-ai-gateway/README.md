# SNN Cloudflare AI Gateway

这是独立的 Cloudflare Worker，只暴露网站需要的两个接口：

```text
GET  /api/ai/status
POST /api/ai/chat
```

它不会运行模型、保存聊天历史或代理任意路径。它将请求转发到受到 Cloudflare Access 保护的 AI Origin，再由同学电脑的 SNN AI Node 调用本机 Qwen Runtime。

## 配置

在部署前修改 `wrangler.jsonc` 中的公开变量：

- `AI_ORIGIN_URL`：内部 Origin，例如 `https://ai-origin.example.com`
- `ALLOWED_ORIGINS`：正式网站域名与本地开发域名的逗号分隔列表
- `MAX_CHAT_BODY_BYTES`：默认 65536
- Rate Limit `namespace_id`：必须替换为当前 Cloudflare Account 内唯一的正整数

通过 Cloudflare Dashboard 或 Wrangler Secret 保存下面两个 Secret，绝不提交它们：

```bash
wrangler secret put CF_ACCESS_CLIENT_ID
wrangler secret put CF_ACCESS_CLIENT_SECRET
```

Worker 会用这两个值作为 `CF-Access-Client-Id` 与 `CF-Access-Client-Secret` 请求头访问 AI Origin。

## Rate Limit

- Chat：每个客户端 IP 10 次 / 60 秒
- Status：每个客户端 IP 60 次 / 60 秒

Rate Limit Binding 是 Cloudflare 原生能力；本地单元测试只 Mock Binding，不能替代 Cloudflare 平台的真实限流验证。Cloudflare 的 Rate Limiting API 是按 Cloudflare location 生效、最终一致的防护层，不应被当作精确计费系统。

## 本地测试

```powershell
npm run test:ai-gateway
```

部署前还应完成：

1. 在 Cloudflare Dashboard 创建受保护的 `ai-origin.example.com` Access Application。
2. 创建只给 Gateway 使用的 Service Token，并为该应用配置 `Service Auth` 策略。
3. 在同学模型电脑的 cloudflared Tunnel 中，将 `ai-origin.example.com` 指向 `http://127.0.0.1:8787`。
4. 设置两个 Worker Secret，再部署 Worker。

不要把正式网站、浏览器、FTP 资源或 Qwen Runtime 直接指向 AI Origin。
