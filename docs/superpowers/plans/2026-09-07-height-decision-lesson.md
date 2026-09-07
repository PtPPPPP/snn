# Height decision lesson implementation plan
Approved design: standalone page, fixed baseline, height-only intervention, whole 7-128-128-1 network, overlaid before/after, automatic staged playback with pause/back/next. Explain numeric calculations with actual model values. Height also changes braking energy input. No claims of unique causal paths.
1. Implement reusable pure comparison state for stages and numerical explanations; test input dependency and final layer reconstruction.
2. Implement standalone client lesson and network SVG, complete node counts and sampled incoming edges for selected node; baseline remains visible.
3. Add game link carrying snapshot to new tab; pause source game so it remains resumable. Keep old diagnostics under separate advanced entry.
4. Validate lint/build, targeted tests, browser stage controls and mobile layout.
