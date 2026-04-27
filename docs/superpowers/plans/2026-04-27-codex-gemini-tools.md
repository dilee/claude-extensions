# Codex-tools and gemini-tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two new plugins (`codex-tools`, `gemini-tools`) that delegate read-only dev ops (plan / review / debug) to OpenAI Codex and Google Gemini CLIs. User-invoked only, two surfaces (skill + agent), mirroring the deepanscode codex-tools shape.

**Architecture:** Two parallel plugins under `plugins/`. Each has 3 user-invoked skills (`*-plan`, `*-review`, `*-debug`) and 3 background agents (same names). Skills run inline; agents run in fresh context with ~400-word output cap. Both shell out via Bash to their CLI in read-only mode. No shared code; mirroring without abstraction.

**Tech Stack:** Markdown (SKILL.md / agent files), JSON (manifests), Bash (CLI invocation). External CLIs: `codex` (OpenAI Codex CLI) and `gemini` (Google Gemini CLI). No build step, no TypeScript. Validation via `claude plugin validate .` and `python3 -m json.tool`.

**Spec:** [`docs/superpowers/specs/2026-04-27-codex-gemini-tools-design.md`](../specs/2026-04-27-codex-gemini-tools-design.md)

---

## Verified CLI contracts

These were verified locally before writing this plan; you should not need to re-verify but the flags below are real.

### Codex (`codex exec`)

```
codex exec [PROMPT]
  -m, --model <MODEL>            # omit to use Codex default
  -s, --sandbox <MODE>            # read-only | workspace-write | danger-full-access
  -c, --config <key=value>        # e.g. -c model_reasoning_effort="high"
  -C, --cd <DIR>                  # working directory
      --output-last-message <FILE>  # write final assistant message to file
```

Used by these plugins: `-s read-only`, `-c model_reasoning_effort=high|xhigh`, `-C "$(pwd)"`, `--output-last-message <tmp>` (agents only). `-m` is omitted; we use Codex's default model.

### Gemini (`gemini`)

```
gemini [query..]
  -p, --prompt <PROMPT>           # non-interactive (headless) mode
  -m, --model <MODEL>             # e.g. gemini-2.5-pro
      --approval-mode <MODE>      # default | auto_edit | yolo | plan (plan = read-only)
  -o, --output-format <FMT>       # text | json | stream-json
```

Used by these plugins: `-p "<prompt>"`, `-m gemini-2.5-pro`, `--approval-mode plan` (read-only), `-o text`.

### Honest asymmetry: effort knob

Codex exposes `model_reasoning_effort` (`high` vs `xhigh`). Gemini CLI does not expose an equivalent thinking-budget flag — capability is selected via model name. For v1:

- Codex skills/agents accept "deep"/"thorough"/"extra-high" prefix and switch to `xhigh`.
- Gemini skills/agents accept the same prefix but it is **a no-op in v1**: both default and "deep" use `gemini-2.5-pro`. Documented in each Gemini SKILL.md and the Gemini plugin README.

This asymmetry is honest and avoids fake parameters. If Google adds a heavier model, swap it in for "deep" in v0.2.

---

## Files to create

### `codex-tools` plugin (8 files)

| Path | Purpose |
|---|---|
| `plugins/codex-tools/.claude-plugin/plugin.json` | Plugin manifest (name, description, author, license, keywords) |
| `plugins/codex-tools/README.md` | User-facing docs: prereqs, install, examples, attribution |
| `plugins/codex-tools/skills/codex-plan/SKILL.md` | Slash command `/codex-plan` |
| `plugins/codex-tools/skills/codex-review/SKILL.md` | Slash command `/codex-review` |
| `plugins/codex-tools/skills/codex-debug/SKILL.md` | Slash command `/codex-debug` |
| `plugins/codex-tools/agents/codex-plan.md` | Background agent for plan |
| `plugins/codex-tools/agents/codex-review.md` | Background agent for review |
| `plugins/codex-tools/agents/codex-debug.md` | Background agent for debug |

### `gemini-tools` plugin (8 files)

| Path | Purpose |
|---|---|
| `plugins/gemini-tools/.claude-plugin/plugin.json` | Plugin manifest |
| `plugins/gemini-tools/README.md` | User-facing docs |
| `plugins/gemini-tools/skills/gemini-plan/SKILL.md` | Slash command `/gemini-plan` |
| `plugins/gemini-tools/skills/gemini-review/SKILL.md` | Slash command `/gemini-review` |
| `plugins/gemini-tools/skills/gemini-debug/SKILL.md` | Slash command `/gemini-debug` |
| `plugins/gemini-tools/agents/gemini-plan.md` | Background agent for plan |
| `plugins/gemini-tools/agents/gemini-review.md` | Background agent for review |
| `plugins/gemini-tools/agents/gemini-debug.md` | Background agent for debug |

## Files to modify

| Path | Change |
|---|---|
| `.claude-plugin/marketplace.json` | Add two plugin entries (after `git-platform`) |
| `README.md` | Add two rows to the plugin table |
| `AGENTS.md` | Extend the structure tree to show new plugins |

---

## Testing approach (read this once)

Skills and agents are content artifacts, not code. The "tests" we have:

1. **JSON syntax** — `python3 -m json.tool <file> >/dev/null`. Catches malformed manifests.
2. **Manifest validation** — `claude plugin validate .` from repo root. Catches structural manifest errors and missing required fields.
3. **Frontmatter sanity** — a small grep check that each SKILL.md / agent file has the required frontmatter fields. (No off-the-shelf linter for this; we use grep.)
4. **Manual trigger test** — install in a scratch repo, type the slash command (or trigger phrase for agents), confirm the CLI is invoked with the expected flags. This is the only way to verify behavior end-to-end.

For each task that adds files, the steps are:

- Write a frontmatter-sanity bash check (a small assertion script)
- Run it before the file exists → fails
- Create the file with full content
- Run the bash check → passes
- Run `claude plugin validate .` → passes
- (Manual trigger test documented; run it before committing)
- Commit

The "test first, see fail, write code, see pass" rhythm holds. The tests are simpler than typical TDD because the artifact is markdown + frontmatter, not executable code.

---

## Task 1: Scaffold codex-tools plugin

**Files:**
- Create: `plugins/codex-tools/.claude-plugin/plugin.json`
- Create: `plugins/codex-tools/README.md`
- Modify: `.claude-plugin/marketplace.json`

This task makes `codex-tools` a valid (but empty) plugin that installs cleanly. Subsequent tasks add the skills and agents.

- [ ] **Step 1: Write the failing test**

Create `/tmp/test-codex-scaffold.sh`:

```bash
#!/usr/bin/env bash
set -e
test -f plugins/codex-tools/.claude-plugin/plugin.json || { echo "MISSING: plugin.json"; exit 1; }
test -f plugins/codex-tools/README.md || { echo "MISSING: README.md"; exit 1; }
python3 -m json.tool plugins/codex-tools/.claude-plugin/plugin.json >/dev/null || { echo "INVALID JSON: plugin.json"; exit 1; }
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null || { echo "INVALID JSON: marketplace.json"; exit 1; }
grep -q '"name": "codex-tools"' .claude-plugin/marketplace.json || { echo "MISSING marketplace entry: codex-tools"; exit 1; }
claude plugin validate . >/dev/null || { echo "manifest validate failed"; exit 1; }
echo "OK"
```

```bash
chmod +x /tmp/test-codex-scaffold.sh
```

- [ ] **Step 2: Run the test — expect failure**

Run: `/tmp/test-codex-scaffold.sh`
Expected: `MISSING: plugin.json` (exit 1).

- [ ] **Step 3: Create `plugins/codex-tools/.claude-plugin/plugin.json`**

```json
{
  "name": "codex-tools",
  "description": "Plan / review / debug ops backed by OpenAI's Codex CLI. Read-only delegation — Codex never edits your files. User-invoked only via slash commands or explicit trigger phrases.",
  "author": {
    "name": "dilee"
  },
  "homepage": "https://github.com/dilee/claude-extensions",
  "repository": "https://github.com/dilee/claude-extensions",
  "license": "MIT",
  "keywords": ["codex", "openai", "code-review", "planning", "debugging", "second-opinion"]
}
```

Note: no `version` field. Versions live in `marketplace.json` per repo convention.

- [ ] **Step 4: Create `plugins/codex-tools/README.md`**

```markdown
# codex-tools

Delegate read-only dev ops to OpenAI's Codex CLI from Claude Code. User-invoked only — these never auto-fire.

Inspired by [deepanscode/claude-code-extensions/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools).

## What you get

### Skills (slash commands, output streams to chat)

| Slash command | What it does |
|---|---|
| `/codex-plan` | Codex produces a plan / spec / architecture for a feature you describe. |
| `/codex-review` | Codex reviews the current branch's diff (or a scope you specify). |
| `/codex-debug` | Codex investigates a bug you describe and proposes a hypothesis. |

### Agents (fresh context, ~400-word summary)

| Agent | What it does |
|---|---|
| `codex-plan` | Background plan; returns a structured summary instead of the full plan. |
| `codex-review` | Background code review; returns issue list with severity. |
| `codex-debug` | Background debug session; returns hypothesis + suggested fix. |

## Prerequisites

- **Codex CLI** on PATH. Install: <https://github.com/openai/codex>
- **Authenticated**: run `codex login` once.

## Installation

```
/plugin marketplace add dilee/claude-extensions
/plugin install codex-tools@dilee
```

## Examples

```
/codex-plan add a webhook endpoint for Stripe events
deep codex plan refactor auth middleware to support multiple providers
have codex review this diff
spawn codex-debug agent — getting a 500 on /api/users intermittently
```

## Reasoning effort

Codex exposes a `model_reasoning_effort` knob:

| Phrase | Effort |
|---|---|
| (default) | `high` |
| "deep", "thorough", "extra-high" prefix | `xhigh` |

Example: `deep codex review`, `thorough codex plan`.

## Cost transparency

Each invocation prints a one-line notice before calling Codex, stating model and effort. The plugin never invokes Codex without surfacing this line first.

## Read-only by design

Every Codex call uses `-s read-only`. Codex cannot modify your workspace through this plugin. If you want Codex to write code, run `codex` directly.

## Attribution

Inspired by [deepanscode/claude-code-extensions/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools).
```

- [ ] **Step 5: Add marketplace entry**

In `.claude-plugin/marketplace.json`, add this object to the `plugins` array, after the `git-platform` entry:

```json
{
  "name": "codex-tools",
  "source": "./plugins/codex-tools",
  "description": "Plan / review / debug ops backed by OpenAI's Codex CLI. Read-only delegation, user-invoked only.",
  "version": "0.1.0",
  "keywords": ["codex", "openai", "code-review", "planning", "debugging"],
  "license": "MIT"
}
```

Make sure the JSON remains valid (comma after the previous entry).

- [ ] **Step 6: Run the test — expect pass**

Run: `/tmp/test-codex-scaffold.sh`
Expected: `OK` (exit 0).

- [ ] **Step 7: Manual trigger test**

In a scratch git repo:

```
/plugin marketplace add /Users/dilee/Documents/Development/claude-extensions
/plugin install codex-tools@dilee
```

Both commands should succeed. The plugin will list no skills / agents yet — that's expected at this stage.

- [ ] **Step 8: Commit**

```bash
git add plugins/codex-tools/.claude-plugin/plugin.json \
        plugins/codex-tools/README.md \
        .claude-plugin/marketplace.json
git commit -m "feat(codex-tools): scaffold plugin (manifest + README)"
```

---

## Task 2: codex-plan skill + agent

**Files:**
- Create: `plugins/codex-tools/skills/codex-plan/SKILL.md`
- Create: `plugins/codex-tools/agents/codex-plan.md`

- [ ] **Step 1: Write the frontmatter-sanity test**

Append to `/tmp/test-codex-scaffold.sh` (or create `/tmp/test-codex-plan.sh`):

```bash
#!/usr/bin/env bash
set -e
SKILL=plugins/codex-tools/skills/codex-plan/SKILL.md
AGENT=plugins/codex-tools/agents/codex-plan.md
test -f "$SKILL" || { echo "MISSING: $SKILL"; exit 1; }
test -f "$AGENT" || { echo "MISSING: $AGENT"; exit 1; }
grep -q '^description: ' "$SKILL" || { echo "$SKILL: missing description"; exit 1; }
grep -q '^disable-model-invocation: true' "$SKILL" || { echo "$SKILL: missing disable-model-invocation"; exit 1; }
grep -q 'codex exec' "$SKILL" || { echo "$SKILL: missing codex exec invocation"; exit 1; }
grep -q '\-s read-only' "$SKILL" || { echo "$SKILL: missing read-only sandbox"; exit 1; }
grep -q "command -v codex" "$SKILL" || { echo "$SKILL: missing preflight check"; exit 1; }
grep -q '^name: codex-plan' "$AGENT" || { echo "$AGENT: missing name frontmatter"; exit 1; }
grep -q '^description: ' "$AGENT" || { echo "$AGENT: missing description"; exit 1; }
grep -q '^tools: ' "$AGENT" || { echo "$AGENT: missing tools field"; exit 1; }
grep -q '\-s read-only' "$AGENT" || { echo "$AGENT: missing read-only sandbox"; exit 1; }
grep -q '400 words' "$AGENT" || { echo "$AGENT: missing 400-word cap"; exit 1; }
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-codex-plan.sh`.

- [ ] **Step 2: Run the test — expect failure**

Run: `/tmp/test-codex-plan.sh`
Expected: `MISSING: plugins/codex-tools/skills/codex-plan/SKILL.md`.

- [ ] **Step 3: Create `plugins/codex-tools/skills/codex-plan/SKILL.md`**

```markdown
---
description: Run an OpenAI Codex planning session for a feature on the current project. TRIGGER only when the user types `/codex-plan` or explicitly says "use codex to plan", "have codex plan this", "deep codex plan". Do NOT auto-invoke under any other circumstance.
disable-model-invocation: true
---

# Codex plan

Use Codex (OpenAI) to produce a plan / spec / architecture proposal for a feature on the current project. Read-only — Codex cannot edit files. Output streams into chat for review.

## Trigger

Fires on:

- Slash command: `/codex-plan`
- Explicit phrases: "use codex to plan", "have codex plan this feature", "second-opinion plan with codex"
- "Deep" / "thorough" / "extra-high" prefix invokes `xhigh` reasoning effort.

## Reasoning effort

| Phrase | Effort flag |
|---|---|
| (default) | `-c model_reasoning_effort="high"` |
| "deep codex plan", "thorough codex plan", "extra-high codex plan" | `-c model_reasoning_effort="xhigh"` |

## Steps

### Step 1 — Preflight

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  echo "Then run: codex login"
  exit 1
}
```

If preflight fails, surface the message and stop. Do not proceed.

### Step 2 — Gather context

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
RECENT="$(git log --oneline -5 2>/dev/null || true)"
TREE="$(ls -1)"
```

Ask the user (if not already provided):

- What feature should Codex plan?
- Any constraints, target files, or integration points?

### Step 3 — Build the prompt

Combine the user's feature description with the context:

```
You are a senior engineer producing a focused implementation plan for the following feature.

## Project
- Root: $ROOT
- Branch: $BRANCH
- Top-level: $TREE
- Recent commits: $RECENT

## Feature
<user's description>

## Constraints
<user's constraints>

## Output format
- One-paragraph summary
- File-by-file breakdown of changes
- Key decisions and tradeoffs
- Risks and unknowns
- Suggested next steps
```

### Step 4 — Cost notice

Print this line in chat before running:

```
About to call Codex (read-only sandbox, effort: <high|xhigh>). This consumes API credits.
```

### Step 5 — Run Codex

```bash
codex exec \
  -s read-only \
  -c model_reasoning_effort="<high|xhigh>" \
  -C "$ROOT" \
  "$PROMPT"
```

Stream output to chat. Do not summarise. The user wants the full plan to discuss.

### Step 6 — Hand off

After Codex finishes, ask the user whether to (a) refine the plan, (b) hand it off to Claude Code for implementation, or (c) discard.

## Hard rules

- Read-only sandbox always. Never `workspace-write`.
- Never auto-fire — require slash command or explicit phrase.
- Never pipe Codex output through Claude — show it raw to the user.
```

- [ ] **Step 4: Create `plugins/codex-tools/agents/codex-plan.md`**

```markdown
---
name: codex-plan
description: Use this agent when the user asks for a Codex planning session in the background — phrases like "spawn codex-plan agent", "have codex plan in the background", "background codex plan". Returns a ~400-word structured summary of the plan instead of the full Codex output.
tools: Bash, Read
---

Your single job: run a Codex planning session in this fresh context, capture the output, and return a concise structured summary. The user dispatched you specifically because they did not want the full plan polluting the main conversation.

## Trigger phrases

"spawn codex-plan agent", "have codex plan in the background", "background codex plan", "use codex-plan agent for X". Always invoked explicitly.

## Steps

### Step 1 — Preflight

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  echo "Then run: codex login"
  exit 1
}
```

### Step 2 — Gather context

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
RECENT="$(git log --oneline -5 2>/dev/null || true)"
TREE="$(ls -1)"
```

The dispatching context will have given you a feature description and any constraints in the prompt.

### Step 3 — Run Codex with output capture

```bash
codex exec \
  -s read-only \
  -c model_reasoning_effort="<high|xhigh>" \
  -C "$ROOT" \
  --output-last-message /tmp/codex-plan-output.md \
  "<built prompt — same shape as the codex-plan skill's Step 3>"
```

Use `xhigh` if the dispatching prompt said "deep", "thorough", or "extra-high"; otherwise `high`.

### Step 4 — Read the output

```bash
cat /tmp/codex-plan-output.md
```

### Step 5 — Return the structured summary

Return only this format:

---
## Codex Plan Summary

**Feature:** <one-line description>

**Approach:** <2-3 sentences>

**File-by-file:**
- `path/to/file` — <what changes>
- `path/to/file` — <what changes>

**Key decisions:**
- <decision> — <reasoning>

**Risks / unknowns:**
- <item>

**Next steps:**
- <step>
---

## Hard rules

- **Cap the report at ~400 words.** Link to the temp file (`/tmp/codex-plan-output.md`) instead of quoting long passages.
- Read-only sandbox always.
- Do not act on the plan — only report it.
```

- [ ] **Step 5: Run the test — expect pass**

Run: `/tmp/test-codex-plan.sh`
Expected: `OK`.

- [ ] **Step 6: Manual trigger test**

In a scratch repo with the plugin installed:

1. Type `/codex-plan add a hello-world endpoint` and confirm Codex is invoked with `-s read-only -c model_reasoning_effort="high"`.
2. Type `deep codex plan refactor auth` and confirm Codex is invoked with `model_reasoning_effort="xhigh"`.
3. Ask: "spawn codex-plan agent for adding a healthcheck route" and confirm the agent fires with output capped at ~400 words.

If any of these fire when they shouldn't (e.g., during routine work without the trigger phrase), the description's trigger spec is wrong — go back to Step 3 and tighten it.

- [ ] **Step 7: Commit**

```bash
git add plugins/codex-tools/skills/codex-plan/SKILL.md \
        plugins/codex-tools/agents/codex-plan.md
git commit -m "feat(codex-tools): add codex-plan skill and agent"
```

---

## Task 3: codex-review skill + agent

**Files:**
- Create: `plugins/codex-tools/skills/codex-review/SKILL.md`
- Create: `plugins/codex-tools/agents/codex-review.md`

- [ ] **Step 1: Frontmatter-sanity test**

Create `/tmp/test-codex-review.sh` (same shape as Task 2's test, with paths swapped to `codex-review`):

```bash
#!/usr/bin/env bash
set -e
SKILL=plugins/codex-tools/skills/codex-review/SKILL.md
AGENT=plugins/codex-tools/agents/codex-review.md
test -f "$SKILL" && test -f "$AGENT"
grep -q '^description: ' "$SKILL"
grep -q '^disable-model-invocation: true' "$SKILL"
grep -q 'codex exec' "$SKILL"
grep -q '\-s read-only' "$SKILL"
grep -q "command -v codex" "$SKILL"
grep -q '^name: codex-review' "$AGENT"
grep -q '\-s read-only' "$AGENT"
grep -q '400 words' "$AGENT"
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-codex-review.sh`.

- [ ] **Step 2: Run the test — expect failure**

Run: `/tmp/test-codex-review.sh`
Expected: failure (skill file missing).

- [ ] **Step 3: Create `plugins/codex-tools/skills/codex-review/SKILL.md`**

```markdown
---
description: Run an OpenAI Codex code review on a diff or files. TRIGGER only when the user types `/codex-review` or explicitly says "use codex to review", "have codex review this", "second-opinion review with codex", "deep codex review". Do NOT auto-invoke.
disable-model-invocation: true
---

# Codex review

Use Codex to review code. Default scope is the current branch's diff vs the base branch; the user can override with a path, staged diff, or commit range.

## Trigger

- Slash command: `/codex-review` (with optional argument: a path, commit range, or `--staged`).
- Explicit phrases: "use codex to review", "have codex review this", "second-opinion review with codex".
- "Deep" / "thorough" / "extra-high" prefix → `xhigh` reasoning effort.

## Reasoning effort

| Phrase | Effort flag |
|---|---|
| (default) | `-c model_reasoning_effort="high"` |
| "deep codex review", "thorough codex review", "extra-high codex review" | `-c model_reasoning_effort="xhigh"` |

## Steps

### Step 1 — Preflight

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  echo "Then run: codex login"
  exit 1
}
```

### Step 2 — Resolve scope

```bash
ROOT="$(pwd)"
# Detect base branch: try origin/develop, origin/main, origin/master in order.
BASE="$(git show-ref --verify --quiet refs/remotes/origin/develop && echo origin/develop \
       || git show-ref --verify --quiet refs/remotes/origin/main && echo origin/main \
       || echo origin/master)"
# Default: current branch diff vs base.
DIFF="$(git diff "$BASE"...HEAD)"
FILES_CHANGED="$(git diff --name-only "$BASE"...HEAD)"
```

If the user passed a path or `--staged`, override:

- Path: `DIFF="$(git diff -- "<path>")"` and `FILES_CHANGED="<path>"`.
- `--staged`: `DIFF="$(git diff --staged)"`.
- Commit range: `DIFF="$(git diff <range>)"`.

If the diff is empty, stop and tell the user there's nothing to review.

### Step 3 — Build the prompt

```
You are a senior engineer reviewing a code change. Be concrete: name files and lines, classify severity, suggest fixes.

## Repo
- Root: $ROOT
- Base: $BASE
- Changed files: $FILES_CHANGED

## Diff
<the diff, in a fenced block>

## Output format
Group findings by severity:

### Must fix (correctness, security, data loss)
- file:line — issue — suggested fix

### Should consider (design, perf, readability)
- file:line — issue — suggested fix

### Nits (style, naming)
- file:line — note

If nothing to flag in a section, say "(none)".
```

### Step 4 — Cost notice

```
About to call Codex (read-only sandbox, effort: <high|xhigh>). This consumes API credits.
```

### Step 5 — Run Codex

```bash
codex exec \
  -s read-only \
  -c model_reasoning_effort="<high|xhigh>" \
  -C "$ROOT" \
  "$PROMPT"
```

Stream output to chat as-is.

### Step 6 — Hand off

Ask the user whether to (a) discuss specific findings, (b) act on them with Claude Code, or (c) discard.

## Hard rules

- Read-only always.
- If the diff is empty, refuse — do not call Codex with no content to review.
- Never auto-fire.
```

- [ ] **Step 4: Create `plugins/codex-tools/agents/codex-review.md`**

```markdown
---
name: codex-review
description: Use this agent when the user asks for a Codex code review in the background — phrases like "spawn codex-review agent", "have codex review in the background", "background codex review". Returns a ~400-word issue list grouped by severity.
tools: Bash, Read
---

Your single job: run a Codex code review in this fresh context and return a concise structured issue list. Always invoked explicitly.

## Steps

### Step 1 — Preflight

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  exit 1
}
```

### Step 2 — Resolve scope

```bash
ROOT="$(pwd)"
BASE="$(git show-ref --verify --quiet refs/remotes/origin/develop && echo origin/develop \
       || git show-ref --verify --quiet refs/remotes/origin/main && echo origin/main \
       || echo origin/master)"
DIFF="$(git diff "$BASE"...HEAD)"
FILES_CHANGED="$(git diff --name-only "$BASE"...HEAD)"
```

If the dispatcher specified a different scope (path, `--staged`, commit range), use that.

If the diff is empty, return: "No changes to review." and stop.

### Step 3 — Run Codex with output capture

```bash
codex exec \
  -s read-only \
  -c model_reasoning_effort="<high|xhigh>" \
  -C "$ROOT" \
  --output-last-message /tmp/codex-review-output.md \
  "<prompt — same shape as the codex-review skill's Step 3>"
```

### Step 4 — Read the output

```bash
cat /tmp/codex-review-output.md
```

### Step 5 — Return the structured summary

Return only this format:

---
## Codex Review Summary

**Scope:** <e.g. "branch vs origin/main, 7 files">

**Must fix (N):**
- `file:line` — <issue> — <fix>

**Should consider (N):**
- `file:line` — <issue>

**Nits (N):**
- `file:line` — <note>

Full review at `/tmp/codex-review-output.md`.
---

## Hard rules

- **Cap the report at ~400 words.** Link to the temp file rather than quoting findings in full.
- Read-only sandbox always.
- Report only. Do not edit code.
```

- [ ] **Step 5: Run the test — expect pass**

Run: `/tmp/test-codex-review.sh`
Expected: `OK`.

- [ ] **Step 6: Manual trigger test**

In a scratch repo with some uncommitted changes:

1. `/codex-review` — confirm it diffs against `origin/main` (or `origin/develop`) and calls Codex.
2. `/codex-review --staged` — confirm scope changes.
3. `deep codex review` — confirm `xhigh` effort.
4. With no uncommitted changes: confirm the skill says "nothing to review" without calling Codex.
5. "spawn codex-review agent" — confirm the agent fires with ≤ ~400 word output.

- [ ] **Step 7: Commit**

```bash
git add plugins/codex-tools/skills/codex-review/SKILL.md \
        plugins/codex-tools/agents/codex-review.md
git commit -m "feat(codex-tools): add codex-review skill and agent"
```

---

## Task 4: codex-debug skill + agent

**Files:**
- Create: `plugins/codex-tools/skills/codex-debug/SKILL.md`
- Create: `plugins/codex-tools/agents/codex-debug.md`

- [ ] **Step 1: Frontmatter-sanity test**

Create `/tmp/test-codex-debug.sh`:

```bash
#!/usr/bin/env bash
set -e
SKILL=plugins/codex-tools/skills/codex-debug/SKILL.md
AGENT=plugins/codex-tools/agents/codex-debug.md
test -f "$SKILL" && test -f "$AGENT"
grep -q '^description: ' "$SKILL"
grep -q '^disable-model-invocation: true' "$SKILL"
grep -q 'codex exec' "$SKILL"
grep -q '\-s read-only' "$SKILL"
grep -q "command -v codex" "$SKILL"
grep -q '^name: codex-debug' "$AGENT"
grep -q '\-s read-only' "$AGENT"
grep -q '400 words' "$AGENT"
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-codex-debug.sh`.

- [ ] **Step 2: Run the test — expect failure**

Run: `/tmp/test-codex-debug.sh`
Expected: failure (files missing).

- [ ] **Step 3: Create `plugins/codex-tools/skills/codex-debug/SKILL.md`**

```markdown
---
description: Run an OpenAI Codex debugging session — investigate a bug, propose a hypothesis, and suggest a fix. TRIGGER only when the user types `/codex-debug` or explicitly says "use codex to debug", "have codex debug this", "second-opinion debug with codex", "deep codex debug". Do NOT auto-invoke.
disable-model-invocation: true
---

# Codex debug

Use Codex to investigate a bug. Read-only — Codex never patches code from this skill. Output streams to chat so you can act on the hypothesis with Claude Code.

## Trigger

- Slash command: `/codex-debug <bug description>`.
- Explicit phrases: "use codex to debug", "have codex debug this", "second-opinion debug with codex".
- "Deep" / "thorough" / "extra-high" prefix → `xhigh` reasoning effort.

## Reasoning effort

| Phrase | Effort flag |
|---|---|
| (default) | `-c model_reasoning_effort="high"` |
| "deep codex debug", "thorough codex debug", "extra-high codex debug" | `-c model_reasoning_effort="xhigh"` |

## Steps

### Step 1 — Preflight

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  echo "Then run: codex login"
  exit 1
}
```

### Step 2 — Gather inputs

Ask the user (if not already provided):

- The bug symptom — what's expected vs what's happening?
- Reproduction steps if known.
- Error message / stack trace if available.
- Relevant file paths (the user can name them; Codex will read them in its sandbox).

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
RECENT="$(git log --oneline -5 2>/dev/null || true)"
```

### Step 3 — Build the prompt

```
You are a senior engineer debugging a reported issue. Read the code carefully before forming a hypothesis. Be specific about file paths and line numbers.

## Repo
- Root: $ROOT
- Branch: $BRANCH
- Recent commits: $RECENT

## Symptom
<user's bug description>

## Repro
<user's repro steps>

## Error / stack trace
<paste, if any>

## Relevant files
<user-named paths, if any>

## Output format
1. **Most likely root cause** — file, line, mechanism.
2. **Why it produces the symptom** — chain of reasoning.
3. **Suggested fix** — concrete patch idea (do not edit files).
4. **Alternative hypotheses** — ranked by likelihood, briefly.
5. **What to check next** — diagnostics if hypothesis is uncertain.
```

### Step 4 — Cost notice

```
About to call Codex (read-only sandbox, effort: <high|xhigh>). This consumes API credits.
```

### Step 5 — Run Codex

```bash
codex exec \
  -s read-only \
  -c model_reasoning_effort="<high|xhigh>" \
  -C "$ROOT" \
  "$PROMPT"
```

Stream output to chat.

### Step 6 — Hand off

Ask the user whether to (a) discuss the hypothesis, (b) hand off the suggested fix to Claude Code for implementation, or (c) try a different angle.

## Hard rules

- Read-only always.
- Codex does not patch code from this skill — it only proposes.
- Never auto-fire.
```

- [ ] **Step 4: Create `plugins/codex-tools/agents/codex-debug.md`**

```markdown
---
name: codex-debug
description: Use this agent when the user asks for a Codex debug session in the background — phrases like "spawn codex-debug agent", "have codex debug in the background", "background codex debug". Returns a ~400-word hypothesis with suggested fix.
tools: Bash, Read
---

Your single job: run a Codex debug investigation in this fresh context and return a concise hypothesis. Always invoked explicitly.

## Steps

### Step 1 — Preflight

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  exit 1
}
```

### Step 2 — Inputs

The dispatcher will have given you the bug symptom, repro steps, error, and relevant file paths in the prompt.

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
```

### Step 3 — Run Codex with output capture

```bash
codex exec \
  -s read-only \
  -c model_reasoning_effort="<high|xhigh>" \
  -C "$ROOT" \
  --output-last-message /tmp/codex-debug-output.md \
  "<prompt — same shape as the codex-debug skill's Step 3>"
```

### Step 4 — Read the output

```bash
cat /tmp/codex-debug-output.md
```

### Step 5 — Return the structured summary

Return only this format:

---
## Codex Debug Summary

**Bug:** <one-line>

**Most likely root cause:** `file:line` — <mechanism>

**Why it produces the symptom:** <2-3 sentences>

**Suggested fix:** <concrete patch idea>

**Alternative hypotheses:**
- <hypothesis> — <likelihood>

**Diagnostics to run next:**
- <command or check>

Full investigation at `/tmp/codex-debug-output.md`.
---

## Hard rules

- **Cap the report at ~400 words.** Link to the temp file.
- Read-only sandbox always.
- Report only. Do not patch code.
```

- [ ] **Step 5: Run the test — expect pass**

Run: `/tmp/test-codex-debug.sh`
Expected: `OK`.

- [ ] **Step 6: Manual trigger test**

1. `/codex-debug 500 error on /api/users intermittently` — confirm Codex is invoked.
2. `deep codex debug` with same symptom — confirm `xhigh` effort.
3. "spawn codex-debug agent" — confirm agent output is ≤ ~400 words.

- [ ] **Step 7: Commit**

```bash
git add plugins/codex-tools/skills/codex-debug/SKILL.md \
        plugins/codex-tools/agents/codex-debug.md
git commit -m "feat(codex-tools): add codex-debug skill and agent"
```

---

## Task 5: Scaffold gemini-tools plugin

Mirrors Task 1 with `gemini-tools` paths and Gemini-specific copy.

**Files:**
- Create: `plugins/gemini-tools/.claude-plugin/plugin.json`
- Create: `plugins/gemini-tools/README.md`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Write the failing test**

Create `/tmp/test-gemini-scaffold.sh`:

```bash
#!/usr/bin/env bash
set -e
test -f plugins/gemini-tools/.claude-plugin/plugin.json
test -f plugins/gemini-tools/README.md
python3 -m json.tool plugins/gemini-tools/.claude-plugin/plugin.json >/dev/null
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
grep -q '"name": "gemini-tools"' .claude-plugin/marketplace.json
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-gemini-scaffold.sh`.

- [ ] **Step 2: Run the test — expect failure**

Run: `/tmp/test-gemini-scaffold.sh`
Expected: failure.

- [ ] **Step 3: Create `plugins/gemini-tools/.claude-plugin/plugin.json`**

```json
{
  "name": "gemini-tools",
  "description": "Plan / review / debug ops backed by Google's Gemini CLI. Read-only delegation — Gemini never edits your files. User-invoked only via slash commands or explicit trigger phrases.",
  "author": {
    "name": "dilee"
  },
  "homepage": "https://github.com/dilee/claude-extensions",
  "repository": "https://github.com/dilee/claude-extensions",
  "license": "MIT",
  "keywords": ["gemini", "google", "code-review", "planning", "debugging", "second-opinion"]
}
```

- [ ] **Step 4: Create `plugins/gemini-tools/README.md`**

```markdown
# gemini-tools

Delegate read-only dev ops to Google's Gemini CLI from Claude Code. User-invoked only — these never auto-fire.

Inspired by [deepanscode/claude-code-extensions/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools), structured for Gemini CLI's invocation contract.

## What you get

### Skills (slash commands, output streams to chat)

| Slash command | What it does |
|---|---|
| `/gemini-plan` | Gemini produces a plan / spec / architecture for a feature you describe. |
| `/gemini-review` | Gemini reviews the current branch's diff (or a scope you specify). |
| `/gemini-debug` | Gemini investigates a bug you describe and proposes a hypothesis. |

### Agents (fresh context, ~400-word summary)

| Agent | What it does |
|---|---|
| `gemini-plan` | Background plan; structured summary. |
| `gemini-review` | Background code review; issue list with severity. |
| `gemini-debug` | Background debug session; hypothesis + suggested fix. |

## Prerequisites

- **Gemini CLI** on PATH. Install: <https://github.com/google/gemini-cli>
- **Authenticated**: see Gemini CLI docs for auth setup.

## Installation

```
/plugin marketplace add dilee/claude-extensions
/plugin install gemini-tools@dilee
```

## Examples

```
/gemini-plan add a webhook endpoint for Stripe events
have gemini review this diff
spawn gemini-debug agent — getting a 500 on /api/users intermittently
```

## Effort knob — honest asymmetry note

Gemini CLI does not currently expose a thinking-budget flag. For v1:

- Both default and "deep" effort use `gemini-2.5-pro`.
- "deep gemini plan" / "thorough gemini review" / etc. are **accepted but currently no-op** — they're reserved for a future version when a heavier Gemini model is available.

This is intentional asymmetry with `codex-tools`, which exposes a real `model_reasoning_effort` knob.

## Read-only by design

Every Gemini call uses `--approval-mode plan` (Gemini's read-only mode). Gemini cannot modify your workspace through this plugin.

## Cost transparency

Each invocation prints a one-line notice before calling Gemini, stating model and effort. The plugin never invokes Gemini without surfacing this line first.

## Attribution

Inspired by [deepanscode/claude-code-extensions/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools).
```

- [ ] **Step 5: Add marketplace entry**

In `.claude-plugin/marketplace.json`, add this object to the `plugins` array, after the `codex-tools` entry:

```json
{
  "name": "gemini-tools",
  "source": "./plugins/gemini-tools",
  "description": "Plan / review / debug ops backed by Google's Gemini CLI. Read-only delegation, user-invoked only.",
  "version": "0.1.0",
  "keywords": ["gemini", "google", "code-review", "planning", "debugging"],
  "license": "MIT"
}
```

- [ ] **Step 6: Run the test — expect pass**

Run: `/tmp/test-gemini-scaffold.sh`
Expected: `OK`.

- [ ] **Step 7: Manual install test**

In a scratch repo: `/plugin install gemini-tools@dilee` succeeds.

- [ ] **Step 8: Commit**

```bash
git add plugins/gemini-tools/.claude-plugin/plugin.json \
        plugins/gemini-tools/README.md \
        .claude-plugin/marketplace.json
git commit -m "feat(gemini-tools): scaffold plugin (manifest + README)"
```

---

## Task 6: gemini-plan skill + agent

Mirrors Task 2 with Gemini's CLI contract: `gemini -p "<prompt>" -m gemini-2.5-pro --approval-mode plan -o text`. No `model_reasoning_effort` flag (no Gemini equivalent in v1).

**Files:**
- Create: `plugins/gemini-tools/skills/gemini-plan/SKILL.md`
- Create: `plugins/gemini-tools/agents/gemini-plan.md`

- [ ] **Step 1: Frontmatter-sanity test**

Create `/tmp/test-gemini-plan.sh`:

```bash
#!/usr/bin/env bash
set -e
SKILL=plugins/gemini-tools/skills/gemini-plan/SKILL.md
AGENT=plugins/gemini-tools/agents/gemini-plan.md
test -f "$SKILL" && test -f "$AGENT"
grep -q '^description: ' "$SKILL"
grep -q '^disable-model-invocation: true' "$SKILL"
grep -q 'gemini -p' "$SKILL"
grep -q '\-\-approval-mode plan' "$SKILL"
grep -q "command -v gemini" "$SKILL"
grep -q '^name: gemini-plan' "$AGENT"
grep -q '\-\-approval-mode plan' "$AGENT"
grep -q '400 words' "$AGENT"
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-gemini-plan.sh`.

- [ ] **Step 2: Run the test — expect failure**

Run: `/tmp/test-gemini-plan.sh`
Expected: failure.

- [ ] **Step 3: Create `plugins/gemini-tools/skills/gemini-plan/SKILL.md`**

```markdown
---
description: Run a Google Gemini planning session for a feature on the current project. TRIGGER only when the user types `/gemini-plan` or explicitly says "use gemini to plan", "have gemini plan this", "deep gemini plan". Do NOT auto-invoke under any other circumstance.
disable-model-invocation: true
---

# Gemini plan

Use Gemini to produce a plan / spec / architecture proposal for a feature on the current project. Read-only — Gemini cannot edit files. Output streams into chat for review.

## Trigger

- Slash command: `/gemini-plan <feature description>`
- Explicit phrases: "use gemini to plan", "have gemini plan this feature", "second-opinion plan with gemini"
- "Deep" / "thorough" / "extra-high" prefix is accepted but **no-op in v1** (Gemini CLI doesn't expose an effort knob).

## Effort knob

Gemini CLI does not currently expose a `model_reasoning_effort` equivalent. Both default and "deep" invocations use `gemini-2.5-pro`. The phrasing is reserved for a future version with a heavier Gemini model.

## Steps

### Step 1 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "Gemini CLI not found. Install: https://github.com/google/gemini-cli"
  echo "Then authenticate per the Gemini CLI docs."
  exit 1
}
```

### Step 2 — Gather context

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
RECENT="$(git log --oneline -5 2>/dev/null || true)"
TREE="$(ls -1)"
```

Ask the user (if not already provided):

- What feature should Gemini plan?
- Any constraints, target files, or integration points?

### Step 3 — Build the prompt

```
You are a senior engineer producing a focused implementation plan for the following feature.

## Project
- Root: $ROOT
- Branch: $BRANCH
- Top-level: $TREE
- Recent commits: $RECENT

## Feature
<user's description>

## Constraints
<user's constraints>

## Output format
- One-paragraph summary
- File-by-file breakdown of changes
- Key decisions and tradeoffs
- Risks and unknowns
- Suggested next steps
```

### Step 4 — Cost notice

```
About to call Gemini (read-only / approval-mode plan, model: gemini-2.5-pro). This consumes API credits.
```

### Step 5 — Run Gemini

```bash
cd "$ROOT" && gemini \
  -p "$PROMPT" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text
```

Stream output to chat. Do not summarise.

### Step 6 — Hand off

Ask the user whether to (a) refine the plan, (b) hand it off to Claude Code for implementation, or (c) discard.

## Hard rules

- `--approval-mode plan` (read-only) always. Never `yolo` or `auto_edit`.
- Never auto-fire — require slash command or explicit phrase.
- Never pipe Gemini output through Claude — show it raw.
```

- [ ] **Step 4: Create `plugins/gemini-tools/agents/gemini-plan.md`**

```markdown
---
name: gemini-plan
description: Use this agent when the user asks for a Gemini planning session in the background — phrases like "spawn gemini-plan agent", "have gemini plan in the background", "background gemini plan". Returns a ~400-word structured summary of the plan instead of the full Gemini output.
tools: Bash, Read
---

Your single job: run a Gemini planning session in this fresh context, capture the output, and return a concise structured summary.

## Steps

### Step 1 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "Gemini CLI not found. Install: https://github.com/google/gemini-cli"
  exit 1
}
```

### Step 2 — Gather context

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
RECENT="$(git log --oneline -5 2>/dev/null || true)"
TREE="$(ls -1)"
```

The dispatching context will have given you a feature description and any constraints in the prompt.

### Step 3 — Run Gemini with output capture

```bash
cd "$ROOT" && gemini \
  -p "<built prompt — same shape as the gemini-plan skill's Step 3>" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text > /tmp/gemini-plan-output.md
```

### Step 4 — Read the output

```bash
cat /tmp/gemini-plan-output.md
```

### Step 5 — Return the structured summary

Return only this format:

---
## Gemini Plan Summary

**Feature:** <one-line description>

**Approach:** <2-3 sentences>

**File-by-file:**
- `path/to/file` — <what changes>

**Key decisions:**
- <decision> — <reasoning>

**Risks / unknowns:**
- <item>

**Next steps:**
- <step>

Full plan at `/tmp/gemini-plan-output.md`.
---

## Hard rules

- **Cap the report at ~400 words.** Link to the temp file.
- `--approval-mode plan` always.
- Do not act on the plan.
```

- [ ] **Step 5: Run the test — expect pass**

Run: `/tmp/test-gemini-plan.sh`
Expected: `OK`.

- [ ] **Step 6: Manual trigger test**

1. `/gemini-plan add a webhook endpoint` — confirm Gemini is invoked with `--approval-mode plan` and `-m gemini-2.5-pro`.
2. `deep gemini plan` — confirm same flags (no-op in v1, by design).
3. "spawn gemini-plan agent" — confirm output ≤ ~400 words.

- [ ] **Step 7: Commit**

```bash
git add plugins/gemini-tools/skills/gemini-plan/SKILL.md \
        plugins/gemini-tools/agents/gemini-plan.md
git commit -m "feat(gemini-tools): add gemini-plan skill and agent"
```

---

## Task 7: gemini-review skill + agent

Mirrors Task 3 with Gemini's CLI contract.

**Files:**
- Create: `plugins/gemini-tools/skills/gemini-review/SKILL.md`
- Create: `plugins/gemini-tools/agents/gemini-review.md`

- [ ] **Step 1: Frontmatter-sanity test**

Create `/tmp/test-gemini-review.sh` (same shape as Task 6, paths swapped to `gemini-review`).

```bash
#!/usr/bin/env bash
set -e
SKILL=plugins/gemini-tools/skills/gemini-review/SKILL.md
AGENT=plugins/gemini-tools/agents/gemini-review.md
test -f "$SKILL" && test -f "$AGENT"
grep -q '^description: ' "$SKILL"
grep -q '^disable-model-invocation: true' "$SKILL"
grep -q 'gemini -p' "$SKILL"
grep -q '\-\-approval-mode plan' "$SKILL"
grep -q "command -v gemini" "$SKILL"
grep -q '^name: gemini-review' "$AGENT"
grep -q '\-\-approval-mode plan' "$AGENT"
grep -q '400 words' "$AGENT"
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-gemini-review.sh`.

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Create `plugins/gemini-tools/skills/gemini-review/SKILL.md`**

```markdown
---
description: Run a Google Gemini code review on a diff or files. TRIGGER only when the user types `/gemini-review` or explicitly says "use gemini to review", "have gemini review this", "second-opinion review with gemini". Do NOT auto-invoke.
disable-model-invocation: true
---

# Gemini review

Use Gemini to review code. Default scope is the current branch's diff vs the base branch; override with a path, staged diff, or commit range.

## Trigger

- Slash command: `/gemini-review` (with optional argument: a path, commit range, or `--staged`).
- Explicit phrases: "use gemini to review", "have gemini review this", "second-opinion review with gemini".
- "Deep" / "thorough" / "extra-high" prefix is accepted but no-op in v1.

## Effort knob

Same as `gemini-plan`: no-op in v1; reserved for a future heavier Gemini model.

## Steps

### Step 1 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "Gemini CLI not found. Install: https://github.com/google/gemini-cli"
  exit 1
}
```

### Step 2 — Resolve scope

```bash
ROOT="$(pwd)"
BASE="$(git show-ref --verify --quiet refs/remotes/origin/develop && echo origin/develop \
       || git show-ref --verify --quiet refs/remotes/origin/main && echo origin/main \
       || echo origin/master)"
DIFF="$(git diff "$BASE"...HEAD)"
FILES_CHANGED="$(git diff --name-only "$BASE"...HEAD)"
```

If the user passed a path or `--staged`, override accordingly.

If the diff is empty, stop and tell the user there's nothing to review.

### Step 3 — Build the prompt

```
You are a senior engineer reviewing a code change. Be concrete: name files and lines, classify severity, suggest fixes.

## Repo
- Root: $ROOT
- Base: $BASE
- Changed files: $FILES_CHANGED

## Diff
<the diff, in a fenced block>

## Output format
Group findings by severity:

### Must fix (correctness, security, data loss)
- file:line — issue — suggested fix

### Should consider (design, perf, readability)
- file:line — issue — suggested fix

### Nits (style, naming)
- file:line — note

If nothing to flag in a section, say "(none)".
```

### Step 4 — Cost notice

```
About to call Gemini (read-only / approval-mode plan, model: gemini-2.5-pro). This consumes API credits.
```

### Step 5 — Run Gemini

```bash
cd "$ROOT" && gemini \
  -p "$PROMPT" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text
```

Stream output to chat as-is.

### Step 6 — Hand off

Ask the user whether to (a) discuss specific findings, (b) act on them with Claude Code, or (c) discard.

## Hard rules

- `--approval-mode plan` always.
- If the diff is empty, refuse — do not call Gemini with no content to review.
- Never auto-fire.
```

- [ ] **Step 4: Create `plugins/gemini-tools/agents/gemini-review.md`**

```markdown
---
name: gemini-review
description: Use this agent when the user asks for a Gemini code review in the background — phrases like "spawn gemini-review agent", "have gemini review in the background", "background gemini review". Returns a ~400-word issue list grouped by severity.
tools: Bash, Read
---

Your single job: run a Gemini code review in this fresh context and return a concise structured issue list.

## Steps

### Step 1 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "Gemini CLI not found. Install: https://github.com/google/gemini-cli"
  exit 1
}
```

### Step 2 — Resolve scope

```bash
ROOT="$(pwd)"
BASE="$(git show-ref --verify --quiet refs/remotes/origin/develop && echo origin/develop \
       || git show-ref --verify --quiet refs/remotes/origin/main && echo origin/main \
       || echo origin/master)"
DIFF="$(git diff "$BASE"...HEAD)"
FILES_CHANGED="$(git diff --name-only "$BASE"...HEAD)"
```

If the dispatcher specified a different scope, use that. If the diff is empty, return: "No changes to review." and stop.

### Step 3 — Run Gemini with output capture

```bash
cd "$ROOT" && gemini \
  -p "<prompt — same shape as the gemini-review skill's Step 3>" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text > /tmp/gemini-review-output.md
```

### Step 4 — Read the output

```bash
cat /tmp/gemini-review-output.md
```

### Step 5 — Return the structured summary

Return only this format:

---
## Gemini Review Summary

**Scope:** <e.g. "branch vs origin/main, 7 files">

**Must fix (N):**
- `file:line` — <issue> — <fix>

**Should consider (N):**
- `file:line` — <issue>

**Nits (N):**
- `file:line` — <note>

Full review at `/tmp/gemini-review-output.md`.
---

## Hard rules

- **Cap the report at ~400 words.** Link to the temp file rather than quoting findings in full.
- `--approval-mode plan` always.
- Report only.
```

- [ ] **Step 5: Run the test — expect pass**

Run: `/tmp/test-gemini-review.sh`
Expected: `OK`.

- [ ] **Step 6: Manual trigger test**

1. `/gemini-review` against a scratch repo with a non-empty diff — confirm Gemini is invoked.
2. With empty diff: confirm the skill says "nothing to review" without calling Gemini.
3. "spawn gemini-review agent" — confirm ≤ ~400 word output.

- [ ] **Step 7: Commit**

```bash
git add plugins/gemini-tools/skills/gemini-review/SKILL.md \
        plugins/gemini-tools/agents/gemini-review.md
git commit -m "feat(gemini-tools): add gemini-review skill and agent"
```

---

## Task 8: gemini-debug skill + agent

Mirrors Task 4 with Gemini's CLI contract.

**Files:**
- Create: `plugins/gemini-tools/skills/gemini-debug/SKILL.md`
- Create: `plugins/gemini-tools/agents/gemini-debug.md`

- [ ] **Step 1: Frontmatter-sanity test**

Create `/tmp/test-gemini-debug.sh`:

```bash
#!/usr/bin/env bash
set -e
SKILL=plugins/gemini-tools/skills/gemini-debug/SKILL.md
AGENT=plugins/gemini-tools/agents/gemini-debug.md
test -f "$SKILL" && test -f "$AGENT"
grep -q '^description: ' "$SKILL"
grep -q '^disable-model-invocation: true' "$SKILL"
grep -q 'gemini -p' "$SKILL"
grep -q '\-\-approval-mode plan' "$SKILL"
grep -q "command -v gemini" "$SKILL"
grep -q '^name: gemini-debug' "$AGENT"
grep -q '\-\-approval-mode plan' "$AGENT"
grep -q '400 words' "$AGENT"
claude plugin validate . >/dev/null
echo "OK"
```

`chmod +x /tmp/test-gemini-debug.sh`.

- [ ] **Step 2: Run — expect failure**

- [ ] **Step 3: Create `plugins/gemini-tools/skills/gemini-debug/SKILL.md`**

```markdown
---
description: Run a Google Gemini debugging session — investigate a bug, propose a hypothesis, and suggest a fix. TRIGGER only when the user types `/gemini-debug` or explicitly says "use gemini to debug", "have gemini debug this", "second-opinion debug with gemini". Do NOT auto-invoke.
disable-model-invocation: true
---

# Gemini debug

Use Gemini to investigate a bug. Read-only — Gemini never patches code from this skill.

## Trigger

- Slash command: `/gemini-debug <bug description>`.
- Explicit phrases: "use gemini to debug", "have gemini debug this", "second-opinion debug with gemini".
- "Deep" / "thorough" / "extra-high" prefix accepted but no-op in v1.

## Effort knob

No-op in v1; same rationale as the other Gemini skills.

## Steps

### Step 1 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "Gemini CLI not found. Install: https://github.com/google/gemini-cli"
  exit 1
}
```

### Step 2 — Gather inputs

Ask the user (if not already provided):

- The bug symptom — what's expected vs what's happening?
- Reproduction steps if known.
- Error message / stack trace if available.
- Relevant file paths.

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
RECENT="$(git log --oneline -5 2>/dev/null || true)"
```

### Step 3 — Build the prompt

```
You are a senior engineer debugging a reported issue. Read the code carefully before forming a hypothesis. Be specific about file paths and line numbers.

## Repo
- Root: $ROOT
- Branch: $BRANCH
- Recent commits: $RECENT

## Symptom
<user's bug description>

## Repro
<user's repro steps>

## Error / stack trace
<paste, if any>

## Relevant files
<user-named paths, if any>

## Output format
1. **Most likely root cause** — file, line, mechanism.
2. **Why it produces the symptom** — chain of reasoning.
3. **Suggested fix** — concrete patch idea (do not edit files).
4. **Alternative hypotheses** — ranked by likelihood, briefly.
5. **What to check next** — diagnostics if hypothesis is uncertain.
```

### Step 4 — Cost notice

```
About to call Gemini (read-only / approval-mode plan, model: gemini-2.5-pro). This consumes API credits.
```

### Step 5 — Run Gemini

```bash
cd "$ROOT" && gemini \
  -p "$PROMPT" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text
```

Stream output to chat.

### Step 6 — Hand off

Ask the user whether to (a) discuss the hypothesis, (b) hand off the suggested fix to Claude Code for implementation, or (c) try a different angle.

## Hard rules

- `--approval-mode plan` always.
- Gemini does not patch code from this skill.
- Never auto-fire.
```

- [ ] **Step 4: Create `plugins/gemini-tools/agents/gemini-debug.md`**

```markdown
---
name: gemini-debug
description: Use this agent when the user asks for a Gemini debug session in the background — phrases like "spawn gemini-debug agent", "have gemini debug in the background", "background gemini debug". Returns a ~400-word hypothesis with suggested fix.
tools: Bash, Read
---

Your single job: run a Gemini debug investigation in this fresh context and return a concise hypothesis.

## Steps

### Step 1 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "Gemini CLI not found. Install: https://github.com/google/gemini-cli"
  exit 1
}
```

### Step 2 — Inputs

The dispatcher will have given you the bug symptom, repro steps, error, and relevant file paths in the prompt.

```bash
ROOT="$(pwd)"
BRANCH="$(git branch --show-current 2>/dev/null || echo no-git)"
```

### Step 3 — Run Gemini with output capture

```bash
cd "$ROOT" && gemini \
  -p "<prompt — same shape as the gemini-debug skill's Step 3>" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text > /tmp/gemini-debug-output.md
```

### Step 4 — Read the output

```bash
cat /tmp/gemini-debug-output.md
```

### Step 5 — Return the structured summary

Return only this format:

---
## Gemini Debug Summary

**Bug:** <one-line>

**Most likely root cause:** `file:line` — <mechanism>

**Why it produces the symptom:** <2-3 sentences>

**Suggested fix:** <concrete patch idea>

**Alternative hypotheses:**
- <hypothesis> — <likelihood>

**Diagnostics to run next:**
- <command or check>

Full investigation at `/tmp/gemini-debug-output.md`.
---

## Hard rules

- **Cap the report at ~400 words.** Link to the temp file.
- `--approval-mode plan` always.
- Report only. Do not patch code.
```

- [ ] **Step 5: Run the test — expect pass**

Run: `/tmp/test-gemini-debug.sh`
Expected: `OK`.

- [ ] **Step 6: Manual trigger test**

1. `/gemini-debug 500 error on /api/users` — confirm Gemini is invoked.
2. "spawn gemini-debug agent" — confirm output ≤ ~400 words.

- [ ] **Step 7: Commit**

```bash
git add plugins/gemini-tools/skills/gemini-debug/SKILL.md \
        plugins/gemini-tools/agents/gemini-debug.md
git commit -m "feat(gemini-tools): add gemini-debug skill and agent"
```

---

## Task 9: Update root README and AGENTS.md

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Read the current state**

Look at the existing plugin table in `README.md` and the structure tree in `AGENTS.md` (lines 11–46 of `AGENTS.md` per the current file).

- [ ] **Step 2: Add codex-tools and gemini-tools rows to `README.md`'s plugin table**

The existing table lists `dev-workflow` and `git-platform`. Add two new rows in the same shape, after the existing rows. Match the column order and formatting of the existing rows exactly. Each row should link to the plugin's README:

- `codex-tools` row: short description ("Plan / review / debug delegated to OpenAI Codex CLI. User-invoked, read-only."), link to `./plugins/codex-tools/README.md`.
- `gemini-tools` row: short description ("Plan / review / debug delegated to Google Gemini CLI. User-invoked, read-only."), link to `./plugins/gemini-tools/README.md`.

If the table has a "version" or "what" column, fill it in to match.

- [ ] **Step 3: Extend `AGENTS.md` structure tree**

In the `## Structure` section's tree diagram (currently shows only `dev-workflow/` and `git-platform/`), add:

```
    ├── codex-tools/
    │   ├── .claude-plugin/
    │   │   └── plugin.json
    │   ├── README.md
    │   ├── skills/
    │   │   ├── codex-plan/SKILL.md
    │   │   ├── codex-review/SKILL.md
    │   │   └── codex-debug/SKILL.md
    │   └── agents/
    │       ├── codex-plan.md
    │       ├── codex-review.md
    │       └── codex-debug.md
    └── gemini-tools/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── README.md
        ├── skills/
        │   ├── gemini-plan/SKILL.md
        │   ├── gemini-review/SKILL.md
        │   └── gemini-debug/SKILL.md
        └── agents/
            ├── gemini-plan.md
            ├── gemini-review.md
            └── gemini-debug.md
```

Replace the trailing `└──` of the existing `git-platform/` entry with `├──` so the tree characters stay correct.

- [ ] **Step 4: Validate**

```bash
claude plugin validate .
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: list codex-tools and gemini-tools in root README and AGENTS.md tree"
```

---

## Task 10: Final validation gate

No new files. Run the full validation loop from `MAINTAINING.md` and confirm everything still passes after the additions.

- [ ] **Step 1: JSON syntax**

```bash
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null
python3 -m json.tool plugins/codex-tools/.claude-plugin/plugin.json >/dev/null
python3 -m json.tool plugins/gemini-tools/.claude-plugin/plugin.json >/dev/null
```

All three must exit 0.

- [ ] **Step 2: Manifest validation**

```bash
claude plugin validate .
```

Expected: passes.

- [ ] **Step 3: Public-safety scan**

```bash
grep -rnEi 'YOUR-EMPLOYER|your-internal-host|real-ticket-pattern' \
  --exclude-dir=.git --exclude-dir=docs --exclude-dir=node_modules .
```

Expected: no matches. (The patterns above are placeholders from `MAINTAINING.md`; substitute the actual ones the repo guards against if they differ.)

- [ ] **Step 4: Re-run all per-task tests**

```bash
for t in /tmp/test-codex-scaffold.sh \
         /tmp/test-codex-plan.sh \
         /tmp/test-codex-review.sh \
         /tmp/test-codex-debug.sh \
         /tmp/test-gemini-scaffold.sh \
         /tmp/test-gemini-plan.sh \
         /tmp/test-gemini-review.sh \
         /tmp/test-gemini-debug.sh; do
  echo "=== $t ==="
  "$t" || { echo "FAILED: $t"; exit 1; }
done
echo "All test scripts passed."
```

- [ ] **Step 5: End-to-end install test**

In a scratch git repo:

```
/plugin marketplace add /Users/dilee/Documents/Development/claude-extensions
/plugin install codex-tools@dilee
/plugin install gemini-tools@dilee
```

Both must install cleanly.

- [ ] **Step 6: Trigger smoke test (manual)**

In the scratch repo, with both plugins installed, run one trigger from each plugin to confirm end-to-end behavior:

- `/codex-plan add a healthcheck endpoint` — Codex is invoked with `-s read-only`.
- `/gemini-plan add a healthcheck endpoint` — Gemini is invoked with `--approval-mode plan`.

If either fails, the issue is in the SKILL.md body, not the plan — go back to the relevant task and fix.

- [ ] **Step 7: Negative test (preflight)**

Temporarily remove the CLI from PATH in a scratch shell:

```bash
PATH="/usr/bin:/bin" /codex-plan ...   # codex won't be on this PATH
```

Expected: the preflight check fires, prints the install URL, and exits without calling Codex.

(In practice, you can simulate this by renaming the binary briefly, or by running the preflight bash block directly with a stripped PATH.)

- [ ] **Step 8: Confirm no commits left uncommitted**

```bash
git status
```

Expected: clean working tree.

- [ ] **Step 9: Push (only with explicit user approval)**

Per `AGENTS.md`: do not `git push` without explicit user permission. Ask the user before pushing.

---

## Self-review notes (filled in by the planner before handing off)

**Spec coverage check:**

| Spec section | Implementing task(s) |
|---|---|
| Architecture (two parallel plugins) | Tasks 1, 5 (scaffolds) |
| File layout per plugin | Tasks 1–8 |
| Three ops (plan/review/debug) | Tasks 2–4 (codex), 6–8 (gemini) |
| Both surfaces (skill + agent) | Tasks 2–4, 6–8 (each task delivers both) |
| User-invoked only (`disable-model-invocation: true`) | Frontmatter in every SKILL.md (Tasks 2–4, 6–8) |
| Trigger spec descriptions | Frontmatter in every SKILL.md and agent (Tasks 2–4, 6–8) |
| Read-only sandbox (codex `-s read-only`, gemini `--approval-mode plan`) | Frontmatter + body checks in tests (Tasks 2–4, 6–8) |
| 400-word agent cap | Frontmatter-sanity test grep + body content (Tasks 2–4, 6–8) |
| Effort knob — Codex `high`/`xhigh`, Gemini no-op asymmetry | Codex tasks (2–4) include both effort levels; Gemini tasks (6–8) document no-op |
| Cost-transparency one-liner | Body content in every SKILL.md (Tasks 2–4, 6–8) |
| Preflight check (`command -v codex/gemini`) | Body content + frontmatter-sanity test grep |
| Marketplace.json entries | Tasks 1, 5 |
| Root README plugin table rows | Task 9 |
| AGENTS.md tree update | Task 9 |
| Validation gate | Task 10 |
| Attribution to deepanscode | Plugin READMEs (Tasks 1, 5) |
| No `version` in `plugin.json` | Manifest content (Tasks 1, 5) |

No spec requirement is unimplemented.

**Type / name consistency check:**

- All Codex skills use the exact same flag set: `-s read-only`, `-c model_reasoning_effort=...`, `-C "$ROOT"`, no `-m`. Consistent across Tasks 2/3/4.
- All Gemini skills use the exact same flag set: `-p`, `-m gemini-2.5-pro`, `--approval-mode plan`, `-o text`. Consistent across Tasks 6/7/8.
- All agents capture output to `/tmp/<provider>-<op>-output.md` and use the same path in their "read the output" + "link to the temp file" steps.
- Slash command names (`/codex-plan` etc.) match agent names (`codex-plan` etc.) consistently throughout.

**Placeholder check:**

The plan uses `<high|xhigh>` and `<built prompt>` as illustrative substitution markers in the Codex/Gemini invocation snippets — these are not "TBD" placeholders; they're parameters the skill body resolves at runtime based on the trigger phrase. Each skill clearly documents how those resolve. No genuine TBDs.

The user-instruction placeholders inside prompt templates (`<user's description>`, `<user's constraints>`, `<the diff, in a fenced block>`) are template slots filled by the skill body at runtime — explicitly marked as such.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-codex-gemini-tools.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for this plan because tasks are independent (one plugin component each) and easy to verify in isolation.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch with checkpoints for review.

**Pre-execution suggestion:** because this work spans two plugins and 10 tasks, consider running it in a dedicated git worktree (use `superpowers:using-git-worktrees`) so progress is isolated from `main`.

Which approach?
