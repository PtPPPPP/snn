# Full PPO training playback

The training page now reuses `LessonNetwork` from the inference page: all 7 inputs, 128 + 128 hidden units, and the scalar policy mean are selectable. It replaces the former four-neuron Actor-Critic presentation. The original small-model utility and its numerical tests remain unused by this page.

Playback defaults to 8x. One recorded update is allotted 8 presentation seconds: 3 forward, 3 backward, 2 before/after comparison. The 8 records loop; seeking pauses. Browser playback does not execute training, manufacture parameter changes, or alter the challenge policy.

## Provenance

- Original repository: https://github.com/17362975180/drl-rocket-landing-control
- Source revision: 82bbe1b4ce414f7fce593c0e8159249e78fdac0d
- Checkpoint SHA-256: b88b87474538d5c49b361ab1d91bd8acd267d13bd6bdcd8398f069715414b40b
- Published JSON SHA-256: bce8a149a564de856c5954b19979b6da2b6455f1ef2f2f5101cc935a0f31a095
- Seed: 20260908; Stable-Baselines3: 2.9.0; Torch: 2.14.0+cpu.
- Actual continuation: 8 PPO rollout/update cycles, 2048 steps each (16,384 total), 10 epochs per update, batch size 64, Adam learning rate 0.0003, clipping 0.2, gamma 0.99, GAE lambda 0.95. Original policy, critic and optimizer state loaded. The collector state is reset with the recorded seed; this is not the original from-scratch history.
- Original energy environment, observation/reward normalization restored. Normalization continues updating during rollout; samples store the exact already-normalized observations used in that rollout. The displayed before/after comparison fixes those inputs, so normalization cannot masquerade as a weight change.

## What the diagram means

The complete **policy** network is shown; the independent value network is trained by SB3 but not drawn. Network output is the Gaussian action mean. Clipping to [-1,1] and mapping to [0,1] gives the displayed mean-action throttle; actual training actions include sampled exploration noise.

Each round stores full actor snapshots before/after (including all biases), the full-rollout initial actor gradient, and selected real samples with activation gradients. Blue/orange encodes sign. Faint low-contribution paths are omitted for drawing only. During backward display, edges use full-rollout weight gradients and hidden-node signals use the selected sample's contribution to the full-rollout loss gradient. These are distinct quantities, labelled in the UI.

Adam performs many minibatch updates. Do not describe the final weight difference as minus the learning rate times the single displayed initial gradient. The UI reports the actual saved difference.

## Verification and reproduction

Capture adapter: `scripts/capture-ppo-training.py`. It requires a Research Lab stage ticket and a config containing the source checkout, checkpoint/stat paths and hashes, revision, seed, rounds and output. It deliberately rejects direct training invocation. The capture uses register → validate → run → freeze → observe → decide → report. The decision is stop because the educational capture is complete; no formal performance experiment is requested.

This run's isolated protocol, config, copied Research Lab runtime and frozen receipts are in `.preview/ppo-capture/` (local working artifacts, excluded from Git). The adapter validates source hashes before training. Preserve that folder in migration archives to repeat its commands; point an installed Research Lab adapter descriptor to the shipped capture script for a fresh recording with a new output directory.

All 24 layer-by-round chain-rule checks compared every weight gradient against activation-gradient × layer-input sums; maximum error 0.0. The shipped dataset test checks all layer shapes, finite weights, checkpoint identity and changed parameters per round. Browser coverage checks 256 selectable hidden neurons, reverse/updated phases, 8x timing, round seeking, neuron selection and responsive overflow. No claim of improved landing performance is made.

## Weight-first visual update

The training diagram now keeps weights as the subject throughout playback. Default structure mode colors edges by signed actual weight and nodes by their largest-magnitude incoming weight (not activation). Grey rings compare that summary before the update on a shared per-layer scale. A separate change view displays exact saved after-minus-before deltas. Purple denotes positive weights (or increases in change view); teal denotes negative weights (or decreases). The selected incoming edge is highlighted, with old + delta = new and an expandable complete incoming-weight table. Forward/backward animations indicate direction only; intermediate optimizer weights are not synthesized. Inference retains its blue/orange palette.

## Heatmap / 50-round initialization capture (current UI)

Current UI loads `ppo-initialization.json` and its content-addressed `.bin`, replacing the eight-round continuation playback. The new source run is `.preview/ppo-initialization-50/`: 50 actual PPO updates, 102,400 samples, fresh SB3 orthogonal initialization, original action-mean bias -0.9, fresh observation/reward normalization, seed 20260908. No checkpoint policy or optimizer is loaded in this run. Full local protocol and freeze/observe/report receipts are preserved there. `scripts/package-ppo-heatmap.py` packs all saved weights and gradients as lossless little-endian float32. The manifest includes source-record and binary SHA-256 hashes. The earlier checkpoint-continuation artifact is retained separately.

All 17,408 policy connection weights appear as heatmap cells. Color is saved current weight minus its own initialization value, so initialization is uniformly neutral although the underlying initial weights differ. A fixed scale uses the 99th percentile of absolute deltas across all 50 rounds and all layers, with outliers saturated and the numeric cutoff displayed. Warm indicates increased weight; cool indicates decreased weight. Biases remain available in the inspector. The light sweep is decorative, pauses with playback and is disabled for reduced motion; it never changes the values read by the inspector.

Default overview is 32x (about 12.5 seconds for 50 presentation rounds, plus a one-second initial hold). Slow preset is 1x; selectable speeds reach 64x. Seeking pauses, round buttons move back/forward, and the initial hold repeats only at the start of a loop. No performance improvement is claimed.
