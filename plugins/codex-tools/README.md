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
