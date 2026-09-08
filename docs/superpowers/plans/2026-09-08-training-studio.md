# Training studio — fresh implementation

User authorizes a new version, not another edit of the prior visualization. Keep recorded PPO data and global navigation; replace the route's local UI, renderer and playback implementation with independent files.

- Cold white, fine rectangular divisions. Main visual takes the desktop left column; mobile/tablet stack. No controls above the visual except a compact stage legend. Playback immediately below it.
- Explicit 7 normalized inputs, complete incoming-weight matrices for 128/128/1 neurons, exact weight cell selection, and a visible policy-loss endpoint. Heat color denotes change relative to initialization with one fixed scale.
- Real 50-round dataset. Default 8×, fast 32×, slow .25×/1×; pause, scrub, round-step, restart. Reduced-motion starts paused; hidden tabs do not advance.
- Stable selected weight, not a randomly jumping explanation. Backward dependency curves terminate in exact source/target cells. First hidden layer uses all 128 downstream dependencies, drawn in one Canvas batch; output-layer dependency is the policy loss. Color of dependencies is separate from weight-change heat colors.
- Horizontal scan reveals column-major single-weight updates. Interpolation only illustrates recorded endpoints. Selected cell's before/after values, recorded gradient and forward input shown together. No claim that one downstream weight alone causes an update, or that one saved gradient equals the multi-step Adam update.
- New files: studio.tsx (loading, playback, controls, inspector), studio-network.tsx (new Canvas + SVG renderer and touch selection), studio-model.ts (geometry and gradient dependencies), studio.module.css (scoped styling). Change page.tsx import only; old renderer remains inactive.
- Verify coordinate and dependency invariants, endpoint recovery, playback/seek/touch/keyboard, no errors or document overflow at 390/820/1366 and landscape. Inspect screenshots and a short animation sequence. Run targeted lint and build.
