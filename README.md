# Claude Code Extensions

A personal plugin marketplace for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Drop-in extensions for the dev-workflow every project ends up reinventing.

> Inspired by [deepanscode/claude-code-extensions](https://github.com/deepanscode/claude-code-extensions). Go take a look; it's worth the read.

## Quick install

Copy-paste this to go from zero to working. Inside Claude Code:

```
/plugin marketplace add dilee/claude-extensions
/plugin install dev-workflow@dilee
/plugin install git-platform@dilee
```

Then in a terminal, finish `git-platform` setup (skip if you didn't install it):

```bash
# Find the plugin's install directory and run its setup script
find ~/.claude -type d -name git-platform -path '*/plugins/*' \
  -exec sh -c 'cd "$1" && ./bin/setup.sh' _ {} \;

# Authenticate for the platforms you use (any subset)
gh auth login                                            # GitHub
glab auth login                                          # GitLab
export BITBUCKET_USERNAME="you@example.com"              # Bitbucket
export BITBUCKET_TOKEN="your-api-token"
```

Restart Claude Code. Then verify inside any git repo:

> "Detect the git platform for this repo."

If Claude reports your platform + owner + repo, you're done. Full walkthrough in [`plugins/git-platform/README.md`](./plugins/git-platform/README.md).

## Contents

- [Quick install](#quick-install)
- [Plugins](#plugins)
- [Getting started](#getting-started)
- [For maintainers](#for-maintainers)
- [Quick reference per plugin](#quick-reference-per-plugin)
- [Project-parameters contract](#project-parameters-contract)
- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [Contributing](#contributing)
- [License](#license)

## Plugins

| Plugin | Version | What it is | Setup effort |
|---|---|---|---|
| [`codex-tools`](./plugins/codex-tools/README.md) | 0.1.0 | Skills + agents — delegate read-only plan / review / debug to OpenAI Codex CLI | Install `codex` CLI + `codex login` |
| [`dev-workflow`](./plugins/dev-workflow/README.md) | 0.1.0 | Skills + agent — branch naming, ticket-driven branch creation, pre-PR docs-sync | None beyond `/plugin install` |
| [`gemini-tools`](./plugins/gemini-tools/README.md) | 0.1.0 | Skills + agents — delegate read-only plan / review / debug to Google Gemini CLI | Install `gemini` CLI + auth |
| [`git-platform`](./plugins/git-platform/README.md) | 0.2.0 | MCP server — unified PR operations across GitHub / GitLab / Bitbucket | `npm install` + auth per platform |

## Getting started

### 1. Add the marketplace (one time)

Inside Claude Code:

```
/plugin marketplace add dilee/claude-extensions
```

### 2. Install the plugins you want

```
/plugin install dev-workflow@dilee
/plugin install git-platform@dilee
```

Both are independent — install one or both.

### 3. Do per-plugin setup

Each plugin's README walks you through setup and usage. At minimum:

- **`dev-workflow`** — no additional setup. Optional: drop a [project-parameters block](#project-parameters-contract) into your project's `CLAUDE.md`.
- **`git-platform`** — needs a one-time `npm install` and platform authentication. See [`plugins/git-platform/README.md`](./plugins/git-platform/README.md#installation) for the exact commands.

### 4. Keep the marketplace up to date

```
/plugin marketplace update
```

## Quick reference per plugin

### `codex-tools`

User-invoked only. Each op has a slash-command surface (output streams to chat) and a background agent surface (~400-word summary).

| Slash command | Agent | What it does |
|---|---|---|
| `/codex-plan <feature>` | `codex-plan` | Codex produces an implementation plan / spec / architecture. |
| `/codex-review` | `codex-review` | Codex reviews the current branch's diff (or scope you specify). |
| `/codex-debug <symptom>` | `codex-debug` | Codex investigates a bug and proposes a hypothesis + fix. |

All calls use `-s read-only`. Add "deep" / "thorough" prefix for `xhigh` reasoning effort.

Full docs: [`plugins/codex-tools/README.md`](./plugins/codex-tools/README.md).

### `dev-workflow`

**Skills**

| Skill | Type | Fires when |
|---|---|---|
| `branch-naming` | auto-invoked | You're about to create or push a new branch — enforces `feature/`, `bugfix/`, `hotfix/`, `release/` prefixes. |
| `ticket-start` | user-invoked | You type `/ticket-start <KEY>` or ask Claude to start a ticket — fetches the ticket, proposes the correct branch, creates it on confirmation. |

**Agents**

| Agent | What it does |
|---|---|
| `docs-sync` | Scans the current branch vs base and lists doc gaps before you open the PR. Reports only; doesn't edit. |

Full docs: [`plugins/dev-workflow/README.md`](./plugins/dev-workflow/README.md).

### `gemini-tools`

User-invoked only. Mirrors `codex-tools`, backed by Google's Gemini CLI.

| Slash command | Agent | What it does |
|---|---|---|
| `/gemini-plan <feature>` | `gemini-plan` | Gemini produces an implementation plan. |
| `/gemini-review` | `gemini-review` | Gemini reviews the current branch's diff. |
| `/gemini-debug <symptom>` | `gemini-debug` | Gemini investigates a bug and proposes a hypothesis + fix. |

All calls use `--approval-mode plan` (Gemini's read-only mode). The "deep" / "thorough" prefix is accepted but is currently a no-op (Gemini CLI doesn't expose an effort knob); see the plugin README for details.

Full docs: [`plugins/gemini-tools/README.md`](./plugins/gemini-tools/README.md).

### `git-platform`

Nine MCP tools, unified across GitHub / GitLab / Bitbucket, platform auto-detected from the git remote:

| Tool | What it does |
|---|---|
| `git_platform_detect` | Detect platform + owner/repo. |
| `repo_info` | Default branch, visibility, description, URL. |
| `pr_create` / `pr_list` / `pr_view` | Create / list / view PRs. |
| `pr_merge` / `pr_approve` / `pr_comment` / `pr_decline` | Act on PRs. |

Example prompts Claude maps to these tools:

- "Open a draft PR from `feature/PROJ-123` into `main`."
- "List my open PRs."
- "Show me PR 42 with the diff and CI status."
- "Squash-merge PR 42 and delete the branch."

Full docs (install, auth, self-hosted, troubleshooting): [`plugins/git-platform/README.md`](./plugins/git-platform/README.md).

## Project-parameters contract

`dev-workflow` adapts to each project by reading its `CLAUDE.md` (or `AGENTS.md`). Drop this block into yours:

````markdown
## Project conventions (read by Claude Code extensions)

- Ticket key format: `[A-Z]+-\d+`   # adjust to your tracker, e.g. `PROJ-\d+`
- Integration branch: `main`         # or `develop` if you use Git Flow
- Tracker: Jira                      # Jira | Linear | GitHub | GitLab
- Docs folder: `docs/`
- ADR folder: `docs/adr/`
````

All fields are optional — defaults apply — but setting them prevents Claude from guessing when conventions are ambiguous.

## How it works

Four extension types ship in this marketplace:

- **Auto-invoked skills.** Claude reads each skill's `description` frontmatter and activates the skill when the situation matches. Used for conventions Claude should apply as it works (e.g. `branch-naming` fires before any `git checkout -b`).
- **User-invoked skills** (`disable-model-invocation: true`). Run only when explicitly requested. Used for on-demand workflows (e.g. `/ticket-start PROJ-123`).
- **Agents.** Run in a fresh context and return a concise report. Used for focused analysis that would otherwise bloat the main conversation (e.g. `docs-sync`).
- **MCP servers.** Expose typed tools Claude can call directly. Used when the work needs real code — network calls, state, credentials — rather than prose instructions (e.g. `git-platform`'s unified PR operations).

## Repository layout

```
claude-extensions/
├── .claude-plugin/
│   └── marketplace.json
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── plugins/
    ├── codex-tools/
    │   ├── .claude-plugin/plugin.json
    │   ├── README.md
    │   ├── skills/
    │   │   ├── codex-plan/SKILL.md
    │   │   ├── codex-review/SKILL.md
    │   │   └── codex-debug/SKILL.md
    │   └── agents/
    │       ├── codex-plan.md
    │       ├── codex-review.md
    │       └── codex-debug.md
    ├── dev-workflow/
    │   ├── .claude-plugin/plugin.json
    │   ├── README.md
    │   ├── skills/
    │   │   ├── branch-naming/SKILL.md
    │   │   └── ticket-start/SKILL.md
    │   └── agents/docs-sync.md
    ├── gemini-tools/
    │   ├── .claude-plugin/plugin.json
    │   ├── README.md
    │   ├── skills/
    │   │   ├── gemini-plan/SKILL.md
    │   │   ├── gemini-review/SKILL.md
    │   │   └── gemini-debug/SKILL.md
    │   └── agents/
    │       ├── gemini-plan.md
    │       ├── gemini-review.md
    │       └── gemini-debug.md
    └── git-platform/
        ├── .claude-plugin/plugin.json
        ├── .mcp.json
        ├── README.md
        ├── bin/setup.sh           # one-time dependency installer
        ├── package.json
        ├── tsconfig.json
        └── src/                   # TypeScript MCP server
            ├── index.ts
            ├── platform.ts
            ├── types.ts
            ├── adapters/{base,github,gitlab,bitbucket}.ts
            └── utils/{auth,exec}.ts
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: keep changes small, public-safe, and testable; skill descriptions are trigger specs, not feature blurbs; agents need hard output caps; MCP tools need zod schemas.

## For maintainers

See [MAINTAINING.md](./MAINTAINING.md) for a full tour of how the marketplace works, the mental model behind each extension type, and recipes for adding or changing things without breaking the contract.

## License

MIT. See [LICENSE](./LICENSE).
