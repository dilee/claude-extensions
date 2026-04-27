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
TREE="$(ls -1 2>/dev/null || echo '(unable to list)')"
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
cd "$ROOT" && gemini -p "$PROMPT" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text </dev/null
```

`</dev/null` closes stdin so gemini doesn't append/wait on piped input when invoked from a non-TTY shell (e.g. Claude Code's Bash tool — `gemini -p` documents that stdin is appended to the prompt when present).

Stream output to chat. Do not summarise.

### Step 6 — Hand off

Ask the user whether to (a) refine the plan, (b) hand it off to Claude Code for implementation, or (c) discard.

## Hard rules

- `--approval-mode plan` (read-only) always. Never `yolo` or `auto_edit`.
- Never auto-fire — require slash command or explicit phrase.
- Never pipe Gemini output through Claude — show it raw.
