# gemini-tools

Delegate read-only dev ops to Google's Gemini CLI from Claude Code. User-invoked only — these never auto-fire.

## What you get

### Skills (slash commands, output streams to chat)

| Slash command | What it does |
|---|---|
| `/gemini-plan` | Gemini produces a plan / spec / architecture for a feature you describe. |
| `/gemini-review` | Gemini reviews the current branch's diff (or a scope you specify). |
| `/gemini-debug` | Gemini investigates a bug you describe and proposes a hypothesis. |

### Agents (fresh context, ~400-word summary)

| Agent | What it does |
|---|---|
| `gemini-plan` | Background plan; structured summary. |
| `gemini-review` | Background code review; issue list with severity. |
| `gemini-debug` | Background debug session; hypothesis + suggested fix. |

## Prerequisites

- **Gemini CLI** on PATH. Install: <https://github.com/google/gemini-cli>
- **Authenticated**: see Gemini CLI docs for auth setup.

## Installation

```
/plugin marketplace add dilee/claude-extensions
/plugin install gemini-tools@dilee
```

## Examples

```
/gemini-plan add a webhook endpoint for Stripe events
have gemini review this diff
spawn gemini-debug agent — getting a 500 on /api/users intermittently
```

## Effort knob — honest asymmetry note

Gemini CLI does not currently expose a thinking-budget flag. For v1:

- Both default and "deep" effort use `gemini-2.5-pro`.
- "deep gemini plan" / "thorough gemini review" / etc. are **accepted but currently no-op** — they're reserved for a future version when a heavier Gemini model is available.

This is intentional asymmetry with `codex-tools`, which exposes a real `model_reasoning_effort` knob.

## Read-only by design

Every Gemini call uses `--approval-mode plan` (Gemini's read-only mode). Gemini cannot modify your workspace through this plugin.

## Cost transparency

Each invocation prints a one-line notice before calling Gemini, stating model and effort. The plugin never invokes Gemini without surfacing this line first.

## Attribution

Inspired by [deepanscode/claude-code-extensions/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools).
