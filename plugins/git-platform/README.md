# git-platform

A Model Context Protocol (MCP) server that gives Claude Code one unified tool surface for pull-request operations across **GitHub**, **GitLab**, and **Bitbucket**. Platform is detected from your git remote per tool call — you can `cd` between repos on different hosts inside the same Claude session and everything just works.

## Contents

- [What you get](#what-you-get)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Authentication](#authentication)
- [Usage](#usage)
- [Self-hosted instances](#self-hosted-instances)
- [Troubleshooting](#troubleshooting)
- [Scope & limitations](#scope--limitations)
- [How it's built](#how-its-built)

## What you get

Nine MCP tools, same call shape regardless of platform:

| Tool | What it does |
|---|---|
| `git_platform_detect` | Detect platform + owner/repo from the current git remote. |
| `repo_info` | Default branch, visibility, description, URL. |
| `pr_create` | Create a PR / MR. |
| `pr_list` | List PRs (open / merged / closed / all). |
| `pr_view` | View a PR — optionally with the full diff and CI check statuses. |
| `pr_merge` | Merge with strategy (`merge` / `squash` / `rebase`). |
| `pr_approve` | Approve (optionally with a comment). |
| `pr_comment` | Add a comment. |
| `pr_decline` | Close / decline a PR without merging. |

GitLab's "merge request" vocabulary is normalised to "PR" in the tool surface; internally the adapter translates.

## Prerequisites

You need all of these on your PATH:

| Tool | Why | Install |
|---|---|---|
| **Node.js ≥ 18.17** | Runs the MCP server | `brew install node` / [nodejs.org](https://nodejs.org) |
| **`gh`** | GitHub operations | `brew install gh` / [cli.github.com](https://cli.github.com) |
| **`glab`** | GitLab operations | `brew install glab` / [gitlab.com/gitlab-org/cli](https://gitlab.com/gitlab-org/cli) |

Bitbucket has no CLI dependency — the adapter calls the REST API directly.

You only need the CLIs for the platforms you actually use. If you only work with GitHub, you can skip `glab`; the GitLab adapter only loads when the detected platform is GitLab.

## Installation

### Step 1 — Add the marketplace and install the plugin

From inside Claude Code:

```
/plugin marketplace add dilee/claude-extensions
/plugin install git-platform@dilee
```

### Step 2 — Install the server's Node dependencies

Claude Code doesn't run `npm install` for plugins, so you need to do it once. The plugin ships a setup script that finds its own directory:

```bash
# macOS / Linux (typical location after /plugin install):
~/.claude/plugins/marketplaces/dilee/plugins/git-platform/bin/setup.sh
```

If that path doesn't exist on your machine, find it with:

```bash
find ~/.claude -type d -name git-platform -path '*/plugins/*' 2>/dev/null
```

Then run `bin/setup.sh` from inside whatever directory that returned.

### Step 3 — Authenticate (see [next section](#authentication))

### Step 4 — Verify

Restart Claude Code so it picks up the MCP server, then in any git repo ask:

> "Detect the git platform for this repo."

Claude should call `git_platform_detect` and report the platform, owner, and repo. If it does, you're wired up.

## Authentication

### GitHub

One-time:

```bash
gh auth login
```

The adapter shells out to `gh`, so whatever auth context `gh` has is what git-platform uses. Nothing extra.

### GitLab

One-time:

```bash
glab auth login
```

Same pattern — the adapter shells out to `glab api`, which reuses your login.

### Bitbucket

Bitbucket needs an API token (app passwords are deprecated):

1. Create a token at [bitbucket.org/account/settings/api-tokens](https://bitbucket.org/account/settings/api-tokens/). Grant: Pull request (read, write), Repositories (read).
2. Export in your shell rc (`~/.zshrc` / `~/.bashrc`):

   ```bash
   export BITBUCKET_USERNAME="your-email@example.com"
   export BITBUCKET_TOKEN="your-api-token"
   ```

3. Restart Claude Code.

#### Using a secret manager (recommended)

To keep the token out of your shell rc, use the `_CMD` variant — any shell command whose stdout is the credential:

```bash
export BITBUCKET_USERNAME="your-email@example.com"

# Pick one:
export BITBUCKET_TOKEN_CMD="op read op://Personal/Bitbucket/token"                          # 1Password CLI
export BITBUCKET_TOKEN_CMD="pass show bitbucket/token"                                      # pass
export BITBUCKET_TOKEN_CMD="aws secretsmanager get-secret-value --secret-id bb-token --query SecretString --output text"
export BITBUCKET_TOKEN_CMD="security find-generic-password -s bitbucket -w"                 # macOS Keychain
```

The plugin runs `$BITBUCKET_TOKEN_CMD` fresh on each tool invocation and never stores the token. If both `BITBUCKET_TOKEN` and `BITBUCKET_TOKEN_CMD` are set, the direct value wins.

## Usage

Claude invokes the tools automatically based on what you ask. You don't type tool names — you describe what you want and Claude picks the right call.

### Example prompts

| What you say | Tool Claude calls |
|---|---|
| "What platform is this repo on?" | `git_platform_detect` |
| "Show me the repo info." | `repo_info` |
| "Open a PR titled 'Add rate limiting' from `feature/PROJ-123` into `main`, draft." | `pr_create` |
| "List my open PRs." / "Show me open PRs." | `pr_list` |
| "Show me PR 42 with the diff and CI checks." | `pr_view` |
| "Squash-merge PR 42 and delete the branch." | `pr_merge` |
| "Approve PR 42 with the comment 'LGTM'." | `pr_approve` |
| "Comment on PR 42: 'Can you add a test for the null case?'" | `pr_comment` |
| "Close PR 42 without merging." | `pr_decline` |

### A typical flow

```
You:    I just pushed feature/PROJ-123. Open a draft PR into develop, add @alice as reviewer.
Claude: (calls pr_create with draft=true, reviewers=["alice"]) → returns PR #87, URL

You:    Show me #87 with the CI checks.
Claude: (calls pr_view with id=87, include_checks=true) → summary + check statuses

You:    CI passed — mark it ready and squash-merge, delete the branch.
Claude: Before I merge — do you want me to approve it too, or just merge?
You:    Just merge.
Claude: (calls pr_merge with id=87, strategy="squash", delete_source_branch=true)
```

Side-effectful tools (`pr_merge`, `pr_approve`, `pr_decline`) describe themselves to Claude as "confirm with user before calling" — Claude will generally pause and ask before firing them.

### Cross-platform in one session

Because detection runs per tool call, you can `cd` between a GitHub repo and a Bitbucket repo in the same Claude session and each tool routes to the right adapter automatically. No flag, no restart.

## Self-hosted instances

Host detection recognises `github.com`, `gitlab.com`, `bitbucket.org`, and the common subdomain variants by default. For self-hosted GitHub Enterprise, self-hosted GitLab, or Bitbucket Data Center, set an override:

```bash
export GIT_PLATFORM_OVERRIDE=github      # forces GitHub adapter
export GIT_PLATFORM_OVERRIDE=gitlab      # forces GitLab adapter
export GIT_PLATFORM_OVERRIDE=bitbucket   # forces Bitbucket adapter
```

The adapter will then use whatever host your remote points to. Notes:

- **GitHub Enterprise**: works as long as `gh auth login --hostname your-ghe.example.com` has been run.
- **Self-hosted GitLab**: works as long as `glab auth login --hostname your-gitlab.example.com` has been run.
- **Bitbucket Data Center**: uses a different API shape from Bitbucket Cloud and is **not supported** in v0.1.0 — the adapter points at `api.bitbucket.org`. Data Center support is out of scope until someone asks for it.

## Troubleshooting

### "Command not found: gh" / "Command not found: glab"

You haven't installed that platform's CLI. See [Prerequisites](#prerequisites). You only need the CLI for platforms you use — it's fine to skip one.

### "No git remote 'origin' found"

You're running Claude Code in a directory that isn't a git repo, or your repo has no `origin` remote. Either `cd` into a repo or `git remote add origin <url>`.

### "Could not detect platform from host 'X'"

The remote host didn't match any built-in pattern. If this is a self-hosted instance, set `GIT_PLATFORM_OVERRIDE` (see [Self-hosted instances](#self-hosted-instances)).

### "Bitbucket authentication requires BITBUCKET_USERNAME and BITBUCKET_TOKEN"

The env vars aren't set in the environment Claude Code launched from. Either:

- Set them in your shell rc (`~/.zshrc` etc.) and restart your terminal before launching Claude, **or**
- Set them in `.mcp.json` directly (less secure — the file may be committed to a repo), **or**
- Use the `_CMD` variant (see [Bitbucket auth](#bitbucket)).

### "gh pr create succeeded but did not return a URL"

`gh` printed something unexpected. Usually means you're hitting an edge case in `gh` itself. Run `gh pr create --repo owner/repo --title x --body x --head branch` manually to see what it prints.

### Bitbucket "reviewers" aren't getting added

Bitbucket Cloud's API requires account **UUIDs**, not usernames. Pass UUIDs (`{abcd-...}`) in the `reviewers` array rather than display names. There's no public API to look up a username → UUID; ask the user to give you their UUID from [bitbucket.org/account/settings](https://bitbucket.org/account/settings/).

### The MCP server isn't starting

Check that:

1. `node -v` reports ≥ 18.17.
2. The plugin's `node_modules/` exists. If not, re-run `bin/setup.sh`.
3. The `.mcp.json` isn't broken (the one that ships should be valid — don't edit it unless you know what you're doing).

## Scope & limitations

v0.1.0 covers pull-request operations. **Pipelines, deployments, issues, and releases are not in scope** — planned for a follow-up.

Specific gaps:

- `pr_view --include-checks` returns an empty array on Bitbucket (commit-status walk lands with pipelines in v0.2.0).
- GitLab sub-subgroups beyond two levels deep may mis-parse — rare.
- Bitbucket reviewers take UUIDs only.
- Bitbucket Data Center (self-hosted) is unsupported.

## How it's built

```
src/
├── index.ts            MCP server — registers 9 tools with zod schemas
├── platform.ts         Detect platform from `git remote get-url origin`
├── types.ts            Shared types: PullRequest, PullRequestDetail, Check, …
├── adapters/
│   ├── base.ts         abstract PlatformAdapter — one method per tool
│   ├── github.ts       Shells out to `gh` CLI
│   ├── gitlab.ts       Shells out to `glab api` with JSON body via stdin
│   └── bitbucket.ts    Direct REST calls + Basic auth from env / _CMD
└── utils/
    ├── exec.ts         execFile wrapper with optional stdin
    └── auth.ts         Credential resolution (NAME or NAME_CMD)
```

Platform detection runs per tool invocation. That keeps the implementation trivially correct across repo switches at the cost of one `git remote get-url` per call — cheap.

## Development

```bash
# Install deps
npm install

# Type-check
npm run typecheck

# Run the server directly (stdio)
npm run dev
```

Edits under `src/` take effect on next server start — since the `.mcp.json` points at `tsx src/index.ts`, there's no build step.
