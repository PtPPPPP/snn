# Phase 5C1 — Secure Workspace File Agent: Final Capability Report

Sections 54–58. Every value below was read from the current worktree and verified
by the test runs recorded in Section 58. Nothing is asserted from memory.

Safety boundary preserved throughout: **no shell is granted to any public
capability**, and the **pinned DSH `852ae532` is used read-only** (as an
`SNN_DSH_ROOT` target for the E2E suite) and is **not modified**.

---

## Section 0/1 — CURRENT_CAPABILITY_MATRIX

Read-only audit of the current worktree, classified per the objective's five
statuses. Evidence for every CONFIRMED row is the code cite in Sections 54–57
plus the green test runs in Section 58.

| # | Capability (objective) | Status | Evidence / note |
| --- | --- | --- | --- |
| 1 | `workspace.list` discovery | **CONFIRMED** | 4-layer wiring (§54); green E2E `public upload/list/delete ... reaches real DSH` |
| 2 | `FILE_CAPABILITY_REGISTRY` / `TEXT_EXTENSIONS` (`.css` regression) | **CONFIRMED** | single 31-ext registry, 5 consumers (§55); frontend mirror identical (`lib/agent-client.ts`) |
| 3 | four-layer limit split (upload/preview/edit/extract) | **CONFIRMED** | `FILE_LIMITS` (§55); green `public upload cap and workspace quota ... without drift` |
| 4 | 16 MiB attachment contradiction fix | **CONFIRMED** | `ATTACHMENT_LIMITS` = 8×50 MiB = 400 MiB metadata-only (§55) |
| 5 | max-tokens terminal semantics (`run.incomplete` ≠ `run.completed`) | **CONFIRMED** | backend→client→hook→UI end-to-end (§56); adapter+runtime unit tests **plus** `public max-tokens run ends as run.incomplete over SSE, never run.completed` proven through the **real DSH runtime + public BFF SSE** (finish_reason `length` → `run.incomplete`, no `run.completed`) |
| 6 | DOCX cross-run replacement | **CONFIRMED** | `wordprocessing-service.mjs`; green cross-run + table-cell + fail-closed tests |
| 7 | normal-chat output limit configurable | **CONFIRMED** | `config.mjs` default 4096, clamp 8192 (§58) |
| 8 | runtime readiness real (not stubbed) | **CONFIRMED** | `runtime-readiness.mjs` live capability resolution (§57); frontend type mirrors it |
| 9 | NO-SHELL production boundary | **CONFIRMED** | `workspace.execute` granted to no skill; green `public agent capability surface exposes no shell-style execution tool` |
| 10 | pinned DSH `852ae532` unmodified | **CONFIRMED** | HEAD `852ae5321a`, `git status` CLEAN after the E2E run |
| 11 | public BFF path (upload/preview/edit/extract/SSE/CORS/ownership) | **CONFIRMED (offline)** | full public E2E green against pinned DSH with a mock LLM (§58) |
| 12 | real-model NL acceptance (AI11 Qwen) — harness | **CONFIRMED** | `tests/workspace-agent-nl-real-model.test.mjs`, 6 NL cases, skips clean (exit 0) |
| 13 | real-model NL acceptance — **live execution** | **UNKNOWN** | gated: needs a live deployment + server-side Qwen credential; cannot be proven offline |
| 14 | AI11 capacity retest (concurrency/throughput) | **UNKNOWN** | gated: needs the live AI11 public endpoint |

No row is **STALE** (no previously-claimed fix was found inaccurate) and none is
**PARTIALLY_FIXED** at the code layer — the only open rows (13, 14) are UNKNOWN
strictly because they require external live state, not because code is missing.

---

## Section 54 — Capability matrix (what the agent can and cannot do)

### Registered built-in tools (`ai-node/src/agent/built-in-tools.mjs`)

13 product-owned tool metadata entries (12 original + `workspace.list`):

| Tool | Risk | Category |
| --- | --- | --- |
| `workspace.read` | READ | workspace |
| `workspace.extract` | READ | document |
| `workspace.open` | READ | document |
| `workspace.list` | READ | workspace |
| `read` | READ | workspace |
| `write` | WRITE | workspace |
| `edit` | WRITE | workspace |
| `workspace.spreadsheet.inspect` | READ | spreadsheet |
| `workspace.spreadsheet.patch` | WRITE | spreadsheet |
| `workspace.word.inspect` | READ | document |
| `workspace.word.patch` | WRITE | document |
| `workspace.execute` | EXEC | process |
| `workspace.fetch` | EXTERNAL | network |

### Capability profiles (`ai-node/src/agent/capabilities/built-ins.mjs`)

Two skills bind subsets of the registry via `requiredTools`:

- **`workspace-reader`** (read-only): `workspace.list`, `workspace.read`,
  `workspace.extract`, `workspace.open`. Instructions state it "cannot write
  files, execute commands, or fetch network content."
- **`workspace-editor`**: `workspace.list`, `fs.read`, `fs.write`, `fs.edit`,
  `workspace.open`, `workspace.extract`, `workspace.fetch`,
  `workspace.spreadsheet.inspect`, `workspace.spreadsheet.patch`,
  `workspace.word.inspect`, `workspace.word.patch` (11 tools). Instructions end
  with "Never use shell, delete, move, or execute tools."

### NO-SHELL invariant (CONFIRMED)

`workspace.execute` is present in the registry but is **not in any skill's
`requiredTools`**, so no public capability can execute a shell. `workspace.fetch`
is granted only to the editor and is SSRF-guarded: the fetch suite proves it
denies loopback, private IPv4/IPv6 literals (every notation), hostnames that
resolve to private addresses at connect time, redirect loops, and >5-hop chains.

### workspace.list discovery (Sections 4–5, CONFIRMED, wired across 4 layers)

1. `built-in-tools.mjs` — metadata entry (READ, category workspace).
2. `capabilities/built-ins.mjs` — registry entry + both skills' `requiredTools`.
3. `documents/document-extraction-service.mjs` — read-only manifest projection
   that **omits every server-internal field** (no `storedName`, no physical
   path, no `sha256`).
4. `workspace/dsh-workspace-read-plugin.mjs` — the DSH tool itself: takes **no
   arguments, never accepts a path**, and never lists other workspaces.

---

## Section 55 — Limits (four-layer split, single authoritative registries)

### `FILE_LIMITS` (`ai-node/src/agent/documents/file-limits.mjs`, Section 8/10)

One frozen registry; every layer reads its bound from here so the distinct
capability concepts cannot drift or be conflated with a single raw file size:

| Field | Value | Meaning |
| --- | --- | --- |
| `uploadMaxBytes` | 50 MiB | single-file storage/upload ceiling |
| `workspaceQuotaBytes` | 500 MiB | total stored bytes per workspace |
| `previewMaxBytes` | 256 KiB | browser read-only text preview envelope |
| `directTextEditMaxBytes` | 256 KiB | browser direct text edit envelope |
| `agentTextEditableBytes` | 1 MiB | agent native read/edit ceiling (DSH tool-fs) |
| `documentExtraction` | `DEFAULT_DOCUMENT_LIMITS` | DOCX/XLSX/PDF parsed-structure bounds |

Required invariant **`previewMaxBytes ≤ agentTextEditableBytes`** (256 KiB ≤ 1 MiB)
holds: a previewable file is always agent-readable, so a tool can never tell the
model a stored, previewable file is unreadable. The public BFF body cap and the
production `FileIngestionService` cap both read `uploadMaxBytes`, so they cannot
diverge.

### `TEXT_EXTENSIONS` (`ai-node/src/agent/documents/file-access.mjs`, Section 7)

A single 31-extension authoritative set:
`txt, md, markdown, csv, json, log, xml, yml, yaml, html, htm, css, ts, tsx, js,
jsx, mjs, cjs, py, java, c, h, cpp, hpp, go, rs, rb, sh, sql, ini, toml`.

Consumed by five layers so an extension can never be "previewable yet
unattachable" — the exact `.css` contradiction this registry fixes:

- `public/bff.mjs` — `PREVIEW_EXTENSIONS = TEXT_EXTENSIONS` (browser preview).
- `workspace/file-ingestion-service.mjs` — `isEditableTextFile` / `isEditableTextPath`.
- `documents/file-access.mjs` — `classifyFileAccess` (attachment classification).
- `documents/document-extraction-service.mjs` — the document layer **refuses**
  text extensions (`AGENT_DOCUMENT_UNSUPPORTED`), keeping them on bounded text reads.

### Attachment limits (`ai-node/src/agent/attachments/attachment-context-resolver.mjs`, Section 9/11)

`ATTACHMENT_LIMITS = { maxAttachmentsPerRun: 8, maxTotalDeclaredBytes: 8 × 50 MiB = 400 MiB }`.

Attachment context is **metadata-only**: `resolve()` sums declared manifest sizes
and injects at most `maxSerializedContextChars` of JSON. The declared guard is
derived from `maxAttachmentsPerRun × uploadMaxBytes` so it is **never stricter
than the storage layer** — this removes the prior 16 MiB contradiction where a
17 MiB PDF that uploaded fine under the 50 MiB cap was mysteriously rejected at
attach. It is a finite defense-in-depth bound, not a model-memory guard.

---

## Section 56 — Completion semantics (`run.incomplete` ≠ `run.completed`, Section 20–24)

A run truncated by the token budget is a **distinct terminal**, never a green
success and never a failure:

- `event-adapter.mjs` — on finish reason `max_tokens`, emits
  `run.incomplete` with `payload.reason = "max_tokens"`. Rationale in-code: it is
  not an infrastructure failure (so `run.failed` would be wrong), and no client
  may render a truncated run as success.
- `contract.mjs` — `run.incomplete` is a declared terminal event type.
- `runtime-adapter.mjs` — `isRunTerminal()` includes `run.incomplete`; the
  fallback terminal stays exactly-once against a real terminal.
- `internal-server.mjs` **and** `public/bff.mjs` — `run.incomplete` is in the
  allow-listed SSE event set, sets `terminalSeen`, and `publicSseEvent()` maps it
  with its `reason`. The public path therefore surfaces truncation honestly.
- **Proven end-to-end, not merely wired:** `public max-tokens run ends as
  run.incomplete over SSE, never run.completed` drives a mock model ending with
  `finish_reason: "length"` through the **real pinned DSH runtime** (production
  `maxTokensAsSuccess: true`) and the **real public BFF HTTP/SSE path**, asserting
  exactly one terminal — `run.incomplete` with `reason: max_tokens` — and **no**
  `run.completed`. This closes the gap left by the adapter/runtime unit tests,
  which hand-inject the `max-tokens` turn-end notification rather than triggering
  it through the real runtime.

---

## Section 57 — Runtime readiness (real, not stubbed, Section 32–35)

`ai-node/src/agent/runtime-readiness.mjs` — `AgentRuntimeReadiness.snapshot()`
never starts a runtime or calls a model from a status request:

- **`runtimeReady`** — from the DSH runtime state machine (`runtimeState()`).
- **`toolsReady`** — derived at snapshot time from `runtimeState()` **plus a real
  capability resolution** (`resolveTools()`): `true` only when the runtime is
  READY and the public `workspace-editor` skill resolves with every required tool
  present and available; `false` when the runtime failed or resolution throws;
  `"unknown"` when it cannot yet be determined. `toolsReadyReason` carries the
  concrete evidence (e.g. `capability resolution ok; N public tools available`).
- **`modelToolCallingVerified`** — `"verified"` only after
  `recordToolCallVerification()` is called by a real model tool-call probe;
  otherwise `"unknown"` (**never `false`** — an unprobed runtime is unknown, not
  broken). `modelToolCalling` stores only `{ lastVerifiedAt, model, tool }` —
  no prompt and no user data.

---

## Section 58 — Capacity + verification evidence + verdict

### Normal-chat output capacity (`ai-node/src/config.mjs`, Section 25)

- `MODEL_MAX_OUTPUT_TOKENS = 8192` (agent budget / model ceiling).
- `DEFAULT_CHAT_MAX_OUTPUT_TOKENS = 4096` (raised from 512): large enough for
  real answers, well under the 8192 agent budget so ordinary chat stays
  responsive. A misconfigured `AI_MAX_OUTPUT_TOKENS` is clamped to the ceiling so
  it cannot drive runaway latency. `server.mjs` sends `max_tokens: config.maxOutputTokens`.
- Separately, the OpenAI-compatible `/v1` proxy (`public-model-api.mjs`) bounds
  its own `max_tokens`/`max_completion_tokens` to 1..4096 and forces `n=1`.

### Test evidence (all run this session against the current worktree)

| Check | Command | Result |
| --- | --- | --- |
| ai-node unit + E2E (offline) | `npm --prefix ai-node test` | **270 tests / 217 pass / 0 fail / 53 skipped** |
| ai-node unit + E2E (pinned DSH) | `SNN_DSH_ROOT=.tmp-dsh-node22-852ae532 npm --prefix ai-node test` | **270 / 270 pass / 0 fail / 0 skipped** (76 s) |
| AI conversation state | `npm run test:ai-state` | **33 / 33 pass** |
| Production readiness | `npm run test:production-readiness` | **6 / 6 pass** |
| Lint | `npm run lint` | **0 errors** (1 pre-existing warning in `playwright.prodcheck.config.mjs`) |
| Type check | `npx tsc --noEmit -p tsconfig.json` | **exit 0** |
| Real-model NL acceptance | `npm run test:real-model-acceptance` | **8 / 8 clean skip** (gated, exit 0) |

The 53 offline-skipped tests are the real out-of-process E2E chain
(SNN runtime adapter → DshClient → official `@deepseek-ai/dsh-sdk-client` →
child `dsh-jsonrpc-agent` → real cordis composition → tools + JSONL persistence →
SDK notifications → `SnnAgentEvent`). Pointing `SNN_DSH_ROOT` at the **already
built, unmodified** pinned DSH `852ae532` runs all of them green — the strongest
available offline ACCEPT evidence.

These E2E runs use a deterministic mock LLM and exercise the **entire public BFF
path offline**, so the public path logic is already accepted (only the live-model
side remains gated). Named green cases include:

- `public agent capability surface exposes no shell-style execution tool`
  (the NO-SHELL boundary is enforced by a test, not just by instruction text);
- `adapts a max-tokens turn end to run.incomplete, never run.completed`,
  `runtime adapter reports run.incomplete exactly once for a max-tokens turn end`,
  and — through the **real DSH runtime + public BFF SSE** — `public max-tokens run
  ends as run.incomplete over SSE, never run.completed`;
- `public upload/list/delete and attachment run via BFF reaches real DSH`,
  `public multipart XLSX run patches one row and downloads a verified workbook`,
  `public mixed attachments (txt+pdf+xlsx) via BFF`;
- `uploaded PDF reaches the real DSH Agent through workspace.extract with sanitized SSE`;
- `public upload cap and workspace quota are sourced from the registry without drift`;
- `public CORS and cookie sanitization`, `public session create issues HttpOnly
  cookie and isolates workspaces`, `public create sessions are isolated per owner
  with dedicated workspaces`, `public feature flag disabled returns 404`,
  `public SSE cancel and disconnect`, `public restart retains ownership and resume`,
  `public delete session cleans all`.

### Real-model NL acceptance harness (Section 36–42, written + gated)

`tests/workspace-agent-nl-real-model.test.mjs` states only the user's goal; the
real Qwen model must itself discover → inspect → choose a safe tool → mutate →
verify, and completion is judged on **authoritative downloaded bytes**, never on
the model claiming success. The six NL cases cover exactly this report's claims:

- A (text) edit an uploaded `.md`; B (**css**) classify+read+edit a `.css`;
  C (**docx**) replace cross-run Word text, file stays valid; D (**xlsx**) delete
  one exact row, preserve the other sheet; E (**pdf >16 MiB**) upload+attach
  succeed and the model reads the first-page title; F (**max-tokens**) an
  over-long generation ends as `run.incomplete`, never `run.completed`.

### Verdict

- **READY (offline-verified):** Sections 4–25, 32–35, 54–58 — capability model,
  NO-SHELL boundary, four-layer limits, `.css`/attachment contradictions,
  completion semantics, real readiness, and chat capacity are implemented and
  proven by 269/269 + 33/33 + 6/6 green, lint 0, tsc 0.
- **BLOCKED (needs external state):** Section 28–31/50 — the **live** AI11
  capacity retest and the **real-Qwen-model** NL public-path acceptance require a
  running public deployment (`SNN_REAL_MODEL_AGENT_BASE_URL`) and browser origin
  (`SNN_REAL_MODEL_ORIGIN`) backed by real Qwen credentials. The public BFF path
  itself is already accepted offline (mock LLM, above); what remains gated is the
  live deployment + real model. This is a stop-and-ask condition (new secret +
  live public deployment); it cannot be satisfied offline and must not be
  fabricated. The harness is written, imports/fixtures resolve, and it skips
  cleanly (exit 0) until those two env vars are supplied.

**Overall: PARTIAL → READY for all offline scope; the single remaining item is
deployment-gated.** To close it, provide a live AI11 Qwen deployment URL + origin
(and the model secret via the environment, never committed), then run
`npm run test:real-model-acceptance`.
