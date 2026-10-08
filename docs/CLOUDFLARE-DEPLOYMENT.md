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

2026-10-08 已把原 Sites 的 1 份答卷、3 条考生身份、3 条审计记录迁入
`snn-interview`；准考码表为空。迁入后逐字段确认数据一致。
原 Sites 数据仍保留。迁移快照、SQL 和正式库迁移前备份仅存放于被 Git
忽略的 `.wrangler/migration-20261008/`，不可上传至公开仓库。

阅卷入口：`https://snnai.cn/join/interview/review`。
正式站使用原 Cloudflare One 团队的邮箱验证，授权人沿用原 Sites 所有者。
邮箱白名单配置在 Worker secret `SNN_INTERVIEW_ADMIN_EMAILS`；不写入仓库。
Access 应用 `842bd2af-4257-4710-9379-f33b671aaff5` 仅保护阅卷页路径，
考生笔试保持公开。应用 AUD 存于 `wrangler.production.json`，属于公开标识。

Worker 清除外部 Sites 身份头，并使用 jose 校验 Access 签名、发行方、
AUD、有效期和必要身份字段后才向页面和 API 提供负责人身份。API 读取
主机名范围内的 Access Cookie，因此不要启用限制到阅卷路径的 Cookie 设置。
匿名和无权限请求不能读取答卷或评分。没有创建服务令牌或额外管理员。

原预览域名的考生浏览器 Cookie 不会跨域迁移；原已提交学号的唯一约束
继续有效。已登记但尚未交卷的学生换到正式域名时，如提示浏览器绑定不符，
由负责人核实后在阅卷台解除设备绑定，再让本人重新登记。
