---
description: Run a CodeRabbit review and apply its suggested fixes to the working tree, severity-gated and confirmed. TRIGGER only when the user types `/coderabbit-fix` or explicitly says "have coderabbit fix this", "coderabbit review and fix", "fix the coderabbit findings". Do NOT auto-invoke. This skill MUTATES files via Claude's own edits (never via CodeRabbit's interactive mode).
disable-model-invocation: true
---

# CodeRabbit fix

Review with CodeRabbit, then apply the high-severity fixes it suggests. Default scope is local uncommitted working-tree changes (the tight edit → review → fix loop); override with an argument (`committed` / `all`, or a base branch).

CodeRabbit's `--agent` output gives each finding a `severity` and a `codegenInstructions` string. **Claude** applies the fix from those instructions — CodeRabbit never edits your files directly.

## Trigger

- Slash command: `/coderabbit-fix` (optional argument: `committed` / `uncommitted` / `all`, or a base branch).
- Explicit phrases: "have coderabbit fix this", "coderabbit review and fix", "fix the coderabbit findings".

## No effort knob

The CodeRabbit CLI exposes no reasoning-effort or model flag. "Deep" / "thorough" prefixes are no-op.

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
TYPE="uncommitted"
BASE=""
```

If the user passed `committed` / `all`, set `TYPE`. If `TYPE` is not `uncommitted`, resolve a base branch the same way `/coderabbit-review` does (`develop` → `main` → `master`) and set `BASE`. If the scope is `uncommitted` and `git status --porcelain` is empty, stop: "No uncommitted changes to review."

### Step 3 — Cost / time notice

```
About to run a CodeRabbit review for fixing (scope: $TYPE). Consumes your CodeRabbit plan quota and may take a few minutes.
```

### Step 4 — Run CodeRabbit in agent mode

```bash
cd "$ROOT" && \
if [ -n "$BASE" ]; then
  coderabbit review --agent --type "$TYPE" --base "$BASE" </dev/null > /tmp/coderabbit-agent.jsonl
else
  coderabbit review --agent --type "$TYPE" </dev/null > /tmp/coderabbit-agent.jsonl
fi
```

`</dev/null` closes stdin in this non-TTY shell.

### Step 5 — Parse findings

```bash
cat /tmp/coderabbit-agent.jsonl
```

Each non-empty line is a JSON object with fields such as `severity`, `fileName`, `comment`, `codegenInstructions`, and `suggestions`. Parse each line; skip any line that does not parse as JSON. If there are no actionable findings, report "CodeRabbit found no issues to fix." and stop.

Present the findings grouped by severity (highest first), each as `fileName` — `comment`.

### Step 6 — Apply fixes (severity-gated, confirmed)

- Select the **high-severity / must-fix** findings (the top severity tier CodeRabbit reports, e.g. critical/high). List the nits and low-severity items but do **not** auto-fix them unless the user asks.
- For each selected finding, derive the edit from its `codegenInstructions` (use `suggestions` as the concrete patch when present).
- Show the planned edits, then apply them with `Edit` / `Write` **after a single confirmation** from the user. Apply as a batch — do not ask per-file unless an edit is ambiguous.

### Step 7 — Verify (loop cap = 2)

After applying, re-run CodeRabbit once on the same scope (Step 4) to confirm the high-severity findings are resolved. Report what remains. **Stop after 2 review passes total** — surface any residual findings rather than looping further.

### Step 8 — Summary

State what was fixed, what remains, and suggest the user commit. Do **not** commit or push.

## Hard rules

- **Loop cap = 2.** Never run more than two CodeRabbit passes in one invocation.
- **Confirm before the first apply.** Never edit files before the user approves the planned changes.
- Claude applies edits — never `coderabbit --interactive`.
- Never `git add` / `commit` / `push` automatically.
- If the review finds nothing, say so and stop.
- If CodeRabbit exits non-zero (e.g. rate limit), surface its stderr — never fabricate findings.
- Never auto-fire.
