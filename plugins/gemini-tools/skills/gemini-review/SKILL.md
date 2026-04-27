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
  echo "Then authenticate per the Gemini CLI docs."
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
cd "$ROOT" && gemini -p "$PROMPT" \
  -m gemini-2.5-pro \
  --approval-mode plan \
  -o text </dev/null
```

`</dev/null` closes stdin so gemini doesn't append/wait on piped input when invoked from a non-TTY shell (e.g. Claude Code's Bash tool — `gemini -p` documents that stdin is appended to the prompt when present).

Stream output to chat as-is.

### Step 6 — Hand off

Ask the user whether to (a) discuss specific findings, (b) act on them with Claude Code, or (c) discard.

## Hard rules

- `--approval-mode plan` always.
- If the diff is empty, refuse — do not call Gemini with no content to review.
- Never auto-fire.
