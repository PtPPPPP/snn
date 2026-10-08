# 实际 Three.js 开场

主渲染依赖：three 0.186.1、@react-three/fiber 9.8.1、@react-three/drei 10.7.9。官方兼容范围覆盖本项目 React 19.2.6；不是 p5/Babylon 或原来的 SVG 代替三维。

- 概念折面是 Three BufferGeometry，使用已确认的 h(u,v) 曲面、法线明暗与真实深度。Drei OrthographicCamera 保留原构图（水平正交视锥反射用于匹配已确认 u−v 方向）；Drei AsciiRenderer 将真实 WebGL 帧转成单色字符。字符列数随屏幕调整，字体实际字宽用于防止行溢出。
- 分类平面、网格、分隔线与样本全部是第二个 R3F Canvas 的真实 Three 对象。ASCII 预测纹理由同一个分类函数生成并贴到平面。摄像机驱动来自现有演示与手势状态；8/8 与 XOR3/4 不变。
- 只改变观察角度，尚未把样本折叠或训练网络。标记的微小渲染深度偏移仅避免重叠闪烁，不进入模型计算。
- 按视野懒加载；渲染使用 demand 帧循环，DPR封顶1.5，单色ASCII，不对每字符创建彩色span。动画暂停、页面不可见、减弱动态沿用原逻辑；首次自动示范须等待WebGL就绪。
- R3F管理渲染器；场景显式释放自建geometry/texture，移除context-loss监听；Drei卸载时移除ASCII DOM。字体完成后的回调也校验卸载状态。
- 初始化失败、上下文丢失或代码加载错误会显示明确的二维降级预览，不声称三维已工作。降级仅允许静态查看两组，不自动演示。
- Node验证了实际Three投影与已确认坐标的对应、曲面顶点与颜色/法线；编译和SSR检查另行执行。当前云端没有完成真实GPU/触摸视觉验收，不能用源码或Node测试代替。

## 2026-10-06: false failure and interactive geometry correction

R3F 9.8.1 renders its `fallback` as ordinary children of the DOM canvas. The previous `CanvasUnavailable` effect therefore fired even when WebGL was healthy and incorrectly switched every scene to the software preview. Removed all side effects from Canvas fallback content. Real renderer configuration exceptions already propagate through Fiber's `configure(...).catch(setError)` and the outer boundary now retains the actual message; context loss is handled separately. A source regression prevents reinstating that effect.

Added actual Drei CameraControls with opt-in touch interaction, mouse rotation, bounded zoom, keyboard arrows/Home, and reset. Three Html labels follow the live camera. ReLU has a single bounded interpolation position, pause/resume/scrub, consistent geometry/selected coordinates/2D predictions/intersections, and explicit intermediate-state wording. Fixed ReLU curve and network topology distinguish mathematical activation from display interpolation. No runtime browser/GPU/touch pass is claimed in the authentication-blocked cloud environment.
