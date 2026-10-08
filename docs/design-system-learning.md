# SNN foundations: current reading and interaction system

2026-10-06. Authoritative direction: one long, normally scrolling article at `/learn/neural-networks`. Earlier multi-page and pinned-scene approaches were replaced after explicit user feedback. Do not restore them.

## Reading structure

Use short explanation → complete local interactive/display block → observation → next problem. A visual may appear again later when that paragraph needs it. Reuse code, not a single remote visual instance. No pinned diagram, focus-driven page movement, inner-scroll panel or compulsory next-page journey.

Pedagogy: simple problem → simple method → solve → new problem → limitation → motivated new method. Introduce neural-network ideas because the example needs them, not as a name catalog. Current sequence: separable points, manual neuron, perceptron repair, XOR limitation, affine hidden layers, nonlinearity, loss, backpropagation and parameter update.

## Local state

Each `InlineExperiment` owns a deterministic state instance. Parameters, selection, history, training and reset affect only that block. No shared session provider or offscreen master figure. Refresh restores fixed initial conditions. If a future comparison copies a state, that action must be explicit and labeled.

Controls, their immediate numeric readout and their local visual belong in the same block. Lower derivations are readonly. Automatic training starts paused; it can be paused manually and stops when its own block leaves the main view.

## Visual system

Reuse `app/design-tokens.css`: background #f7f8fa, surfaces #fcfcfd / #f0f2f5, primary text #202630, secondary #505b6b, muted #606b7b, accent #416582. Borders are thin blue-grey; controls use the existing 6–10px radii. Keep the Logo and site navigation.

Use the existing font stack. Geist/Geist Mono are self-hosted; Chinese uses the existing system fallback stack. Reading prose is 15–16px, ordinary labels 13–14px, numeric/select inputs 16px on phones. Avoid tiny 8–10px SVG labels by using adequate graph width and readable adjacent HTML values. No neon, confetti, generic dashboard card grids or copied third-party skins.

Class 0 is a brown square, class 1 a blue circle. Point shape/color always means the true label; the background comes from current model prediction, and × marks a current error. In network diagrams blue/brown instead encode signed weights, with explicit +/− text and a local legend. Correctness must be written explicitly, not inferred from a numerical sign color.

## Calculation boundaries

The hard-threshold perceptron and its mistake rule are distinct from differentiable MLP training. The MLP has 2→4→1 units, 12 weights and 5 biases. Loss is stable logit BCE. All batch gradients use the same old parameters; updates are simultaneous. Separate single-sample gradients from batch averages.

Multiple affine layers remain affine. A linear classifier cannot classify all raw XOR points, but it can classify three of four corners: never claim a universal 50% ceiling. Near a constant affine output, avoid drawing cancellation-noise contours. Predictions are not guaranteed calibrated probabilities; fitting synthetic training points does not demonstrate generalization.

All visual values and curves come from actual computation. Distinguish a hand-constructed representation from a trained model and visualization interpolation from optimization.

## Accessibility and validation

Native controls and details; 44px minimum interactive targets; sliders have numeric input alternatives. Plotted points/nodes also have keyboard activation or a local selector. No automatic camera movement or unexpected page scrolling. Respect reduced motion.

Math, immutable state and SSR/route tests are necessary but not proof of mobile usability. Actual phone rendering/touch remains unverified until an authorized browser can access the private preview. See `FOUNDATIONS-VALIDATION.md` and `INTERACTION-VISIBILITY-ACCEPTANCE.md` for current evidence boundaries.

## References and reuse

Math: [D2L MLP](https://d2l.ai/chapter_multilayer-perceptrons/mlp.html), [D2L backprop](https://d2l.ai/chapter_multilayer-perceptrons/backprop.html), [Deep Learning ch.6](https://www.deeplearningbook.org/contents/mlp.html), [Rumelhart et al. 1986](https://www.nature.com/articles/323533a0), [Glorot & Bengio 2010](https://proceedings.mlr.press/v9/glorot10a.html), [stable BCE](https://www.tensorflow.org/api_docs/python/tf/nn/sigmoid_cross_entropy_with_logits).

Interaction research: [TensorFlow Playground](https://playground.tensorflow.org/), [CNN Explainer](https://poloclub.github.io/cnn-explainer/), [Distill Momentum](https://distill.pub/2017/momentum/). Borrow concepts and independently implement the interface. Public reading is not a figure/media reuse license; code and content licenses differ. No third-party visual assets or substantial source code are copied by this module.

## 局部三维表示与完成反馈

- 非线性段落追加一个独立、手设的 2→3 隐藏表示；不替换其他 2→4→1 可训练块。
- 四个角点与三个特征均有真实坐标。滑块是显示高度 t·h3，期间不对过渡位置做预测；只有完整展开后显示真正的分类平面。
- 斜视默认固定，读者可横拖旋转或用方向键、斜视/俯视按钮。手机纵向手势保留普通阅读，不跟踪全局指针、不自动移动页面。
- 完成反馈就在局部控件旁，明确“这四个点”，静态勾号和可持续阅读的文字，不推断读者已掌握、不说经过训练、不推广到更多点。每次“重新看一遍”重新开始一次展示；切换视角不影响模型。
- 三维图的符号始终表示真实类别；数值得分不是概率。默认无镜头动画、无音效。减弱动态模式同样能完成全部动作。

## 公式、单元与图形的因果对应

开篇使用两段真实 1D 回归实验，之后才明确切换到两个输入的分类。预测线上的每一点都来自同一个线性单元；分类边界图两轴都是输入，含义不同。

- 每块的所选输入、连接乘法、偏置求和、代入公式、空心预测点、纵向误差与损失必须来自同一个纯函数快照。真实标签/数值只用于输出后的比较。
- 模仿 MLU 的因果连续性，先作同一起点下的单参数比较，再开放微调。750ms 参数过渡的每一帧都重新计算全部相关视图；不是最终公式配一条插值假曲线。无环境动画、自动训练或强制答题。减弱动态直接显示端点。
- 权重选择同时强调连接、公式系数和图上的斜率三角；偏置选择对应求和、常数项与截距。坐标尺度固定。
- 平方误差、单点损失与平均目标分开命名；本例使用半均方误差 Σe²/(2N)。三项代入必须可见，不能仅给一个损失数字。
- 更新前先显示全部样本的真实梯度算式；一次应用从同一份旧参数同时更新 w、b，明确展示两式。参数曲线是一维条件切片，保留旧快照并标明固定的另一参数；不把联合更新后的损失放在旧切片上。
- 下游修正：线性隐藏层既有节点图，也在另一个完整局部小块里重复控件并给出真实边界；概率0.6/0.9为独立受控比较，不冒充随机初始网络的输出。

## 分类变化与本轮完成反馈

- 分类背景固定为棕色预测0→蓝色预测1的模型输出渐变，保留真实标签的■/●形状；明确这不是校准后的把握。边界加深到1.8px，数值正负配色不改变。
- 只有同一个选中样本、模型确实变化且预测翻转，才显示局部“0→1／1→0、真实类别、当前分对或分错”提示。单独换样本不触发翻转提示；普通提示不作实时语音播报。
- 完成目标严格为：三个拟合点损失恰为0、当前36个分类样本全对、四角点完整展开且真实分隔平面可见。没有泛化或掌握程度结论。
- 每个互动块有自己的尝试计数。初始正确状态不庆祝；本轮模型从未达成→达成才触发一次1800ms图框强调、局部勾号与准确计数。只有重置该块才开启新一轮。条件失去时立即撤下完成说法。
- 减弱动态保留相同计数、文字与定时静态轮廓，不播放脉冲；无音效、弹窗、滚动或焦点转移。过期定时器同时校验事件编号与尝试编号，不能清除后来一轮的反馈。
