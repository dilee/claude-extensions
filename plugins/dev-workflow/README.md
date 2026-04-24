# dev-workflow

Universal dev-workflow helpers for Claude Code: branch naming, ticket-driven branch creation, and a pre-PR documentation-sync check. The plugin is project-agnostic — it reads per-project parameters (tracker, ticket-key regex, integration branch, docs folder) from the host project's `CLAUDE.md` or `AGENTS.md`.

## Contents

- [What you get](#what-you-get)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Per-project setup](#per-project-setup)
- [How each component works](#how-each-component-works)
- [Troubleshooting](#troubleshooting)

## What you get

### Skills

| Name | Type | Fires when |
|---|---|---|
| `branch-naming` | auto-invoked | You're about to run `git checkout -b`, `git switch -c`, `git branch <name>`, or `git push -u origin <new-branch>` — or you propose a branch name in conversation. Enforces `feature/`, `bugfix/`, `hotfix/`, `release/` prefixes plus the project's ticket-key format. |
| `ticket-start` | user-invoked | You explicitly ask Claude to start a ticket or type `/ticket-start <KEY>`. Fetches the ticket from whichever tracker is reachable, proposes a correctly-prefixed branch, and creates it from the right base — only after confirmation. |

### Agents

| Name | What it does |
|---|---|
| `docs-sync` | Scans the current branch's diff against the base branch and reports which documentation files need updating before you open the PR. Does not edit docs. Cap: ~400 words per report. |

## Prerequisites

- **A git repository.** That's the only hard requirement.
- **For `ticket-start`**: Claude needs some way to reach your tracker. Any one of these works:
  - Jira — the Atlassian MCP connected in your Claude session.
  - Linear — the Linear MCP connected in your Claude session.
  - GitHub Issues — the `gh` CLI installed and authenticated (`gh auth login`).
  - GitLab Issues — the `glab` CLI installed and authenticated (`glab auth login`).

  Without any of these, `ticket-start` still works but skips the ticket fetch and asks you for the summary.

## Installation

From inside Claude Code:

```
/plugin marketplace add dilee/claude-extensions
/plugin install dev-workflow@dilee
```

The skills and agent are available immediately — no build step, no separate setup.

## Per-project setup

The plugin is framework-agnostic; you tell it about your project by adding this block to the project's `CLAUDE.md` (or `AGENTS.md`):

````markdown
## Project conventions (read by Claude Code extensions)

- Ticket key format: `[A-Z]+-\d+`   # adjust to your tracker, e.g. `PROJ-\d+`
- Integration branch: `main`         # or `develop` if you use Git Flow
- Tracker: Jira                      # Jira | Linear | GitHub | GitLab
- Docs folder: `docs/`
- ADR folder: `docs/adr/`
````

All fields are optional; sensible defaults apply. Setting them explicitly prevents Claude from guessing when conventions are ambiguous.

## How each component works

### `branch-naming` — before every new branch

No invocation needed — it fires automatically when Claude sees a branch-creation command or proposal. Example:

```
You:    Let me branch off to fix that null check.
Claude: I'll create a bugfix branch. What's the ticket key?
You:    PROJ-456.
Claude: Proposed branch: bugfix/PROJ-456, off develop. Create it?
You:    Yes.
Claude: (runs git checkout -b bugfix/PROJ-456)
```

If you propose a name that doesn't match, the skill stops the command and suggests a correction:

```
You:    git checkout -b fix/null-bug
Claude: That uses a non-standard prefix. The conventions here are
        feature/, bugfix/, hotfix/, release/ — and this looks like
        a bug fix. Should I use bugfix/<TICKET-KEY> instead?
```

### `ticket-start` — ticket → branch in one step

Invoke explicitly:

```
/ticket-start PROJ-123
```

or ask in natural language:

```
Start work on ticket PROJ-123.
```

Claude will:

1. Fetch the ticket from your tracker (Jira / Linear / GitHub / GitLab).
2. Map the issue type → `feature/` or `bugfix/` prefix.
3. Propose the branch name + base branch and wait for confirmation.
4. Create the branch from the correct base once you confirm.
5. Offer to transition the ticket to "In Progress" (won't do it without permission).

Nothing with external side effects runs without explicit in-conversation approval.

### `docs-sync` agent — pre-PR doc gap scan

Invoke explicitly when you're about to open a PR:

```
Use the docs-sync agent to check whether I missed any doc updates.
```

The agent runs in a fresh context, diffs the current branch against the base branch (tries `origin/develop`, then `origin/main`, then `origin/master`), and reports gaps grouped by severity:

- **Must update before PR** — endpoints added without API docs, new integrations, schema changes without ER-diagram updates, broken references.
- **Should consider** — potential ADRs, stale-looking sections.
- **Nothing to update** — only if it actually scanned and found nothing.

It reports; it doesn't edit.

## Troubleshooting

### `branch-naming` didn't fire when I expected

The skill triggers on branch-creation commands and branch-name proposals. If you typed something Claude read as a discussion rather than an action, it may not fire. Say something more explicit like "create a branch for X" or run the git command.

You can also check that the skill is active in your session: `/plugin list` inside Claude Code.

### `ticket-start` can't find my ticket

Check that:

1. Claude has access to your tracker. For Jira/Linear, that's the MCP being connected (check `/mcp` in Claude Code). For GitHub/GitLab, that's `gh auth status` / `glab auth status` succeeding in your shell.
2. The ticket key format matches. If your tracker uses a non-standard key (e.g. `ACME_2024-42`), add `Ticket key format: <regex>` to the project's CLAUDE.md.

### `docs-sync` says "base branch not found"

The agent tries `origin/develop`, then `origin/main`, then `origin/master`. If none exist (e.g. freshly cloned without fetching), run `git fetch origin` first. If your base branch has a different name, tell Claude which one to diff against.
