# AGENTS.md

## 1. Project Identity

This repository is the main codebase for **SNN — Smart Neural Network**, a student technology community focused on AI, robotics, intelligent systems, and project-based learning.

The project is evolving from a community website into an integrated **SNN AI Platform**.

SNN AI is not intended to become a generic ChatGPT clone.

The long-term target is:

```text
SNN AI Platform
│
├── Brand Layer
│   ├── SNN Logo
│   ├── SNN identity
│   ├── Cold / technical visual language
│   ├── Typography
│   ├── Design Tokens
│   └── Main website
│
├── Club Layer
│   ├── Agent Presets
│   ├── Skills
│   ├── Project Templates
│   ├── Prompt Templates
│   ├── Member Workflows
│   └── Teaching Demos
│
├── Web UI
│   ├── Chat
│   ├── Workspace
│   ├── Agent
│   ├── Plan
│   ├── Tool Calls
│   └── Settings
│
└── Agent Runtime
    └── DeepSeek Harness
        ├── Agent Loop
        ├── Session
        ├── Tool Registry
        ├── LLM Adapter
        ├── Sandbox
        └── Persistence
```

The product architecture principle is:

> **SNN owns the product. DeepSeek Harness provides the runtime.**

Do not turn SNN into a visibly rebranded DeepSeek Harness frontend.

---

# 2. Current Repository State

Before making changes, understand that the repository already contains several distinct layers.

```text
.
├── app/
│   ├── _sections/
│   ├── ai/
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── ai-node/
│   ├── src/
│   └── test/
│
├── cloudflare-ai-gateway/
│   ├── src/
│   └── test/
│
├── lib/
├── shared/
├── worker/
├── tests/
├── scripts/
├── docs/
├── public/assets/
└── build/
```

The current stack includes:

* Next.js
* React
* TypeScript
* Vinext
* Vite
* Cloudflare Workers
* Cloudflare Tunnel / Access for the AI origin
* Local OpenAI-compatible model runtime
* Server-Sent Events for streaming AI responses

Node.js requirement:

```text
>= 22.13.0
```

Do not replace the existing stack without an explicit task requiring it.

---

# 3. Current AI Architecture

The existing architecture should be treated as a deliberate security boundary.

```text
Browser
   │
   ▼
SNN Website
   │
   ▼
Cloudflare AI Gateway
   │
   ▼
Cloudflare Access
   │
   ▼
Cloudflare Tunnel
   │
   ▼
SNN AI Node
127.0.0.1:8787
   │
   ▼
Local / Remote AI Runtime
```

Current AI Node responsibilities include:

```text
SNN API Contract
        ↓
AI Node Adapter
        ↓
OpenAI-compatible Runtime
```

The AI Node must remain an application boundary.

Do not make the browser directly communicate with:

* local model runtimes
* DeepSeek Harness runtime
* llama.cpp
* vLLM
* internal AI services
* AI origin endpoints intended only for Gateway access

---

# 4. Target AI Architecture

DeepSeek Harness is planned as the primary Agent Runtime.

The intended evolution is:

```text
Browser
   │
   ▼
SNN Web UI
   │
   ▼
SNN API
   │
   ▼
Cloudflare Gateway
   │
   ▼
SNN AI Node
   │
   ▼
SNN Harness Adapter
   │
   ▼
DeepSeek Harness
   │
   ├── Session
   ├── Agent Loop
   ├── Tools
   ├── Skills
   ├── Workspace
   ├── Sandbox
   └── Persistence
   │
   ▼
Model Providers
   ├── Local Qwen
   ├── DeepSeek
   └── other compatible models
```

DeepSeek Harness must remain behind the SNN abstraction layer.

The frontend should not depend directly on Harness-specific internal concepts unless there is no reasonable abstraction.

---

# 5. SNN API Is the Stable Contract

The most important architectural rule is:

> **Frontend code talks to SNN APIs, not directly to DeepSeek Harness APIs.**

The intended public domain model should gradually become:

```text
session
turn
event
agent
preset
skill
workspace
model
toolCall
plan
```

Examples of future API shape may include:

```text
GET    /api/ai/status

POST   /api/ai/sessions
GET    /api/ai/sessions/:id

POST   /api/ai/sessions/:id/turns
GET    /api/ai/sessions/:id/events

GET    /api/ai/agents
GET    /api/ai/presets
GET    /api/ai/models
GET    /api/ai/skills
```

These are architectural directions, not permission to implement all endpoints during unrelated tasks.

Do not introduce future APIs unless the task actually requires them.

---

# 6. DeepSeek Harness Integration Rules

When DeepSeek Harness is introduced:

## DO

Prefer:

```text
SNN AI Node
    ↓
Harness Adapter
    ↓
Harness Runtime
```

Keep Harness-related integration in an isolated module such as:

```text
ai-node/src/harness/
```

Possible future structure:

```text
ai-node/src/harness/
├── client.*
├── runtime.*
├── sessions.*
├── events.*
├── adapters.*
└── types.*
```

SNN-specific configuration may eventually live under:

```text
snn-ai/
├── presets/
├── skills/
├── prompts/
├── templates/
└── workflows/
```

## DO NOT

Do not:

* fork large portions of DeepSeek Harness into this repository
* copy the entire Harness Web UI
* expose Harness directly to public users
* couple React components to Harness internals
* modify Harness core when an adapter/plugin is sufficient
* duplicate the Harness Agent Loop inside SNN code
* create a second competing session implementation without reason

Treat Harness as infrastructure.

Treat SNN as the product.

---

# 7. Product Layers

Future features should fit into one of these conceptual layers.

## Brand Layer

Responsible for:

* SNN identity
* logo
* typography
* colors
* spacing
* design tokens
* homepage
* responsive visual system

## Club Layer

Responsible for SNN-specific value:

```text
Agent Presets
Skills
Prompt Templates
Project Templates
Member Workflows
Teaching Demos
```

This is where most of the project's differentiated functionality should live.

## Web UI

Responsible for presenting:

```text
Chat
Workspace
Agent
Plan
Tool Calls
Session History
Settings
```

The Web UI should remain SNN-designed.

## Runtime Layer

Responsible for:

```text
Agent execution
Sessions
Tools
LLM routing
Sandbox
Persistence
```

Prefer DeepSeek Harness for this layer rather than rebuilding these systems from scratch.

---

# 8. Agent Presets

SNN AI should eventually support purpose-specific agents rather than one universal unrestricted agent.

Possible presets:

```text
General
└── SNN Assistant

Development
├── Coding Agent
├── Code Reviewer
└── Project Auditor

Research
├── Research Agent
├── Paper Reader
└── Literature Reviewer

Learning
├── Learning Tutor
└── Algorithm Tutor

Club
├── Project Mentor
└── Member Onboarding Agent
```

An Agent Preset should conceptually define:

```text
System Prompt
Model
Tools
Skills
Permissions
Workspace Policy
Runtime Policy
```

Do not hard-code preset-specific logic throughout UI components.

Prefer configuration-driven design.

---

# 9. Skills

Skills are intended to become one of SNN AI's main community extension mechanisms.

Potential future organization:

```text
snn-ai/skills/
├── coding/
│   ├── code-review/
│   ├── project-audit/
│   └── frontend-review/
│
├── research/
│   ├── paper-reader/
│   ├── literature-review/
│   └── experiment-design/
│
├── robotics/
│   ├── ros-debug/
│   ├── control-analysis/
│   └── robot-project-init/
│
└── club/
    ├── project-onboarding/
    ├── project-proposal/
    └── weekly-report/
```

Skills should be:

* narrowly scoped
* composable
* reviewable
* documented
* safe by default
* versionable

Do not add a Skill system until required by an explicit task.

---

# 10. Workspace Model

The future SNN AI should support project-aware sessions.

Conceptually:

```text
SNN Project
     │
     ▼
Workspace
     │
     ├── Agent
     ├── Session
     ├── Files
     ├── Git
     ├── Tools
     └── Tasks
```

Workspace access must always be explicitly scoped.

Never give a public Agent arbitrary filesystem access.

Never assume:

```text
/
C:\
$HOME
```

is a valid workspace.

Prefer explicitly assigned project directories.

---

# 11. Permissions and Trust Levels

SNN AI should eventually distinguish between user capabilities.

Conceptual levels:

```text
PUBLIC
│
├── Chat
├── safe research
└── restricted tools

MEMBER
│
├── project workspace
├── coding tools
├── approved Skills
└── limited filesystem access

MAINTAINER
│
├── preset management
├── Skill management
└── advanced project operations
```

Do not expose powerful capabilities simply because Harness supports them.

Features such as:

```text
shell
filesystem write
git write
process execution
arbitrary network access
plugin installation
```

must be treated as privileged capabilities.

---

# 12. Security Rules

These rules are non-negotiable.

Never commit:

```text
.env
API keys
Cloudflare Access secrets
service tokens
private keys
model credentials
production cookies
real authentication tokens
```

Never expose secrets to client-side code.

The AI Node should remain bound to localhost unless an explicit architectural decision says otherwise.

Preferred:

```text
127.0.0.1
```

Do not casually change services to:

```text
0.0.0.0
```

Public traffic should pass through the intended Gateway / Access / Tunnel boundaries.

The public website must not directly call the private AI Origin.

---

# 13. Cloudflare Boundary

The Cloudflare AI Gateway is an explicit security and policy layer.

It may be responsible for:

```text
CORS
rate limiting
request validation
request size limits
origin protection
authentication
stream forwarding
logging
future model routing
```

Do not bypass the Gateway simply because direct access is easier during development.

AI responses must not be cached.

Streaming endpoints must continue supporting SSE semantics.

Do not buffer the complete AI response when the endpoint is intended to stream.

---

# 14. Frontend Design Direction

SNN has its own visual identity.

The frontend should retain a technical, engineering-oriented design language.

Characteristics include:

```text
cold / neutral color system
industrial layout
engineering labels
blueprint influence
strong borders
clear hierarchy
high information density
controlled accent colors
```

Avoid turning SNN into a generic:

```text
SaaS dashboard
ChatGPT clone
purple-gradient AI website
glassmorphism template
```

Reuse existing design tokens whenever possible.

Do not introduce a second unrelated design system for SNN AI.

---

# 15. Mobile Is a First-Class Target

All SNN AI interfaces must work on mobile.

Minimum practical widths that should be considered:

```text
320px
360px
375px
390px
412px
430px
```

Do not allow message content to expand the document width.

Long content such as:

```text
URLs
hashes
file paths
tokens
long English strings
code
model output
```

must remain inside its intended container.

For Grid/Flex children containing user-generated content, consider:

```css
min-width: 0;
max-width: 100%;
box-sizing: border-box;
overflow-wrap: anywhere;
word-break: break-word;
```

Do not solve layout bugs solely with:

```css
body {
  overflow-x: hidden;
}
```

Fix the component causing the overflow.

---

# 16. UI Regression Rules

When changing SNN AI UI, preserve existing behavior unless the task explicitly changes it.

Pay special attention to:

* streaming output
* thinking mode
* conversation history
* IndexedDB persistence
* session restoration
* new conversation
* delete conversation
* title generation
* auto-scroll
* manual scroll position
* abort generation
* mobile layout
* desktop layout
* Gateway compatibility

A visual change must not silently break AI behavior.

An AI behavior change must not silently break responsive layout.

---

# 17. Coding Discipline

Before editing:

1. Read the relevant implementation.
2. Read nearby types and shared utilities.
3. Inspect existing tests.
4. Understand the current data flow.
5. Identify the smallest correct change.

Prefer:

```text
small targeted patch
```

over:

```text
large speculative rewrite
```

Do not rewrite unrelated files.

Do not perform mass formatting during a functional fix.

Do not rename public interfaces without checking all consumers.

Do not delete working functionality simply because a simpler implementation exists.

---

# 18. Do Not Implement Architecture by Imagination

This document describes both:

```text
CURRENT STATE
```

and:

```text
TARGET DIRECTION
```

They are not the same thing.

Future architecture sections are guidance.

Do not create:

* Harness integration
* Skill registry
* Agent preset system
* workspace filesystem access
* authentication
* member roles
* databases
* new Cloudflare services

during an unrelated task.

Only implement future systems when explicitly requested.

---

# 19. Dependency Policy

Avoid unnecessary dependencies.

Before adding a package, determine whether:

* the functionality already exists in the repository
* the platform already provides it
* a small internal utility is sufficient

Do not add large UI frameworks only for one component.

Do not replace the current application framework without explicit instruction.

Keep dependency versions compatible with the existing Node.js requirement.

---

# 20. Tests and Validation

For normal repository changes, use the existing project commands.

Relevant commands include:

```bash
npm run lint
npm run test:ai-node
npm run test:ai-gateway
npm run build
```

The main test command is:

```bash
npm test
```

When the change affects only one subsystem, run its targeted tests first.

Before declaring a meaningful change complete, run the relevant full validation.

For changes affecting general application code, prefer:

```bash
npm run lint
npm run build
```

For AI Node changes:

```bash
npm run test:ai-node
```

For Gateway changes:

```bash
npm run test:ai-gateway
```

For cross-layer AI changes, run all relevant commands.

Do not:

* remove failing tests
* disable lint rules globally
* change CI to ignore failures
* make scripts always return success
* weaken tests just to obtain a green check

Fix the underlying problem.

---

# 21. CI Is Part of the Product

A successful Cloudflare deployment does not mean the repository is healthy.

GitHub CI and production deployment are separate validation systems.

Before considering a change complete:

```text
lint        → PASS
tests       → PASS
build       → PASS
```

If CI fails after a seemingly unrelated change, investigate the actual failing command rather than guessing based on previous failures.

---

# 22. Failure Handling

Do not silently swallow errors.

Prefer explicit states such as:

```text
online
offline
connecting
streaming
aborted
error
```

When an upstream model is unavailable, return a controlled error instead of pretending the request succeeded.

Do not invent model responses when the runtime is unavailable.

---

# 23. Streaming Rules

Streaming is a core SNN AI feature.

When working on the AI request pipeline, preserve:

```text
Browser
↓
Gateway
↓
AI Node
↓
Runtime
↓
SSE
↓
Browser
```

Cancellation should propagate upstream where possible.

Do not convert streaming endpoints into fake streaming implementations that wait for the entire model response first.

---

# 24. Data Ownership

Frontend state, SNN platform state, and Harness runtime state should remain conceptually distinct.

Future architecture should preferably map:

```text
SNN Session
     │
     └── Harness Session ID
```

rather than leaking Harness's entire persistence model into the frontend.

SNN owns product metadata.

Harness owns runtime execution data where appropriate.

---

# 25. Naming

Use **SNN AI** for the user-facing product.

Use **DeepSeek Harness** only when referring to the underlying runtime technology.

Avoid user-facing labels such as:

```text
DeepSeek Harness Chat
Harness Session
Cordis Runtime
Harness Tool Registry
```

unless the page is specifically intended for developers or maintainers.

A normal member should interact with:

```text
SNN AI
Agent
Session
Project
Workspace
Skill
Plan
Tool
```

---

# 26. Brand Independence

SNN AI must not visually or semantically impersonate DeepSeek.

If DeepSeek Harness code or packages are used:

* respect upstream licenses
* retain required license notices
* clearly distinguish SNN from DeepSeek
* do not imply official DeepSeek affiliation

The architecture may depend on Harness.

The product identity must not.

---

# 27. Preferred Future Repository Direction

When future AI Platform work begins, prefer an organization similar to:

```text
snn/
│
├── app/
│   └── ai/
│
├── ai-node/
│   └── src/
│       ├── api/
│       └── harness/
│
├── cloudflare-ai-gateway/
│
├── snn-ai/
│   ├── presets/
│   ├── skills/
│   ├── prompts/
│   ├── templates/
│   └── workflows/
│
├── shared/
├── tests/
└── docs/
```

This is directional architecture.

Do not create empty folders purely to match this diagram.

---

# 28. Product Priority

When multiple implementation choices are valid, prefer the one that strengthens:

1. reliability
2. security
3. clear architecture
4. mobile usability
5. maintainability
6. SNN product identity
7. extensibility

Do not prioritize architectural cleverness over a stable product.

---

# 29. Completion Standard for Coding Agents

Before reporting completion:

1. Review the final diff.
2. Confirm only intended files changed.
3. Check for generated or secret files.
4. Run relevant lint/tests/build.
5. Confirm existing functionality was preserved.
6. State what changed.
7. State why it changed.
8. State what was validated.
9. State anything that remains unresolved.

Never claim success if required validation still fails.

---

# 30. Core Principle

When uncertain about architecture, use this rule:

```text
SNN Product
     ↓
SNN Stable API
     ↓
SNN Adapter Layer
     ↓
External Runtime / Infrastructure
```

Not:

```text
SNN Frontend
     ↓
Deep dependency on external runtime internals
```

The long-term objective is not:

> wrap DeepSeek Harness with an SNN logo.

The objective is:

> build an SNN-native AI and project collaboration platform, using DeepSeek Harness as one of its core runtime technologies.

All significant architectural decisions should move the repository toward that goal without destabilizing the product that already works.
