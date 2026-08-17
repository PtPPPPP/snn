# SNN AI Node

SNN AI Node 是本机 API 适配层：它把网站固定的 `/api/ai/*` 协议转换为本机 Qwen Runtime 的 OpenAI-compatible API。它不运行模型，也不会监听公网地址。

## 安全边界

- 仅监听 `127.0.0.1:8787`
- Runtime 默认地址为 `http://127.0.0.1:8000/v1`
- 不要填写 `0.0.0.0`、公网 IP 或真实密钥到前端文件
- `.env`、模型权重、日志与本地运行数据均被 Git 忽略

## 配置

复制 `.env.example` 为 `.env`，再按本机 Runtime 修改配置：

```powershell
Copy-Item .env.example .env
```

必须填写的运行时变量：

```text
QWEN_MODEL=你的模型名称
```

未设置模型名称时，`GET /api/ai/status` 会返回 Offline，聊天请求会返回 503。这是预期的安全行为。

## 启动

从项目根目录运行：

```powershell
npm run ai:node
```

本地检查状态：

```powershell
curl.exe http://127.0.0.1:8787/api/ai/status
```

## 连接 Runtime

AI Node 会请求：

```text
GET  http://127.0.0.1:8000/v1/models
POST http://127.0.0.1:8000/v1/chat/completions
```

对于 Windows + NVIDIA GPU，优先使用官方 llama.cpp 的 Windows CUDA 发布包，并确保 Runtime 同样绑定 `127.0.0.1`。第一版建议从 `8192` 或 `16384` context 开始，并设置保守的输出上限。

## 自动测试

```powershell
npm run test:ai-node
```

测试使用 Mock Upstream，不会下载或加载任何模型。
