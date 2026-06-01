# coderabbit-tools — design

**Date:** 2026-06-01
**Status:** Draft, awaiting user review
**Related:** mirrors the surface conventions of [`codex-tools` / `gemini-tools`](./2026-04-27-codex-gemini-tools-design.md)

## Goal

Add a new plugin to this marketplace that lets the user delegate AI code review to the **CodeRabbit CLI** (`coderabbit` / `cr`). Claude Code stays as orchestrator: CodeRabbit does the review and returns its findings to chat or as a background-agent summary, and — in one dedicated skill — Claude acts on those findings to fix the code.

CodeRabbit is **review-only**. Unlike Codex/Gemini (which plan, review, *and* debug), the CodeRabbit CLI does exactly one thing: review a diff. So this plugin is intentionally narrow — it ships a review capability, not a plan/review/debug triad.

## Non-goals

- **No plan or debug ops.** The CodeRabbit CLI has no such commands. Forcing a triad to match the sibling plugins would mean inventing capabilities the tool doesn't have.
- **No use of CodeRabbit's interactive auto-apply.** The CLI's `--interactive` TUI can apply fixes itself, but (a) a TUI can't run inside Claude Code's non-TTY Bash tool, and (b) we want Claude — not CodeRabbit — to own edits so they're reviewable. The fix path mutates the tree only via Claude's own `Edit`/`Write`, severity-gated and confirmed.
- **No auto-invocation.** CodeRabbit reviews consume the user's plan quota and take minutes. All skills are user-invoked-only via slash command or explicit trigger phrase (`disable-model-invocation: true`).
- **No effort/model knob.** The CodeRabbit CLI exposes no reasoning-effort or model-selection flag. The README documents this honestly (contrast: `codex-tools` has a real knob, `gemini-tools` no-ops it).
- **No auto-commit/push.** `/coderabbit-fix` suggests a commit at the end but never runs `git add`/`commit`/`push` itself.

## Architecture

One new sibling plugin under `plugins/`, parallel to the existing review-oriented plugins:

```
plugins/
├── codex-tools/         (existing)
├── dev-workflow/        (existing)
├── gemini-tools/        (existing)
├── git-platform/        (existing)
└── coderabbit-tools/    NEW — wraps `coderabbit review`
```

Independently versioned in `marketplace.json`, self-contained.

### File layout

```
plugins/coderabbit-tools/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── skills/
│   ├── coderabbit-review/SKILL.md
│   └── coderabbit-fix/SKILL.md
└── agents/
    └── coderabbit-review.md
```

Repo conventions enforced (per `MAINTAINING.md` / `AGENTS.md`):

- **No `version` in `plugin.json`** — version lives in root `marketplace.json` only.
- **Skills are folders containing `SKILL.md` (uppercase); agents are flat files.**
- **No `.mcp.json`** — this plugin shells out via Bash; it does not run an MCP server.

## CodeRabbit CLI contract (verified against docs.coderabbit.ai)

Commands: `coderabbit` / `cr` (default = review), `cr auth {login,logout,status,org}`, `cr review`, `cr doctor`, `cr update`.

Review flags that matter here:

| Flag | Effect | Used by |
|---|---|---|
| `--plain` | Detailed human-readable findings with fix suggestions | review skill, agent |
| `--agent` | Structured JSON, **one object per line**; fields include `type`, `severity`, `fileName`, `codegenInstructions`, `suggestions`, `comment` | fix skill |
| `--type <all\|committed\|uncommitted>` | Review scope (default `all`) | all |
| `--base <branch>` | Base branch for comparison | review skill, agent |
| `--config <files...>` | Extra reviewer instructions | optional passthrough |
| `--interactive` | TUI | **never used** (non-TTY) |

`--prompt-only` appears in some third-party blog posts but is **not** in the official command reference; the design relies only on `--plain` and `--agent`.

Auth: `coderabbit auth login` (browser) or `--api-key` / `CODERABBIT_API_KEY`. Preflight only checks `coderabbit auth status`; the plugin never stores keys.

## Surfaces

**2 skills + 1 agent = 3 component files.**

### Skill 1 — `/coderabbit-review` (read-only)

- **Frontmatter:** trigger-spec `description` + `disable-model-invocation: true`.

  ```yaml
  ---
  description: Run a CodeRabbit AI code review on the current branch diff. TRIGGER
    only when the user types `/coderabbit-review` or explicitly says "use coderabbit
    to review", "have coderabbit review this", "second-opinion review with
    coderabbit". Do NOT auto-invoke.
  disable-model-invocation: true
  ---
  ```

- **Default scope:** `--type all` with base auto-detect (`origin/develop` → `origin/main` → `origin/master`) passed as `--base`. If no remote base resolves, omit `--base` and let CodeRabbit auto-detect. Overridable by argument (a base branch, a `--type` value).
- **Body steps:**
  1. **Preflight** — `command -v coderabbit` (missing → install line + docs URL, exit); `coderabbit auth status` (unauth → `coderabbit auth login` hint, exit); confirm inside a git repo.
  2. **Resolve scope** (above).
  3. **Cost/time notice** — one line: consumes CodeRabbit plan quota, may take a few minutes, read-only.
  4. **Run** — `coderabbit review --plain --type all --base "$BASE" </dev/null`; stream output to chat as-is.
  5. **Hand off** — offer to (a) discuss findings, (b) jump to `/coderabbit-fix`, (c) discard.
- **Hard rules:** never `--interactive`; never edits files; refuse on empty scope; never auto-fire.

### Skill 2 — `/coderabbit-fix` (review → apply loop)

- **Frontmatter:** trigger-spec `description` + `disable-model-invocation: true` (triggers: `/coderabbit-fix`, "have coderabbit fix this", "coderabbit review and fix").
- **Default scope:** `--type uncommitted` (local working-tree loop); overridable by argument. Empty scope → stop ("no uncommitted changes to review").
- **Body steps:**
  1. **Preflight** (same as review).
  2. **Resolve scope** (above).
  3. **Cost/time notice.**
  4. **Run** — `coderabbit review --agent --type uncommitted </dev/null > /tmp/coderabbit-agent-<ts>.jsonl`; parse the JSON-lines (`severity`, `fileName`, `codegenInstructions`, `suggestions`, `comment`). Handle empty output (no findings → report and stop) and malformed lines defensively.
  5. **Present** findings grouped by severity.
  6. **Severity-gated apply** — propose fixes for high-severity / "must-fix" findings first using `codegenInstructions`; show the planned edits; apply **after one confirmation**. Nits are listed but not auto-fixed unless the user asks.
  7. **Verify loop** — re-run CodeRabbit once on the same scope; report what remains; **stop after 2 passes total** (surface residual findings rather than looping further).
  8. **Summary** — what was fixed vs. what remains; suggest a commit.
- **Hard rules:** loop cap = 2; confirm before the first apply; never `--interactive`; never commit/push automatically; if the review finds nothing, say so and stop.

### Agent — `coderabbit-review` (background)

- **Frontmatter:**

  ```yaml
  ---
  name: coderabbit-review
  description: Use this agent when the user asks for a CodeRabbit code review in the
    background — phrases like "spawn coderabbit-review agent", "have coderabbit
    review in the background", "background coderabbit review". Returns a ~400-word
    issue list grouped by severity.
  tools: Bash, Read
  ---
  ```

- **Body:** preflight → resolve scope (default branch delta vs auto-base; accept a dispatcher-supplied scope) → `coderabbit review --plain … </dev/null > /tmp/coderabbit-review-output.md` → read it → return a **≤400-word severity-grouped summary** linking to the temp file.
- **Hard rules:** cap ~400 words; link to the temp file rather than quoting in full; report-only; read-only.

The skill `/coderabbit-review` and the `coderabbit-review` agent share a name across different namespaces, disambiguated by description — consistent with the existing `*-review` skill/agent pairs.

## Prerequisites and fail-soft behavior

| Required | Auth |
|---|---|
| `coderabbit` CLI on PATH | `coderabbit auth login` completed (or `CODERABBIT_API_KEY` set) |

Every skill/agent body opens with a preflight check:

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
```

`</dev/null` closes stdin so `coderabbit` does not wait on piped input in the non-TTY Bash tool (same guard the gemini/codex skills use).

### Cost transparency

Before running, each surface prints one line, e.g.:

```
About to run a CodeRabbit review (scope: uncommitted). Consumes your CodeRabbit plan quota and may take a few minutes. Read-only.
```

No interactive prompt — that would break flow — but the user always sees the call before it goes out.

### Error handling

- CLI missing → install instructions, exit.
- Not authenticated → `coderabbit auth login` hint, exit.
- Not a git repo / empty scope → graceful refusal.
- CodeRabbit non-zero exit / rate-limit → surface stderr; never fabricate findings.
- `--agent` output empty or with malformed lines → handle defensively (no findings → report; skip unparseable lines).

## Repo-wide changes

1. **`.claude-plugin/marketplace.json`** — add one entry:

   ```json
   {
     "name": "coderabbit-tools",
     "source": "./plugins/coderabbit-tools",
     "description": "AI code review backed by the CodeRabbit CLI — /coderabbit-review (read-only report) and /coderabbit-fix (review → apply suggested fixes), plus a background review agent. User-invoked only.",
     "version": "0.1.0",
     "keywords": ["coderabbit", "code-review", "ai-review", "fix-loop", "second-opinion"],
     "license": "MIT"
   }
   ```

2. **Root `README.md`** — add a row to the plugin table.
3. **`AGENTS.md`** — extend the structure tree to include `coderabbit-tools/`.
4. **Plugin `README.md`** — what it does, prereqs (`cr` alias note), install command, examples, the no-effort-knob honesty note, read-only/mutating distinction.
5. **Versioning** — start at `0.1.0` in `marketplace.json`; no `version` in `plugin.json`.

## Validation plan

Mirrors the loop in `MAINTAINING.md`; all must pass before any push:

1. **JSON structure** — `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null`
2. **Manifest validation** — `claude plugin validate .`
3. **Public-safety scan** — no employer/internal/credential strings, no real ticket keys.
4. **Trigger tests** in a scratch repo after `/plugin marketplace add ./` + `/plugin install coderabbit-tools@dilee`:
   - `/coderabbit-review` in a dirty repo fires, invokes `coderabbit review --plain …`, streams output.
   - `/coderabbit-fix` parses `--agent` JSON, presents severity groups, applies only after confirmation, caps at 2 passes.
   - `coderabbit-review` agent returns a ≤400-word summary.
   - **Negative tests:** remove `coderabbit` from PATH → clean preflight error; logged-out state → clean auth error.

No TypeScript step — this plugin ships no compiled code.

## Open questions deferred to implementation

- Exact `coderabbit auth status` exit-code behavior when logged out (verify the preflight branch triggers correctly).
- Whether `--base` should always be passed or left to CodeRabbit's auto-detection when no remote base resolves (default: pass when resolvable, omit otherwise).
- Final wording of the per-skill cost/time notice.

## Attribution

The plugin README credits the CodeRabbit CLI (<https://docs.coderabbit.ai/cli>) and follows the surface conventions established by this repo's `codex-tools` / `gemini-tools`.
