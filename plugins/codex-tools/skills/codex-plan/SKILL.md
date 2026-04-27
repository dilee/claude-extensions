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
