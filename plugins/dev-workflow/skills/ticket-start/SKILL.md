---
description: Fetch a ticket from the project's tracker and create the correctly-named branch for it. Invoke explicitly; do not auto-trigger.
disable-model-invocation: true
---

# Ticket start

Start work on ticket: $ARGUMENTS

This skill is user-invoked only. Run it when the user types `/ticket-start <TICKET-KEY>` or explicitly asks you to "start ticket X". It fetches the ticket from whichever tracker the host session can reach, proposes a correctly-prefixed branch name, and — only after explicit confirmation — creates the branch from the right base.

## Supported trackers

This skill adapts to whichever tracker the host Claude Code session has access to. Common setups:

- **Jira** via the Atlassian MCP (`getJiraIssue`, `transitionJiraIssue`).
- **Linear** via the Linear MCP.
- **GitHub Issues** via the `gh` CLI.
- **GitLab Issues** via the `glab` CLI.

### Tracker detection

Infer from the ticket-key format, then confirm against the project's config:

- `[A-Z]+-\d+` → likely Jira or Linear.
- `#\d+` or a bare integer → GitHub or GitLab issue.
- Anything else → ask the user which tracker to use.

The project's `CLAUDE.md` or `AGENTS.md` should declare the tracker explicitly. Check there first; fall back to the heuristics above only if the project doesn't say.

## Steps

### Step 1 — Parse the ticket key from `$ARGUMENTS`

Extract the key/number. If the input doesn't match any known pattern, ask the user for a valid ticket key and stop — do not guess.

### Step 2 — Fetch the ticket

Use the right tool for the detected tracker (MCP call for Jira/Linear, `gh issue view` for GitHub, `glab issue view` for GitLab). If the fetch fails or no tracker tool is available, surface that to the user and ask whether to proceed with only the key (no summary, no type detection).

### Step 3 — Map issue type to branch prefix

| Issue type | Prefix | Branch off |
|---|---|---|
| Story / Task / Epic / feature request | `feature/` | `develop` (Git Flow) or `main` (trunk-based) |
| Bug / defect | `bugfix/` | same as above |
| Sub-task | use the parent's type | same as parent |

Hotfixes are context-dependent: if the ticket text or the user signals an urgent production fix, ask whether to use `hotfix/` off the production branch instead of the default.

To detect Git Flow vs trunk-based, check `git branch -a` for a `develop` branch. If it exists, default the base to `develop`; otherwise use `main`. Honour any override in the project's CLAUDE.md / AGENTS.md.

### Step 4 — Confirm with the user before creating the branch

Show:

- One-line ticket summary.
- Proposed branch name (`<prefix><TICKET-KEY>`, e.g. `feature/PROJ-1234`).
- Base branch the new branch will be cut from.

Ask explicitly: "Proceed?" Do not create the branch until the user answers yes in the conversation.

### Step 5 — Create the branch

```bash
git fetch origin
git checkout <base-branch>
git pull --ff-only
git checkout -b <prefix><TICKET-KEY>
```

If the working tree is dirty (uncommitted changes, untracked files in play), stop and ask the user how to handle it — stash, commit, or abort — before running any of the above.

### Step 6 — Offer follow-ups, but do not run them unprompted

- Transition the ticket to "In Progress" in the tracker — only if the user approves.
- Offer to draft a spec / design doc if the ticket is non-trivial.

## Hard rule

Do not auto-run anything with external side effects (ticket transitions, `git push`, tracker API writes) without explicit user approval in the conversation. Propose, then wait.

## References

- `branch-naming` skill in this same plugin — authoritative source for branch prefix rules and violation handling.
- Host project's `CLAUDE.md` / `AGENTS.md` — tracker choice, ticket-key regex, integration branch name.
