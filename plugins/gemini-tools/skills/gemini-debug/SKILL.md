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
cd "$ROOT" && gemini -p "$PROMPT" \
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
