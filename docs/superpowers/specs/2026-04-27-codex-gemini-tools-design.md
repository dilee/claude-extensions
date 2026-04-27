# Codex-tools and gemini-tools — design

**Date:** 2026-04-27
**Status:** Draft, awaiting user review
**Inspired by:** [deepanscode/claude-code-extensions/plugins/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools)

## Goal

Add two new plugins to this marketplace that let the user delegate read-only dev tasks (plan / review / debug) to **OpenAI Codex** and **Google Gemini** via their official CLIs. Claude Code stays as orchestrator; the external CLIs do the work and return their output to chat or as a background-agent summary.

## Non-goals

- **No `develop` or `test` ops in v1.** Both write to the workspace and overlap with what Claude Code itself does well; running two writer-agents on the same files invites merge headaches. Defer until a clear use case appears.
- **No auto-invocation in v1.** External CLIs cost API credits; auto-firing is unproven and a budget hazard. All skills are user-invoked-only via slash command or explicit trigger phrase.
- **No provider-agnostic abstraction.** A single `/plan` skill that picks Codex vs. Gemini at runtime sounds elegant but the two CLIs aren't symmetric (sandboxing, output, auth). Mirroring without abstracting is the right call now.
- **No shared code between the two plugins.** They share *conventions* (file layout, command shape, output format) but the SKILL.md and agent files are written for one CLI's contract each.

## Architecture

Two new sibling plugins under `plugins/`, parallel structure to the existing `dev-workflow` and `git-platform`:

```
plugins/
├── dev-workflow/        (existing)
├── git-platform/        (existing)
├── codex-tools/         NEW — wraps `codex exec`
└── gemini-tools/        NEW — wraps `gemini`
```

Each plugin is independently versioned in `marketplace.json` and self-contained.

### Per-plugin file layout

Identical shape inside both (showing `codex-tools`; `gemini-tools` is the same with `gemini-` prefix):

```
plugins/codex-tools/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── skills/
│   ├── codex-plan/SKILL.md
│   ├── codex-review/SKILL.md
│   └── codex-debug/SKILL.md
└── agents/
    ├── codex-plan.md
    ├── codex-review.md
    └── codex-debug.md
```

Three details enforced by repo conventions (per `MAINTAINING.md`):

- **No `version` in `plugin.json`** — version lives in root `marketplace.json` only. If both are set, `plugin.json` silently wins (a documented bug magnet).
- **Skills are folders containing `SKILL.md` (uppercase); agents are flat files** — matches the `dev-workflow` pattern.
- **No `.mcp.json`** — these plugins don't run an MCP server. They're skills + agents shelling out via Bash.

## Operations

The three ops are the same across both plugins; only the CLI under the hood changes.

| Op | Input | Output | Sandbox |
|---|---|---|---|
| `plan` | Feature description from user + auto-gathered context (project tree, branch, recent commits) | Architecture / spec / approach | read-only |
| `review` | Default: current branch diff vs main; user can override (specific files, staged diff, PR ref) | Review feedback with severity | read-only |
| `debug` | Bug description + error/repro from user + relevant files | Hypothesis, root cause, suggested fix | read-only |

All three are **strictly read-only**. The CLI is invoked with `-s read-only` (Codex) or its Gemini equivalent — these tools can never edit code, only respond about it. This is the guardrail that justifies excluding `develop`/`test`.

## Surfaces

Each op ships in two surfaces. **2 plugins × 3 ops × 2 surfaces = 12 component files** (6 per plugin).

### Skill surface

- **Slash command:** `/codex-plan`, `/codex-review`, `/codex-debug`, `/gemini-plan`, `/gemini-review`, `/gemini-debug`.
- **Behavior:** runs inline; full output streams to chat.
- **Body steps:** preflight CLI check → gather context → build prompt → run CLI → surface output.
- **Frontmatter shape** (`disable-model-invocation: true` enforces user-invoked-only):

  ```yaml
  ---
  description: Run an OpenAI Codex code review on the current diff. TRIGGER only
    when the user types `/codex-review` or explicitly says "use codex to review",
    "have codex review this", "second-opinion review with codex". Do NOT auto-invoke.
  disable-model-invocation: true
  ---
  ```

### Agent surface

- **Invocation:** explicit phrases — "spawn codex-review agent", "background gemini debug".
- **Behavior:** fresh context, ~400-word structured summary cap (per repo `AGENTS.md` rule).
- **Body steps:** same CLI call as the skill, but pipes output to a file (Codex: `--output-last-message <tmp>`; Gemini: stdout capture), then condenses into a structured summary.
- **Output sections:** Plan/Files/Decisions/Next-steps for plan; Issues/Severity/Suggestions for review; Hypothesis/Root-cause/Suggested-fix for debug.
- **Frontmatter shape:**

  ```yaml
  ---
  name: codex-review
  description: Use this agent when the user asks for a Codex code review in the
    background — phrases like "spawn codex-review agent", "have codex review in the
    background", "background codex review". Returns a ~400-word summary.
  tools: Bash, Read
  ---
  ```

Skills and agents share names (e.g., `/codex-review` and the `codex-review` agent). They live in different namespaces and the description disambiguates intent. If real-world use shows confusion, rename later — pre-renaming is premature.

## CLI invocation contracts

### Codex — known and stable

```bash
codex exec \
  -m gpt-5.3-codex \
  -s read-only \
  -c model_reasoning_effort="high" \
  -C "$(pwd)" \
  --output-last-message /tmp/codex-<op>-output.md \
  "<built prompt>"
```

### Gemini — to verify at implementation

The general shape will be:

```bash
gemini --prompt "<built prompt>" --model "<model>"
```

Three details are flagged for verification against `gemini --help` during implementation:

1. Exact non-interactive flag (`--prompt` vs `-p` vs other).
2. Whether a `read-only` sandboxing knob exists. If not, "read-only" is enforced by the prompt + the absence of any write-capable tool — acceptable for these three ops because none ask the model to edit files.
3. Default model and "deep" model names for the effort knob.

Locking these down is part of the implementation plan, not the spec.

## Reasoning effort knob

Each surface accepts an effort parameter, defaulting to standard:

| Provider | Standard | Deep |
|---|---|---|
| Codex | `-c model_reasoning_effort="high"` (default) | `-c model_reasoning_effort="xhigh"` |
| Gemini | default model (TBD) | heavier model (TBD) |

Triggered by phrases like "deep codex review" or "thorough gemini plan", consistent with the deepanscode prefix conventions ("xhigh", "extra high", "thorough", "deep").

## Prerequisites and fail-soft behavior

| Plugin | Required | Auth |
|---|---|---|
| `codex-tools` | `codex` CLI on PATH | `codex login` completed |
| `gemini-tools` | `gemini` CLI on PATH | Gemini auth (Google account or API key — exact command TBD at implementation) |

Every skill/agent body opens with a preflight check:

```bash
command -v codex >/dev/null || {
  echo "Codex CLI not found. Install: https://github.com/openai/codex"
  echo "After install: run 'codex login' to authenticate."
  exit 1
}
```

A clean error message beats a confusing `command not found` from inside a skill. Same pattern for `gemini`. No retries, no fallback — if the CLI isn't present, the skill stops.

### Cost transparency

Each skill body, before running the CLI, prints one line stating provider, model, and effort:

```
About to call Codex (model: gpt-5.3-codex, effort: high). This consumes API credits.
```

The Gemini equivalent uses the Gemini provider name and the resolved model. No interactive prompt — that would break flow — but the user always sees the call before it goes out.

## Repo-wide changes

Adding these plugins requires updates beyond `plugins/`:

1. **`.claude-plugin/marketplace.json`** — add two plugin entries (descriptions to be written at implementation, mirroring the existing entries' tone):

   ```json
   {
     "name": "codex-tools",
     "source": "./plugins/codex-tools",
     "description": "<plan/review/debug ops backed by OpenAI Codex CLI — final wording at implementation>",
     "version": "0.1.0",
     "keywords": ["codex", "openai", "code-review", "planning", "debugging"],
     "license": "MIT"
   },
   {
     "name": "gemini-tools",
     "source": "./plugins/gemini-tools",
     "description": "<plan/review/debug ops backed by Google Gemini CLI — final wording at implementation>",
     "version": "0.1.0",
     "keywords": ["gemini", "google", "code-review", "planning", "debugging"],
     "license": "MIT"
   }
   ```

2. **Root `README.md`** — add two rows to the plugin table.

3. **`AGENTS.md`** — extend the structure tree to include `codex-tools/` and `gemini-tools/`.

4. **Per-plugin `README.md`** — what it does, prereqs, install command, examples, model/effort knobs, attribution to deepanscode (consistent with the existing credit pattern).

5. **Versioning** — both plugins start at `0.1.0` in `marketplace.json`. No `version` field in `plugin.json`.

## Validation plan

Four gates, all must pass before push (mirrors the loop already in `MAINTAINING.md`):

1. **JSON structure** — `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null`
2. **Manifest validation** — `claude plugin validate .`
3. **Public-safety scan** — no employer/internal/credential strings, no real ticket keys.
4. **Trigger tests** in a scratch repo, after `/plugin marketplace add ./` + `/plugin install`:
   - For each of the 12 surfaces, type the slash command (or trigger phrase for agents) and confirm the skill/agent fires, the CLI is invoked with the expected flags, and output lands where expected.
   - One **negative test per plugin**: temporarily remove the CLI from PATH and confirm the preflight check produces a clean error message rather than a stack trace.

No TypeScript step — these plugins don't ship code, unlike `git-platform`.

## Open questions deferred to implementation

- Exact `gemini` non-interactive flag.
- Whether Gemini CLI exposes a sandbox/read-only mode equivalent to Codex's `-s read-only`. If not, read-only is enforced by prompt content + the absence of write-capable tooling.
- Default Gemini model and the heavier "deep" model used for the xhigh-equivalent effort.

## Attribution

Both plugin READMEs credit [deepanscode/claude-code-extensions/codex-tools](https://github.com/deepanscode/claude-code-extensions/tree/main/plugins/codex-tools) as the inspiration, consistent with how this repo already credits them in `b6504b4`.
