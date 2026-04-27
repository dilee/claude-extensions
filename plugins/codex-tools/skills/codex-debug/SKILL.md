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
