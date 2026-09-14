# SNN Phase 5C2
# Public Agent Capacity, Queueing & Fairness
# Long-Running Goal Mode

你现在进入 LONG-RUNNING GOAL MODE。

用户暂时不在电脑前。

不要每完成一个小步骤就停下来请求确认。

在安全边界内持续：

AUDIT
→ BASELINE
→ LOAD CHARACTERIZATION
→ ROOT-CAUSE ANALYSIS
→ CAPACITY POLICY DESIGN
→ IMPLEMENT
→ TEST
→ DEPLOY PREFLIGHT
→ PRODUCTION ROLLFORWARD
→ REAL PUBLIC ACCEPTANCE
→ FREEZE REPORT

直到：

1. PHASE_5C2_PUBLIC_AGENT_CAPACITY_READY
2. 或遇到真正无法自主解决的外部阻断
3. 或触发明确安全门

只有以下情况允许停止等待人工：

- 需要新的 secret / credential
- 需要修改 pinned DSH source
- 需要开放 Shell / 任意进程执行
- 需要升级 Ubuntu / CUDA / 模型 runtime
- 需要破坏性清理生产数据
- production Git 出现无法安全 fast-forward 的未知 divergence
- Cloudflare Access 需要人工重新登录且无法继续
- 必须进行高风险压力测试才能继续

除此之外不要停。


============================================================
0. FROZEN BASELINE
============================================================

Phase 5C1 已完成并冻结。

Current production baseline:

SNN main:
8ec93f3

origin/main:
8ec93f3

AI11:
main @ 8ec93f3

production AI Node:
snn-ai-node.service

AI11 model:
Qwen3.8-27B-EfficientThink-DFlash2

llama-server:
127.0.0.1:8081

known model concurrency:

--parallel 1

AI Node:
127.0.0.1:8787

public API:
https://api.snnai.cn

website:
https://snnai.cn

Pinned DSH:

852ae5321a3d68bc0b11c5cc6f3145dde6530500

DSH tracked diff:
EMPTY

Current production status already proven:

online=true
runtimeReady=true
toolsReady=true
11 public tools available

Phase 5C1 real-model public acceptance:

8 / 8 PASS

including:

text editing
CSS editing
DOCX cross-run editing
XLSX structured editing
>16 MiB PDF via chunked upload
max_tokens → run.incomplete

SSE heartbeat:
already proven capable of keeping long public runs alive.

NO SHELL:
must remain true.


============================================================
1. PRIMARY PROBLEM
============================================================

The functional Agent is now healthy.

The remaining production question is:

HOW MANY USERS CAN USE IT AT ONCE
WITHOUT THE PRODUCT DEGRADING INTO
LONG, UNFAIR, OR MISLEADING WAITS?

Current tension:

llama-server generation slots:
1

public Agent may admit:
multiple active runs

Therefore:

HTTP/SSE connectivity can remain alive,
but the model itself can still process only one generation at a time.

Heartbeat solved:

Cloudflare idle disconnect

It did NOT solve:

queue wait
fairness
starvation
user-perceived latency
burst admission
cancellation while queued
capacity contract

This phase must solve those.


============================================================
2. DO NOT OPTIMIZE FOR MAXIMUM THROUGHPUT
============================================================

The goal is NOT:

“how many requests can technically remain connected?”

The goal is:

“how many requests can be admitted while the user experience remains predictable?”

A request that remains connected for 8 minutes is NOT a healthy success.

Optimize for:

bounded wait
clear queue state
fairness
fast rejection when overloaded
reliable cancellation
production stability


============================================================
3. HARD SAFETY RULES
============================================================

Do NOT:

- change llama-server --parallel
- change model quantization
- change context size
- restart the model process unless evidence requires it
- upgrade CUDA / llama.cpp / drivers
- modify pinned DSH
- enable shell
- expose AI11 origin publicly
- remove Cloudflare Tunnel
- disable SSRF protections
- perform destructive stress tests
- launch dozens/hundreds of real model generations
- consume uncontrolled GPU resources
- reset production Git
- delete production workspace data
- delete searxng
- delete ftp-upload
- delete snn-base runtime assets

Maximum intentional concurrency in this phase:

8

unless evidence proves even that is unsafe.

Do not exceed 8 real simultaneous model runs.


============================================================
4. RE-ESTABLISH CURRENT REALITY
============================================================

Before changes:

record:

local HEAD
origin/main
AI11 HEAD
AI11 branch
AI11 git status
Node version
service state
model process state

Confirm:

main == origin/main == AI11 main == 8ec93f3

If not:

stop feature work and classify:

PRODUCTION_VERSION_DRIFT

Do not test capacity against mixed revisions.


============================================================
5. AUDIT CURRENT CAPACITY CONFIG
============================================================

Read the actual current code/config.

Do not rely on old reports.

Find the real values for:

SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_GLOBAL
SNN_AGENT_PUBLIC_MAX_ACTIVE_RUNS_PER_OWNER
SNN_AGENT_PUBLIC_MAX_WORKSPACES
session limits
workspace limits
run queue/admission behavior
run timeout behavior
heartbeat interval
SSE terminal behavior
cancel behavior

Also audit:

where “active” is incremented
where decremented
whether queued requests count as active
whether aborted requests release slots
whether failed starts release slots
whether browser disconnect releases slots

Produce:

CURRENT_CAPACITY_CONTRACT


============================================================
6. AUDIT MODEL-SLOT BEHAVIOR
============================================================

Confirm real llama-server state.

Record:

parallel slots
slot state endpoint if available
queue behavior
whether llama-server itself queues
whether AI Node queues before llama-server
whether DSH queues
whether requests overlap before model generation

The key question:

WHERE DOES WAITING ACTUALLY OCCUR?

Possible:

AI Node admission layer
DSH runtime
provider adapter
llama-server internal queue

Identify:

FIRST_QUEUE_BOUNDARY


============================================================
7. BASELINE SINGLE-REQUEST LATENCY
============================================================

Before concurrency testing, establish the single-request baseline.

Use a deterministic natural-language Agent task
that requires a small real model response but no expensive files.

Example:

upload tiny text:
capacity-test.txt

content:
CAPACITY_SENTINEL

request:

“读取这个文件并告诉我里面的完整字符串。”

Use real Qwen.

Run at least:

5 sequential samples

Measure:

request accepted timestamp
run.started
first meaningful Agent/model event
first token if observable
terminal
total latency

Compute:

P50
P95 or max if sample too small
average

Do NOT use the first cold run as the only baseline.

Record:

SINGLE_RUN_BASELINE


============================================================
8. DEFINE SAFE LOAD SCENARIOS
============================================================

Run controlled scenarios:

C1:
1 simultaneous run

C2:
2 simultaneous runs

C4:
4 simultaneous runs

C6:
6 simultaneous runs

C8:
8 simultaneous runs

Do NOT immediately run all scenarios.

Progress:

1
→ 2
→ 4

Only continue to:

6
→ 8

if GPU, AI Node, memory, service, and latency remain healthy.

If C4 already demonstrates severe degradation:

do not continue to C8 just to fill a table.


============================================================
9. USE DISTINCT OWNERS
============================================================

Capacity tests must not all use the same owner cookie.

Create separate logical browser owners:

Owner A
Owner B
Owner C
...

Each owner should have its own:

session
owner cookie
workspace

This is required to test:

global fairness
per-owner fairness
isolation

Also create one scenario where:

Owner A submits multiple requests
while
Owner B submits one request

to detect monopolization.


============================================================
10. METRICS TO CAPTURE
============================================================

For every run record:

owner
session
request index

admission timestamp
run creation timestamp
run.started timestamp

queue/wait start
queue/wait end

time to first model token / first meaningful model output
terminal timestamp

total latency

terminal type:

completed
incomplete
failed
cancelled
429/not admitted

tool events if relevant

SSE heartbeat count

client disconnects

Cloudflare errors

server error

model slot timing if observable


============================================================
11. DERIVED METRICS
============================================================

Compute per scenario:

admission success rate

queue wait:
P50
P95
max

TTFT:
P50
P95
max

total latency:
P50
P95
max

completion rate
429 rate
cancel success rate

fairness:
difference between owners

starvation:
YES / NO

Cloudflare transport failures:
count

AI Node restart/crash:
count


============================================================
12. PUBLIC PATH MUST BE USED
============================================================

At least the main characterization must go through:

client
→ api.snnai.cn
→ Cloudflare
→ Tunnel
→ AI11

Do not characterize only:

127.0.0.1:8787

Localhost can be used for differential diagnosis.

But final capacity contract must represent:

real public users.


============================================================
13. DO NOT USE LARGE FILES FOR CAPACITY TESTS
============================================================

Capacity testing is about model scheduling,
not upload bandwidth.

Use tiny files / tiny prompts.

Do NOT combine:

17 MiB PDF
chunk upload
capacity test

unless specifically diagnosing upload concurrency later.

Keep the workload focused.


============================================================
14. QUEUE BEHAVIOR AUDIT
============================================================

When two or more runs arrive with:

llama --parallel 1

observe whether the second request:

A. is rejected immediately
B. enters AI Node queue
C. enters DSH queue
D. reaches llama-server and queues there
E. appears “running” to the UI despite no model slot

This distinction is critical.

Produce:

QUEUE_LOCATION =
...


============================================================
15. CURRENT UI SEMANTICS
============================================================

Audit what the frontend shows while a run is waiting.

Possible current behavior:

“思考中”
loading spinner
no status change
heartbeat only

If queued work is indistinguishable from active model generation:

classify:

QUEUE_STATE_UX_MISLEADING


============================================================
16. INTRODUCE A TRUTHFUL WAITING STATE IF NEEDED
============================================================

If there is a real queue before model execution,
the product should expose that state.

Preferred semantic:

run.waiting

or:

run.queued

Choose naming consistent with existing event contract.

Do NOT invent fake queue positions unless the backend really knows them.

Minimum payload could include:

reason: "model_busy"

Do not expose:

internal process IDs
server paths
private provider state


============================================================
17. FRONTEND WAITING UX
============================================================

When waiting:

display something like:

“模型繁忙，任务正在等待执行”

Not:

“正在思考”

until actual model execution begins.

If queue position is unknown:

do NOT show:

“你前面还有 3 人”

If backend truly knows it,
it may be shown later,
but it is not required for Phase 5C2.


============================================================
18. HEARTBEAT SEMANTICS
============================================================

Heartbeat means:

connection alive

It must NOT mean:

model actively generating

Keep heartbeat separate from:

queue state
model state

Do not change run state just because a heartbeat arrives.


============================================================
19. QUEUED CANCELLATION
============================================================

This is mandatory.

Test:

Owner A occupies the model slot.

Owner B submits a run and waits.

Before B reaches model execution:

cancel B.

Expected:

B terminal = run.cancelled

exactly one terminal

B never later executes

B does not consume the next model slot

queue/admission counters release correctly

Owner C can subsequently run normally.


============================================================
20. ACTIVE CANCELLATION
============================================================

Also retain existing behavior:

cancel an actively generating run.

Expected:

run.cancelled

slot eventually released

next queued run proceeds

no duplicate terminal

no hung heartbeat


============================================================
21. OWNER FAIRNESS TEST
============================================================

Scenario:

Owner A submits A1, A2, A3

then shortly after:

Owner B submits B1

Observe actual scheduling.

Bad behavior:

A1
A2
A3
B1

with no fairness rule,
allowing one browser to monopolize the only model slot.

Desired bounded fairness:

Owner A cannot occupy the whole public queue indefinitely.

Do not over-engineer strict round-robin unless needed.

Per-owner admission limits may be enough.


============================================================
22. GLOBAL ADMISSION POLICY
============================================================

After measurement, decide:

MAX_ACTIVE_RUNS_GLOBAL

Do NOT set it before evidence.

Likely range:

3–5

but this is NOT authorization to hardcode 4.

Use measured:

queue wait
total latency
fairness
user experience

to justify the number.


============================================================
23. PER-OWNER POLICY
============================================================

Determine:

MAX_ACTIVE_RUNS_PER_OWNER

Likely:

1 or 2

Goal:

prevent one browser/user from filling the entire queue.

If:

PER_OWNER=1

causes legitimate UX problems,
consider 2.

Use evidence.


============================================================
24. WORKSPACE / SESSION CAPACITY
============================================================

Do not confuse:

model run concurrency

with:

number of stored sessions/workspaces.

100 sessions existing on disk does NOT mean
100 simultaneous model users.

Keep:

session storage limit
workspace count limit

separate from:

active model runs.


============================================================
25. FAST REJECTION OVER UNBOUNDED QUEUEING
============================================================

If the safe admitted queue is full:

respond quickly.

Preferred:

HTTP 429

or current project-consistent equivalent.

Structured error:

AGENT_BUSY

or:

AGENT_CAPACITY_LIMIT

Do NOT:

leave a request silently hanging for minutes
and eventually 524.


============================================================
26. 429 CONTRACT
============================================================

If adding/changing overload rejection:

response must include structured JSON.

Suggested:

{
  "error": {
    "code": "AGENT_BUSY",
    "message": "The model is currently busy. Please try again shortly."
  }
}

Follow existing BFF error schema.

Do not leak:

current owner IDs
other users
exact private queue contents


============================================================
27. OPTIONAL RETRY HINT
============================================================

If there is enough evidence to estimate a reasonable retry delay:

Retry-After

may be sent.

Do not invent an inaccurate value.

A coarse:

5
10

seconds is acceptable only if measurements justify it.

Otherwise omit.


============================================================
28. FRONTEND 429 UX
============================================================

Do not display raw JSON.

Show a concise Chinese message, e.g.:

“当前使用人数较多，请稍后再试。”

If a current Agent session exists:

do not corrupt it.

The failed admission should not create a fake active run.


============================================================
29. COUNTER CORRECTNESS
============================================================

Admission counters must be correct under:

success
failure
cancel while queued
cancel while active
runtime error
model error
client disconnect
session deletion

No slot leakage.

Create regression tests specifically for:

counter returns to zero
after every terminal path.


============================================================
30. PROCESS RESTART SAFETY
============================================================

If AI Node restarts:

in-memory capacity state must not permanently lock new users out.

If counters are in-memory:

restart naturally resets them.

If persisted:

audit recovery.

Do not build a distributed queue system in this phase.


============================================================
31. NO REDIS / EXTERNAL QUEUE UNLESS PROVEN NECESSARY
============================================================

Do NOT add:

Redis
RabbitMQ
Kafka
new database

for one AI11 model slot.

Prefer:

simple in-process bounded admission/queue

because there is one production AI Node.

Only introduce external coordination if architecture evidence requires it.


============================================================
32. KEEP THE DESIGN BORING
============================================================

A correct Phase 5C2 solution may simply be:

1 active model run
+
small bounded admitted queue
+
per-owner cap
+
global cap
+
waiting event
+
fast 429 beyond queue

This is acceptable.

Do not build a generalized job scheduler.


============================================================
33. CAPACITY CONFIG
============================================================

Final chosen limits must remain configurable.

Use current existing env names if present.

Do NOT create aliases unless needed.

Example categories:

GLOBAL
PER_OWNER
WORKSPACES

Defaults must be safe for:

llama --parallel 1

Production `.env` may override after evidence.

Do not hardcode AI11-specific values deep in business logic.


============================================================
34. CONFIG VALIDATION
============================================================

Invalid capacity config must fail safely.

Examples:

0
negative
NaN
PER_OWNER > GLOBAL

Handle according to current config conventions.

Do not silently convert nonsensical production config.


============================================================
35. MAX TOKENS / LONG RUNS
============================================================

Do not mix:

long generation
with
capacity testing

Use short tasks first.

After safe caps are determined,
run one long generation plus queued user to ensure:

heartbeat
waiting
fairness
cancel

still behave correctly.


============================================================
36. MODEL SLOT OBSERVABILITY
============================================================

If llama-server exposes safe slot status:

use it for diagnostics.

But do not make production correctness depend on
an undocumented llama debug endpoint.

SNN should enforce its own public admission contract.


============================================================
37. OBSERVABILITY
============================================================

Add only minimal structured metrics/logging if needed.

Useful fields:

requestId
runId
owner hash / non-identifying internal token
admission outcome
queue wait ms
model-start timestamp
terminal
total duration

Do not log:

full prompt
uploaded file content
cookies
secrets
API keys
absolute private paths


============================================================
38. READINESS SEMANTICS
============================================================

Do not make:

runtimeReady=false

just because the model is busy.

Busy ≠ unhealthy.

Potential statuses:

runtimeReady=true
toolsReady=true
capacityAvailable=false

If adding such field:

make the semantics explicit.

Do not overload current readiness fields.


============================================================
39. CAPACITY STATUS — OPTIONAL
============================================================

If useful, expose non-sensitive capacity summary:

maxActive
active
waiting
accepting

But avoid exposing individual users.

This is optional.

Do not let it block the core phase.


============================================================
40. DETERMINISTIC TESTS
============================================================

Add tests for:

global admission cap
per-owner cap
fast 429

queued cancellation
active cancellation

slot/counter release after:
completed
incomplete
failed
cancelled

owner fairness
session isolation

waiting event exactly once / correct transitions

NO SHELL unchanged


============================================================
41. STATE TRANSITION CONTRACT
============================================================

If adding run.waiting/run.queued:

define legal lifecycle.

Example:

created
→ waiting
→ started
→ completed

or:

created
→ waiting
→ cancelled

Never:

waiting
→ completed
without started

unless architecture genuinely has no distinct model-start event.

Exactly one terminal:

completed
incomplete
failed
cancelled


============================================================
42. SSE CONTRACT
============================================================

If adding a waiting event:

update:

contract
internal SSE allow-list
public BFF allow-list
client parser
hook state
UI

Do not repeat the earlier max_tokens mistake
where backend supports an event but a public allow-list might drop it.

Add public-path regression.


============================================================
43. PUBLIC-BFF E2E
============================================================

Add real pinned-DSH public BFF E2E for capacity behavior.

Use mock LLM where deterministic scheduling is needed.

This is acceptable for:

queue mechanics

But final production capacity numbers must use:

real Qwen on AI11.


============================================================
44. REAL MODEL CAPACITY RUN
============================================================

Production characterization must use:

Qwen3.8-27B-EfficientThink-DFlash2

through:

api.snnai.cn

No scripted provider for final capacity numbers.

Use disposable sessions.

Clean them afterward through legitimate APIs.


============================================================
45. GPU / MEMORY HEALTH
============================================================

During each load scenario observe:

llama-server process
AI Node process
GPU memory if safely readable
system RAM
swap
CPU

Do not optimize unless a real bottleneck appears.

Stop increasing concurrency if:

OOM
GPU instability
AI Node restart
llama crash
system swap thrash
persistent 5xx


============================================================
46. ABORT THRESHOLDS
============================================================

Stop a higher-concurrency scenario if:

AI Node crashes

llama-server crashes

OOM occurs

more than 25% requests produce unexpected 5xx

P95 queue wait exceeds 5 minutes

public path becomes unstable

GPU remains unhealthy after scenario

Then diagnose.

Do not continue to C8 automatically.


============================================================
47. PUBLIC TEST ETIQUETTE
============================================================

This is a production system.

Capacity testing must be controlled.

Do not run:

infinite loop
wrk
ab
hundreds of requests
continuous stress

Use a small deterministic client
with bounded concurrency.

Max requested real runs:

roughly enough for scenarios 1/2/4/6/8
without unnecessary repetition.

Reuse data where statistically reasonable.


============================================================
48. DETERMINE PRODUCT SLO
============================================================

After measurements, propose a practical target.

Example:

admitted users should receive either:

A. model execution within ≤N seconds

or

B. explicit waiting state

and no admitted run should wait >M seconds
before either execution or a controlled busy outcome.

Do not blindly use those values.

Derive N/M from measurements.


============================================================
49. CAPACITY DECISION
============================================================

At the end choose:

GLOBAL =
PER_OWNER =
WORKSPACES =

and justify each with:

observed latency
fairness
model slot count
expected public UX


============================================================
50. PRODUCTION ENV CHANGES
============================================================

If capacity values require production env changes:

before modification:

report current values
proposed values
evidence

Back up only the relevant env file securely.

Do not print secrets.

Change only the necessary capacity keys.

Do not rewrite the full `.env`.


============================================================
51. NO SYSTEM REBOOT
============================================================

Production changes may require:

restart snn-ai-node.service

They do NOT require:

Ubuntu reboot
model-server restart
cloudflared restart

unless evidence proves otherwise.

Avoid unrelated restarts.


============================================================
52. DEPLOYMENT FLOW
============================================================

All implementation/tests first on:

feature branch

Suggested:

feat/phase-5c2-capacity-fairness

Do not develop directly on main.

After deterministic tests:

push feature branch

deploy release candidate to AI11

run real production characterization

adjust if needed

final acceptance

then merge main


============================================================
53. AI11 GIT REALITY
============================================================

AI11 currently:

main @ 8ec93f3

Its remote-tracking `origin/main`
may be stale because AI11→GitHub TLS is unreliable.

Do not treat:

“ahead of origin/main”

as divergence unless actual GitHub refs prove it.

Preferred deployment when AI11 cannot fetch GitHub:

verified git bundle over `ssh ai11-snn`

Use:

md5/checksum
git bundle verify
dirty tracked-tree guard
fast-forward / explicit target SHA

Never:

reset --hard


============================================================
54. CLOUDFLARE ACCESS
============================================================

If `ssh ai11-snn` triggers Access browser login:

this is the only expected human-interaction gate.

Do not bypass Cloudflare Access.

After user authenticates:

continue automatically.


============================================================
55. TEST MATRIX
============================================================

Before production deployment:

lint
tsc --noEmit

ai-state

AI Node canonical
all PASS
natural exit
exit 0

pinned DSH gated suite
0 skipped

public BFF tests

browser smoke
mobile smoke

production readiness
rendered HTML
artifact
fresh build if frontend changed

new capacity tests
queue tests
fairness tests
cancel tests


============================================================
56. REGRESSION OF 5C1
============================================================

Capacity work must not regress:

workspace.list
text edit
CSS edit
DOCX
XLSX
PDF attach
chunked upload
workspace.fetch
run.incomplete
toolsReady
NO SHELL

At least focused regression on each affected layer.


============================================================
57. LIVE POST-DEPLOY SMOKE
============================================================

After final deployment:

status:
online=true
runtimeReady=true
toolsReady=true

real model:

single file read PASS

single text edit PASS

workspace.fetch PASS

no-shell PASS

then capacity tests.


============================================================
58. FINAL CAPACITY ACCEPTANCE
============================================================

At chosen production caps:

Run at least:

1-user
2-user
global-cap
global-cap+1

Confirm:

within-cap:
accepted

over-cap:
fast controlled 429

different owners:
fair

same owner:
per-owner cap enforced

queued cancellation:
PASS

active cancellation:
PASS

subsequent runs:
PASS

no counter leak:
PASS


============================================================
59. CAPACITY REPORT TABLE
============================================================

Final report must include:

| Concurrency | Accepted | 429 | Queue P50 | Queue P95 | TTFT P50 | TTFT P95 | Total P50 | Total P95 | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|

Rows:

1
2
4
6
8

If higher scenarios were safely skipped:

mark:

NOT_RUN_FOR_SAFETY

with reason.


============================================================
60. FAIRNESS REPORT
============================================================

Report:

same-owner burst behavior

cross-owner behavior

starvation:
YES/NO

max observed wait

cancellation latency

next-user progression after cancel


============================================================
61. CAPACITY CONFIG FINAL
============================================================

Report final:

MODEL_PARALLEL =
GLOBAL_RUN_CAP =
PER_OWNER_RUN_CAP =
MAX_WORKSPACES =

and:

WHY


============================================================
62. USER EXPERIENCE FINAL
============================================================

Report:

waiting state
busy message
429 behavior
retry behavior
cancel UX

Include exact user-facing wording if changed.


============================================================
63. SECURITY
============================================================

Final assertions:

NO SHELL
SSRF default deny
workspace isolation
owner isolation
no queue owner leakage
no prompt logging
DSH source unchanged


============================================================
64. DSH FREEZE
============================================================

Final:

DSH HEAD =
852ae5321a3d68bc0b11c5cc6f3145dde6530500

tracked diff =
EMPTY

source modified =
NO


============================================================
65. GIT FINAL
============================================================

Report:

branch
feature SHA
main before
main after
origin/main
AI11 HEAD

working tree

production ref alignment


============================================================
66. FINAL STATUS
============================================================

Only use:

PHASE_5C2_PUBLIC_AGENT_CAPACITY_READY

PHASE_5C2_PARTIAL

PHASE_5C2_BLOCKED

READY requires:

real Qwen public characterization complete

safe production caps chosen

global/per-owner limits enforced

fairness verified

overload returns controlled response

waiting state truthful if queue exists

queued cancel PASS

active cancel PASS

no slot leakage

5C1 regression PASS

production deployed

public smoke healthy


============================================================
67. FINAL PRODUCT STATEMENT
============================================================

Only if READY:

PUBLIC_AGENT_CAPACITY_CONTRACT_AVAILABLE

and state explicitly:

MODEL_PARALLEL = 1

PUBLIC_ADMISSION_IS_BOUNDED = YES

PER_OWNER_FAIRNESS = YES

OVERLOAD_FAILS_FAST = YES

QUEUED_RUNS_ARE_VISIBLE = YES

CANCELLATION_RELEASES_CAPACITY = YES

NO_SHELL = YES


============================================================
68. CORE PRINCIPLE
============================================================

Phase 5C1 answered:

“Can the Agent actually do useful work?”

YES.

Phase 5C2 must answer:

“When multiple real users arrive at the same time,
does the product remain predictable, fair, honest and stable?”

The final architecture should prefer:

ONE MODEL SLOT
+
SMALL BOUNDED PUBLIC QUEUE
+
PER-OWNER FAIRNESS
+
TRUTHFUL WAITING STATE
+
FAST OVERLOAD REJECTION

over:

20 users silently waiting behind one GPU
while every connection technically remains alive.

Do not optimize for a benchmark number.

Optimize for a public product that behaves correctly under pressure.