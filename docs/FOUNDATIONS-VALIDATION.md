# Foundations article: current scope and verification

2026-10-06. Canonical route: `/learn/neural-networks`.

## Current layout and state contract

The latest user direction supersedes the prior multi-page/sticky approach. The course is now one sequential article: short explanation → self-contained local interactive or display block → observation → next problem. Diagrams may repeat; each repetition belongs to its own independent experiment.

Seven blocks cover a manual neuron, perceptron learning, a separate XOR limitation, affine hidden layers, nonlinear activation, loss, and backpropagation/update. Each `InlineExperiment` creates a fresh deterministic model. Its controls and reset affect only that block. No model, history or running state is shared between blocks. No session-provider restoration, pinned visual, corrective scroll handler, inner scroll panel or multi-page navigation is used.

The six legacy lesson URLs redirect to matching article anchors. The existing rocket routes and mathematics are unchanged. Automatic training starts paused and pauses when less than a quarter of its own block is visible.

## Checked

- Existing seven mathematical tests still cover every-parameter finite differences, simultaneous updates, perceptron behavior, affine collapse, deterministic XOR training and degenerate affine contour handling.
- Three block tests establish deterministic fresh state, independent mutable arrays, no cross-block mutation, and the exact 75% starting accuracy of the illustrative XOR line.
- HTML checks verify seven local blocks, each containing its controls/visual/result; readonly details contain no mutating inputs, selectors or buttons; old routes redirect to the right anchors; homepage and original metadata stay intact.
- Source checks exclude sticky/fixed layouts and corrective-scroll/session-provider code from the routed article implementation.
- Lint, TypeScript, production build and artifact checks apply to the final version.

## Evidence limits

The user's prior screenshots proved the remote-slider problem. Own-cloud headless Chromium is blocked by a socket permission restriction; the natural private-Site browser route reaches a ChatGPT sign-in page. No authentication or token bypass was attempted. Browser/mobile rendering, actual touch, zoom and visual-viewport behavior have not been verified. Source and SSR checks are not visual acceptance.

The obsolete sticky-frame source and its tests were removed rather than left as hidden behavior. This version must not be described as passed on a real phone.

## 2026-10-06：独立三维特征示例

- 新增 hidden-space.ts/tsx/CSS，四个 XOR 角点用手设 ReLU 特征变为 000、100、010、111，得分 0、1、1、0。
- 七个新纯函数回归：角点/阈值、平面裁剪、过渡隐藏预测、正交投影/相机、全角度标签边距、每轮完成状态、连续象限目标的反例。加入正常 test:neural-foundations。
- 新增渲染 HTML/source 检查：块在激活与损失之间，有局部图/控制/读数，初始不显示完成预测和平面，没有固定场景/自动滚动。
- 单独将组件的初始与完成 SVG 栅格化查看，能验证图元与投影初步可辨识；这不是网页浏览器截图，也不验证移动端布局、实际拖动或触摸取消。
- 私人站鉴权与现有云浏览器限制未改变，完整浏览器交互验收仍未执行。不得将数学/SSR/矢量图检查表述为手机通过。

## 2026-10-06：神经元—公式—图像的开篇桥接

- 新增两块独立线性回归：固定三点 (0,1)/(1,3)/(2,5)，初始 w1/b1。图、单元、公式、残差、半均方误差共享同一快照。
- 先比较只改 w 或 b，随后可微调；动画期间所有显示值从同一插值参数重新计算。减弱动态跳过过渡。重置取消帧。
- 真正全批量导数，η=.3 同时更新到 w1.5/b1.3，L从5/6到31/300。数值差分回归验证全部计算；30步内条件损失图的对称有限差分与解析梯度一致。
- 修复独立审查发现的后期单边割线可能越过极小值而变号的问题：改为明确标注的对称差分，不把它当训练算法。
- 既有仿射网络补真实边界与重复的本地控件；损失段补受控概率对比；样本坐标和更新损失前后值就地显示。
- 仍未通过实际云浏览器/手机触摸执行；源码、服务端HTML、数学测试和SVG图元检查不能替代该验收。
