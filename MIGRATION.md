# 在另一台电脑继续 SNN

这是一份代码与项目上下文快照，不是完整 Codex 账号/会话备份。不要只克隆 GitHub：大量新代码尚未提交。

1. 解压整个迁移包到短路径，如 `D:\Projects\SNN-transfer`；保留 `snn` 和 `history.bundle` 的相邻关系。
2. 安装 Git、Node.js 24.16.0（见 .nvmrc），登录新电脑的 Codex。
3. 在 `snn` 打开 PowerShell：`powershell -ExecutionPolicy Bypass -File .\scripts\Restore-Migration.ps1`。仅无 .git 时恢复历史与基线，保留快照文件，不提交改动。
4. 在 Codex 中打开该 `snn` 文件夹，发送下方接续提示。
5. 启动：`powershell -ExecutionPolicy Bypass -File .\scripts\Start-Local.ps1`。首次按 lockfile 安装依赖；控制台保持运行。访问 http://127.0.0.1:5173/play/rocket/train 。

## 复制给新 Codex

> 这是 SNN 项目的迁移快照。请先读 AGENTS.md、docs/CODEX-HANDOFF.md 和 MIGRATION.md，保留所有未提交代码，不要用远端版本覆盖。检查 Node 与 Git，按迁移说明启动 5173，在侧边栏打开 /play/rocket/train。重点恢复最新的网络前向、环境、反向求梯度、权重更新实验；不要恢复旧奖励筛选版。检查关键测试，告诉我恢复结果后再根据我的反馈继续。AI 服务当前只保留接口，不做真实调用，不发布部署。

## 检查命令

```powershell
node --test tests/network-learning.test.mjs tests/rocket-replay.test.mjs tests/rocket-experience.test.mjs
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npx.cmd vinext build
```

启动后可运行 `node .preview/check-network-learning.mjs`（Windows Edge），与 `node --test tests/site-responsive.test.mjs`。没有 Edge 时先安装对应浏览器或调整测试启动配置，不把缺浏览器报告成代码错误。

## 可迁移与不自动迁移

包含工作区、公开PPO权重、字体、测试、Git历史、设计交接与截图。不包含 node_modules、编译缓存、环境密钥、Codex数据库、登录令牌、浏览器Cookie/IndexedDB、本机进程或个人技能全集。

新电脑需要联网安装依赖；GitHub/Cloudflare/Sites等外部操作权限依账号重新验证；只有本地开发不需要这些发布凭据。.openai/hosting.json 是项目标识，保留但不要创建新站点或发布。当前 API 后端可用性不由此迁移保证。

聊天界面中的完整历史、模型可用性、插件配置可能不同；项目上下文通过 AGENTS.md 引导读取交接文件继续，不声称逐字恢复整个会话。截图为参考，不是验收结论。

非Windows：在 snn 中 `git init; git fetch ../history.bundle HEAD; git reset --mixed FETCH_HEAD`（仅初次、无Git时），然后 `npm ci` 与 `npx vite --host 127.0.0.1 --port 5173 --strictPort`。不要复制 Windows node_modules。
