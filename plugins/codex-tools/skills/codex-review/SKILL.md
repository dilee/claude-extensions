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
  "$PROMPT" </dev/null
```

`</dev/null` closes stdin so codex doesn't hang waiting for piped input when invoked from a non-TTY shell (e.g. Claude Code's Bash tool).

Stream output to chat as-is.

### Step 6 — Hand off

Ask the user whether to (a) discuss specific findings, (b) act on them with Claude Code, or (c) discard.

## Hard rules

- Read-only always.
- If the diff is empty, refuse — do not call Codex with no content to review.
- Never auto-fire.
