---
description: Run a CodeRabbit AI code review on a diff and stream the findings to chat. TRIGGER only when the user types `/coderabbit-review` or explicitly says "use coderabbit to review", "have coderabbit review this", "second-opinion review with coderabbit". Do NOT auto-invoke. Read-only — never edits files (use `/coderabbit-fix` for that).
disable-model-invocation: true
---

# CodeRabbit review

Use CodeRabbit to review code, read-only. Default scope is the current branch's full delta (committed + uncommitted) vs the base branch; override with an argument (a base branch name or a `--type` value).

## Trigger

- Slash command: `/coderabbit-review` (optional argument: a base branch, or `committed` / `uncommitted` / `all`).
- Explicit phrases: "use coderabbit to review", "have coderabbit review this", "second-opinion review with coderabbit".

## No effort knob

The CodeRabbit CLI exposes no reasoning-effort or model-selection flag. "Deep" / "thorough" prefixes are accepted but no-op — there is nothing to turn up.

## Steps

### Step 1 — Preflight

```bash
command -v coderabbit >/dev/null || {
  echo "CodeRabbit CLI not found. Install: curl -fsSL https://cli.coderabbit.ai/install.sh | sh"
  echo "Docs: https://docs.coderabbit.ai/cli"
  echo "After install: run 'coderabbit auth login' to authenticate."
  exit 1
}
coderabbit auth status >/dev/null 2>&1 || {
  echo "CodeRabbit CLI is not authenticated. Run 'coderabbit auth login' first."
  exit 1
}
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Not inside a git repository. CodeRabbit needs an initialized git repo."
  exit 1
}
```

### Step 2 — Resolve scope

```bash
ROOT="$(pwd)"
TYPE="all"
BASE=""
for b in develop main master; do
  if git show-ref --verify --quiet "refs/remotes/origin/$b"; then BASE="$b"; break; fi
done
```

If the user passed `committed` / `uncommitted` / `all`, set `TYPE` accordingly. If the user passed a branch name, set `BASE` to it. If no remote base resolves, leave `BASE` empty and let CodeRabbit auto-detect.

### Step 3 — Cost / time notice

Print one line before calling CodeRabbit:

```
About to run a CodeRabbit review (scope: $TYPE${BASE:+, base: $BASE}). Consumes your CodeRabbit plan quota and may take a few minutes. Read-only.
```

### Step 4 — Run CodeRabbit

```bash
cd "$ROOT" && \
if [ -n "$BASE" ]; then
  coderabbit review --plain --type "$TYPE" --base "$BASE" </dev/null
else
  coderabbit review --plain --type "$TYPE" </dev/null
fi
```

`</dev/null` closes stdin so `coderabbit` does not wait on piped input in this non-TTY shell (Claude Code's Bash tool).

Stream the output to chat as-is.

### Step 5 — Hand off

Ask the user whether to (a) discuss specific findings, (b) act on them — `/coderabbit-fix` or have Claude apply fixes, or (c) discard.

## Hard rules

- **Read-only.** Never `--interactive` (its TUI can't run in the Bash tool, and we don't want CodeRabbit applying edits). This skill never modifies the workspace.
- If CodeRabbit reports no findings, say so and stop.
- If CodeRabbit exits non-zero (e.g. rate limit), surface its stderr — never fabricate findings.
- Never auto-fire.
