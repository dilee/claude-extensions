# coderabbit-tools

Delegate AI code review to the [CodeRabbit CLI](https://docs.coderabbit.ai/cli) from Claude Code. User-invoked only — these never auto-fire.

CodeRabbit is **review-only** (it doesn't plan or debug), so this plugin is intentionally narrow: a read-only review path, plus a review→fix path where Claude applies CodeRabbit's suggested fixes.

## What you get

### Skills (slash commands)

| Slash command | What it does | Touches files? |
|---|---|---|
| `/coderabbit-review` | CodeRabbit reviews the current branch delta (or a scope you specify); findings stream to chat. | No — read-only |
| `/coderabbit-fix` | CodeRabbit reviews your uncommitted changes; Claude applies the high-severity fixes after you confirm, then re-checks once. | Yes — Claude's own edits |

### Agent (fresh context, ~400-word summary)

| Agent | What it does |
|---|---|
| `coderabbit-review` | Background code review; severity-grouped issue list linking to the full output. |

## Default scopes

| Surface | Default scope | Override |
|---|---|---|
| `/coderabbit-review` | `--type all` vs auto-detected base (`develop` → `main` → `master`) | pass a base branch or `committed` / `uncommitted` / `all` |
| `/coderabbit-fix` | `--type uncommitted` (local working tree) | pass `committed` / `all` or a base branch |
| `coderabbit-review` agent | same as `/coderabbit-review` | dispatcher can specify |

## Prerequisites

- **CodeRabbit CLI** on PATH (binary: `coderabbit`, alias `cr`). Install:

  ```bash
  curl -fsSL https://cli.coderabbit.ai/install.sh | sh
  ```

- **Authenticated**: `coderabbit auth login` (browser), or set `CODERABBIT_API_KEY`. Check with `coderabbit auth status`; diagnose setup with `coderabbit doctor`.

## Installation

```
/plugin marketplace add dilee/claude-extensions
/plugin install coderabbit-tools@dilee
```

## Examples

```
/coderabbit-review
use coderabbit to review this against develop
/coderabbit-fix
spawn coderabbit-review agent
```

## How `/coderabbit-fix` decides what to change

It runs `coderabbit review --agent`, which emits structured JSON findings (one per line) with a `severity` and a `codegenInstructions` string per finding. Claude:

1. Groups findings by severity and shows them.
2. Proposes fixes for the **high-severity / must-fix** tier only (nits are listed, not auto-fixed).
3. Applies the edits **after one confirmation** — via Claude's own `Edit`/`Write`, never CodeRabbit's interactive auto-apply.
4. Re-runs CodeRabbit once to verify, then stops (loop cap = 2).

It never commits or pushes — you stay in control of that.

## No effort knob — honest note

The CodeRabbit CLI exposes no reasoning-effort or model-selection flag, so there's nothing to turn up. "Deep" / "thorough" prefixes are accepted but no-op.

## Read-only vs mutating

- `/coderabbit-review` and the `coderabbit-review` agent are **strictly read-only** — they never modify your workspace and never use CodeRabbit's `--interactive` TUI.
- `/coderabbit-fix` **does** modify the working tree, but only through Claude's own confirmed edits, and never commits.

## Cost transparency

Each invocation prints a one-line notice before calling CodeRabbit, stating the scope and that the call consumes your CodeRabbit plan quota and may take a few minutes.

## Attribution

Backed by the [CodeRabbit CLI](https://docs.coderabbit.ai/cli).
