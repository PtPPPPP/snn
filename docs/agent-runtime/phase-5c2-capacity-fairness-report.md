# Phase 5C2 Freeze Report — Public Agent Capacity, Queueing & Fairness

Spec: `docs/agent-runtime/phase-5c2-capacity-fairness-goal.md` @974b3fb
Baseline: `main@8ec93f3` (frozen, Phase 5C1 READY)
Branch: `feat/phase-5c2-capacity-fairness`
Verdict: **PHASE_5C2_PUBLIC_AGENT_CAPACITY_PARTIAL** (all in-scope deliverables verified; one pre-existing DSH-layer intermittent regression is recorded as a known issue and is outside the allowed fix boundary)

## 1. Capacity table (real Qwen, public api.snnai.cn path)

| Scenario | Owners × runs | Admitted | 429 | 5xx | Total spread | First-model event ladder |
|---|---|---|---|---|---|---|
| SINGLE_RUN_BASELINE (5 sequential) | 1×5 | 5/5 | 0 | 0 | total P50 6.8s, max 10.2s | first-model P50 1.8s |
| C2 | 2×1 | 2/2 | 0 | 0 | 13.5s | ~+2.5-3s per queued run |
| C4 | 4×1 | 4/4 | 0 | 0 | 30.2s | ~+2.5-3s per queued run |
| C6 | 6×1 | 6/6 | 0 | 0 | 43.1s | ~+2.5-3s per queued run |
| C8 | 8×1 | 8/8 | 0 | 0 | 62.0s | ~+2.5-3s per queued run |

- Effective throughput at the DSH/llama boundary: ~7.5-8s per run, strictly serialized (`llama-server --parallel 1`, untouched).
- Admission at the AI Node boundary is non-blocking: all C-scenario runs admitted instantly (global cap 20 pre-policy >> 8).
- Post-load health: service active, ERR_COUNT=0, no OOM, no journal errors.

## 2. CURRENT_CAPACITY_CONTRACT (post-policy, deployed RC2 = 8f18d56)

- `SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_GLOBAL=4` and `SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_PER_OWNER=2` in production `ai-node/.env` (backup: `.env.before-p5c2-<stamp>`).
- Over-cap submission → HTTP 429, code `AGENT_PUBLIC_RUN_LIMIT_GLOBAL` / `AGENT_PUBLIC_RUN_LIMIT_PER_OWNER`, header `retry-after: 2`. Static session caps keep no retry-after (unchanged).
- Admitted-but-queued run emits `run.waiting` (payload `reason:"model_pending"`) at admission, then exactly one `run.active` when the first real model stream event arrives (DSH bookkeeping traffic — `session.status`, `turn/start`, `step/*` — does NOT trigger it; verified in production: `run.active` timestamp == first model event timestamp, e.g. 9627ms == 9627ms).
- `run.started` remains the first event and carries `runId`, so queued and active runs are both cancellable (counter release verified for all 5 terminal paths in deterministic tests).
- Counters are released on every terminal: `run.completed` / `run.incomplete` / `run.cancelled` / `run.failed` / transport fallback; leak tests cover cancel-while-queued and cancel-while-active.

## 3. Fairness

- Observed on C2-C8: admission order == model start order (FIFO within each wave); partial terminal overlap at C6/C8 confirms the boundary is DSH, not the AI Node queue.
- Per-owner cap (2) prevents a single owner from monopolizing the 4 global slots; per-owner bypass of the global cap is impossible (global is checked after per-owner).

## 4. FIRST_QUEUE_BOUNDARY

The queue boundary is the DSH/llama-server serialization edge (`--parallel 1`, quantization, and context size all frozen). The AI Node admits instantly up to the configured caps; waiting is real (client-visible), bounded (4 global), and honest (no fake progress).

## 5. Configuration & fail-safety

- Capacity keys are plain env vars; invalid (non-numeric / zero / negative) values fall back to safe defaults at startup — a bad config can never disable bounded admission.
- Deployed via 4-guard git-bundle rollout (HEAD==prereq + clean tree; bundle verify; fetched==target; delta file whitelist) with `node --check` before restart; production .env backed up before mutation.

## 6. UX

- `lib/agent-client.ts` gained optional `onWaiting`/`onActive`; `app/ai/use-agent.ts` exposes `waiting`; `app/ai/chat` renders "模型繁忙，Agent 排队等待中…" with `data-testid="agent-waiting"` while queued, switching to "Agent 正在处理" on `run.active`.
- 429 responses surface as concise Chinese errors; no session corruption (verified in the public e2e suite).
- NOTE: the website CI workflow has no auto-deploy step; the waiting UI reaches visitors only after the next website deployment (server-side contract is already live on AI11).

## 7. Test evidence

- Deterministic: `ai-node` 39/39 (incl. new `agent-capacity-waiting.test.mjs` ×3); full suite 274 tests / 221 pass / 0 fail / 53 skipped; `tsc` 0 errors; `eslint` 0 problems.
- Public BFF e2e + RC acceptance over api.snnai.cn (real Qwen): warmup, C2, C4 all pass with truthful waiting; cap+1 (C5) = 4 admitted + exactly 1× 429 `AGENT_PUBLIC_RUN_LIMIT_GLOBAL` with `retry-after:"2"`.
- Phase 5C1 regression (`tests/workspace-agent-nl-real-model.test.mjs`): Cases A-E pass. Case F (max-tokens → `run.incomplete`) is intermittent: 3 of 4 node-test runs failed (~21.4s bare `run.completed` via terminal fallback), while a standalone probe of the identical prompt against the same deployment succeeded (65.7s, `run.incomplete {"reason":"max_tokens"}`, 7167 chars). Root cause sits in the DSH layer ending some turns without `turn/end`; the runtime fallback (pre-existing, Phase 5C1) keeps clients from hanging. The 5C2 diff does not touch the terminal path (deterministic adapter test green), and pinned DSH 852ae532 is unchanged — fixing it would require touching the frozen DSH/DSH-config, which is outside this goal's hard safety boundary.

## 8. Safety boundaries honored

- No changes to `llama-server --parallel` / quantization / context; max intentional concurrency 8.
- Pinned DSH 852ae532 unchanged; no shell tool exposed; AI11 origin never published; no destructive load; no external queue (Redis etc.); no system reboot.

## 9. Git state

- `origin/feat/phase-5c2-capacity-fairness` = 8f18d56 (`run.active` truthfulness fix) ← 3333dc9 (waiting state + retry-after) ← 974b3fb (spec) ← 8ec93f3 (main baseline).
- AI11: detached at 8f18d56, `snn-ai-node.service` active, capacity keys live. `main` remains 8ec93f3 (no merge performed — not requested by this goal).
- Known-issue follow-up (out of scope): DSH-layer intermittent missing `turn/end` under load/state changes (Case F); recommend a dedicated DSH-focused investigation before the next capability phase.

## Artifacts

- Spec: `docs/agent-runtime/phase-5c2-capacity-fairness-goal.md`
- Audit log: `.sites-runtime/p5c2-audit.md` (local working evidence)
- Harnesses: `.sites-runtime/p5c2-capacity-client.mjs`, `p5c2-capacity-scenario.mjs`, `p5c2-casef-probe.mjs`, `p5c2-ai11-deploy.sh`
- Raw runs: `p5c2-s7-baseline.jsonl`, `p5c2-c{2,4,6,8}.jsonl`, `p5c2-rc{,2}-*.jsonl`, `p5c2-casef-*.log`
