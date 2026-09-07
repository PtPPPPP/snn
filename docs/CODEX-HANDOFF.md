# SNN：给下一台电脑的 Codex

交接快照：2026-09-07。读取本文后先核验当前文件，不要重新从 GitHub 克隆覆盖本工作区。迁移包包含未提交工作；远端 HEAD 3912d47 不包含完整火箭教学功能。

## 用户与协作方式

- 中文交流，直接执行已批准工作，少重复确认。先说实际完成什么，诚实说明验证边界。
- 项目是 SNN 科技社团网站，教学面向高中生/新生。不是通用聊天机器人换皮。
- 美术是冷白、蓝灰、科技极简，蓝色正值、橙色负值，绝对值决定深浅；不要重新换成花哨游戏皮肤。
- 手机、平板竖屏、横屏、电脑都要照顾。首屏应展示完整主要内容；操作、时间轴、选择对象、解释应靠近。不能只用 overflow:hidden 遮问题。
- 用户讨厌静态可视化和长篇公式墙。要流畅动画、实时数值、可暂停与单步、可选择对象的真实计算。默认高中数学：逐项相加、乘系数、变化方向。专业公式折叠。
- 用户不满意的方案必须替换，不叠加更多旧 UI。不恢复 Standard PPO 对手、旧进阶分析、按钮长按油门、只放大火箭图标。
- 当前只本地开发；没有授权此次迁移时部署、推送或恢复 AI 服务。不把移动电脑理解为发布。

## 五个页面

1. `/` 社团首页；`app/globals.css` 等保存响应式改动。
2. `/ai` 原有聊天界面；保留流式、历史、取消、IndexedDB、Gateway 边界。
3. `/play/rocket` 人类与真实 Energy PPO 对战。水平连续油门；手机大触控区；平衡油门标记、AI 油门标记；独立高度坐标缩放、速度/高度提示；0.125/0.25/0.5/1 倍速度。
4. `/play/rocket/explain` 真实 PPO 推理实验。自动循环轨迹，选择输入/隐藏神经元/输出、前后状态、贡献连线和高中公式；AI 答疑只接接口。
5. `/play/rocket/train` 最新重点：网络怎样学习，已替换此前失败的奖励参数搜索版。

## 最新训练页——当前实现，不是原 PPO

用户明确纠正：聚焦网络前向传递、状态更新、反向求梯度和权重更新；奖励只是其中一环。参考 TensorFlow Playground、动手学深度学习计算图、Spinning Up。

- `app/play/rocket/train/training-lab.tsx` + `network.module.css`。
- `lib/rocket/network-learning.ts`：教学 Monte Carlo Actor–Critic，输入 h/50、v/20、fuel/5 → 4 tanh 隐藏单元 → 3 softmax 策略输出（0/50/100% 油门）及 1 价值输出。28 条连线、8 偏置，共 36 参数。
- 随机初始化，固定种子；每批 4 次实际飞行，0.01 秒积分、0.1 秒动作决策、最多 20 秒。没有使用预训练网络，也不保证学会降落。
- 回报折扣 .99，优势=折扣回报−采集时旧价值估计，优势冻结。策略损失 −A log p + 价值损失 .5(V−G)^2，整批平均，手写反向传播，SGD 学习率 .03。没有 PPO 裁剪、没有穿过物理环境求导。
- `learnBatch` 预计算下一组权重用于对照；用户点“应用本批权重更新”，再“用新网络收集下一批”才推进训练。自动讲解只轮播四阶段，不自动训练。
- 网络图、经历时间轴、连接选择、计算详情共处；连线贡献/梯度/调整量有明确阶段图例。支持点选、键盘、手机下拉，图表内部横向滚动。
- 默认奖励：成功+1，其他结束−1，每kg燃料−.1，每秒−.02，与原项目不同。
- 旧 `lib/rocket/training.ts`、`training.module.css`、`rocket-training.test.mjs` 已删除，不要恢复。旧 `2026-09-07-rocket-training.md` 仅历史方案，被 `2026-09-07-network-learning.md` 取代。
- 最近用户只要求迁移，尚未确认最新训练页视觉完全满意；不要把测试通过说成用户验收通过。

## 真实 PPO 与推理页

- `public/rocket/energy.json` 保存真实权重和来源 revision；7→128 tanh→128 tanh→1 linear；输出裁剪映射至连续油门。
- 来源 https://github.com/17362975180/drl-rocket-landing-control 。不是教学 Actor–Critic 的训练历史。
- `lib/rocket/physics.mjs` 复用火箭物理；DT .01，PPO 每 .05 秒决策。默认50m、燃料5kg，干质量10kg，g9.81，最大推力300N。
- `lib/rocket/replay.mjs` 保存实际观测与 trace 对齐；终止帧保留最后一次真实决策。
- 推理主页面历史命名 `height-lesson.tsx`；完整网络 `lesson-network.tsx`。不要被命名误导为只能改变高度。
- 曾因17000条SVG动画边卡死。现采用Canvas按贡献分桶、每层强边限制、极少SVG动画；所有数值计算保留全部权重。不可重新给全部线开动画。
- 手机在128神经元矩形层上按住上下左右滑选；native nonpassive touchstart/touchmove 防浏览器取消 pointer；层外正常滚动。不要恢复滑选开关。
- `rocket-tutor.tsx` 用户授权仅接口，无真实模型测试。api.snnai.cn 曾不可用，不要捏造回答或主动恢复服务。

## 最新验证与仍需关注

- `tests/network-learning.test.mjs`：每一个参数的反向梯度对照中心差分，误差<1e-5；精确SGD更新、采样物理状态、原权重不变。
- 六尺寸训练页检查：320×568、390×844、768×1024、820×1180、844×390、1366×768；连接选择、经历拖动、梯度、应用、下一批，均通过 Chromium/Edge 模拟。
- 其他4页：7尺寸回归，site-responsive.test.mjs。真实手机Safari、软键盘与安全区尚未经真机验证。
- 最新 lint 0 errors，原 playwright.prodcheck.config.mjs 一个匿名默认导出 warning；tsc 与 vinext build 通过。
- 字体已自托管在 public/fonts 与 app/fonts.css，修复 Windows next/font 的绝对路径错误。不要改回远程字体生成。
- `.preview` 本为临时脚本；迁移包保留关键网络/推理触摸检查与参考截图，其他旧脚本可能失效，优先最新源码及本文。

## 继续工作的正确起点

1. 读 MIGRATION.md，恢复 Git 基线，安装锁文件依赖，启动 5173。
2. 打开训练页，核对真实梯度流程；向用户报告到达同一版本，等待其下一条具体反馈。
3. 保留真实计算/教学示意/未验证推测之间的区别，不能以相关性断言神经元因果含义。
4. 技能或插件未安装不等于项目无法开发：核心通过源码、Node、Git、Playwright 完成。新电脑自行配置 Codex 账号与需要的插件，不复制旧电脑认证库。

参考：https://playground.tensorflow.org/ 、https://d2l.ai/chapter_multilayer-perceptrons/backprop.html 、https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html 。
