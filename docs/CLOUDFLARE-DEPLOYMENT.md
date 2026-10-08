# 原 Cloudflare Worker 发布

正式域名 `https://snnai.cn/` 沿用原 Cloudflare 账号中的 `snn` Worker。
不迁移域名，不向 Sites 添加自定义域名，不修改 API 和 SSH 子域名。

## 原发布链路

- 仓库：`https://github.com/PtPPPPP/snn`，分支 `main`。
- Cloudflare 构建命令：`npm run build`。
- 发布命令：`npx wrangler deploy --config dist/server/wrangler.json --name snn`。
- Workers Builds 自动提供 `WORKERS_CI=1`，Vite 据此加载
  `wrangler.production.json` 的实际 D1 绑定。
- 手动构建时设置 `SNN_DEPLOY_TARGET=cloudflare`，然后执行同样的构建、发布命令。
- 不要直接部署 `wrangler.production.json`；运行入口由 Vinext 构建生成。

数据库初始化命令：

```sh
npx wrangler d1 migrations apply snn-interview --remote --config wrangler.production.json
```

Native Sites 预览仍使用 `.openai/hosting.json` 的平台绑定。数据库 ID
不是密钥，令牌和其他凭据不能写入仓库。

## 阅卷认证和历史答卷

备份包含源码，不包含原 Sites 数据库里的学生答卷。本 Worker 的
`snn-interview` 是独立数据库；原 Sites 的数据没有删除，也没有迁入此库。

原 Sites 的 ChatGPT 登录由平台提供。直接部署到原 Worker 后，该平台登录
不会自动迁移。生产 Worker 清除外部传入的 Sites 身份头，阅卷接口保持拒绝
匿名访问。没有配置新的管理员白名单，也没有授权新账号。阅卷认证适配前，
请继续通过原私有预览的阅卷入口查看历史答卷。
