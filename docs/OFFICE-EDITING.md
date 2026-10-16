# SNN AI Office 文件编辑

本次开发基于 GitHub `main` 提交 `f5ac8bb3d5e208aebc9a0773add4d09b60edc218`。2026-10-16 核对时，本地全部 387 个远端已跟踪文件与该提交一致；恢复了缺失的 `.git`，保留本地独有文档。修复保存在工作区，尚未推送或部署。

## Excel 数据列修改

1. `workspace.spreadsheet.inspect({file_id})` 发现多工作表名称。
2. 指定 `sheet` 和 `range`，例如 `B1:B100`，取得单元格地址、值、公式与文件版本。单次范围最多 400 个位置；大列分范围读取。
3. `workspace.spreadsheet.patch` 使用 `operation: "updateCells"`，`expected_version` 为刚读取的版本，`edits_json` 为 JSON 字符串，例如 `[{"cell":"B2","value":42}]`。每批最多 100 个单元格。
4. 后续批次使用前次 `newVersion`，修改后重新 inspect 验证真实值。

仅更新已存在的数据单元格，值支持字符串、有限数字、布尔值和 null（清空值）。字符串以普通文本写入，不能用于注入公式。拒绝覆盖公式及共享/数组公式范围，拒绝合并单元格与受保护工作表。尚不支持增加空白单元格、创建列、编写公式或调整样式。

修改路径直接更新目标 worksheet XML 的值节点，保留单元格样式、其他单元格以及其他 ZIP 部件的原始解压字节，仅额外设置 workbook 重算标志。保留公式与旧缓存，Excel 打开文件时重算；本服务没有公式引擎，预览可能显示上次缓存，不能据此声称新公式结果已经验证。

旧 `deleteRows` 操作保持兼容，仍使用 `column` / `equals` 的唯一匹配；其能力不等同于 Excel 的完整结构编辑。

## Word 正文润色

`workspace.word.inspect` 返回版本、概览、段落列表及 `nextOffset`。使用 `offset` / `limit` 分页读取，不能把 2000 字符概览当成全文。每页最多 20 个文本段落、20000 字符；超长段落会明确标注截断。

`workspace.word.patch` 接受 `find` / `replace`（各最多 16000 字符）、当前 `expected_version` 和可选 `paragraph` 索引。默认要求唯一匹配；明确需要批量替换时使用 `replace_all`。可以跨同一段落内的多个 Word 文本 run 匹配，不能跨段落或制表/换行标记匹配。

替换保留段落、表格与 run 属性，未变化的前后文字保留原 run 样式，变化文字继承插入位置的样式。优先逐短语修改以保留段内多处不同强调。修改正文长度可能改变换行与分页；结构和样式属性验证不等于 Word 排版的视觉验收。页眉页脚、批注、修订模式、样式编辑和旧版 `.doc` 不在此次能力范围内。

## 网站与运行时

网站仍通过 SNN API / Gateway / AI Node 访问受限工作区插件，不向浏览器暴露 Harness 或任意二进制写入。Office 预览复用现有有界解析器，返回纯文本，不显示可直接保存的文本编辑器；原始排版通过下载查看。文件发生变化时，已打开的预览显示刷新入口。

前端、AI Node 及其子进程插件必须一起更新，AI Node 需要按既有运维流程重新启动以载入插件。只发布前端不能让旧后端获得改单元格能力。已有会话每次 run 都重新解析 SNN skill 指令；运行时进程仍需重启以加载工具实现。

## 验证边界

本地测试覆盖 XLSX 批量改单元格、公式和其他部件保留、版本冲突与失败批次原子性；DOCX 跨 run 修改、重复文本段落定位、长文档分页、边界空格及文档部件保留；公开预览接口继续校验会话归属并保留下载内容。

线上只读状态检查确认模型和 Agent 标记为 ready，但 `modelToolCallingVerified` 为 `unknown`，不能据此认定真实模型能稳定完成上述任务。此次没有执行生产文件修改、真实模型验收或发布。

本次实际检查结果：

| 检查 | 结果 |
| --- | --- |
| AI Node 全套 `node --test ai-node/test/*.test.mjs` | 227 通过，53 跳过；跳过项需要固定 DSH 构建 |
| Gateway 与会话/响应式状态测试 | 44 通过 |
| TypeScript `tsc --noEmit --incremental false` | 通过 |
| 修改文件的 ESLint、`git diff --check` | 通过 |
| Vinext 生产构建、生产产物检查 | 通过 |
| 生产构建上的 Agent / 移动端浏览器回归 | 43 通过；使用本地 Wrangler 提供 Cloudflare 运行时，API 响应由测试模拟，不代表真实模型验收 |
| 真实模型自然语言用例 | 8 跳过；未配置真实模型验收环境，含新增的 Excel 改列与 Word 润色用例 |
| 全库 ESLint | 未通过：未改动的 `app/join/interview/interview-form.tsx` 与 `review/recruitment-result-panel.tsx` 各有一处 `react-hooks/set-state-in-effect` 错误；另有原有匿名默认导出 warning |
| 原 `rendered-html` 与 Node 浏览器服务器 | 无法直接加载生产 Worker 的 `cloudflare:workers` import；未更改原检查脚本。本地浏览器验证改用真实 Cloudflare 运行时，不能将原 HTML 检查记作通过 |

本地验证配置与日志位于 `.git/`，不提交；浏览器截图位于被忽略的 `.preview/`。工作区 diff 为此次交付，不包含本地原有独有文档的修改。
