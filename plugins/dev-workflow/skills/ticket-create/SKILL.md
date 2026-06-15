---
description: File a new ticket in the project's tracker for a bug or improvement noticed during work. Drafts a structured ticket from the current context, confirms, then creates it. Invoke explicitly; do not auto-trigger.
disable-model-invocation: true
---

# Ticket create

File a ticket for: $ARGUMENTS

This skill is the **capture** counterpart to `ticket-start`/`ticket-start-worktree`. Those consume a ticket (fetch → branch); this one produces a ticket. Reach for it when you spot a bug or an improvement mid-work and want it tracked without breaking flow — the skill turns "the token refresh retries forever on a 401" into a properly structured ticket a teammate can pick up.

This skill is user-invoked only. Run it when the user types `/ticket-create <description>` or explicitly asks to "file a ticket", "create a ticket", "open a bug for X". It drafts the ticket from whatever context is already in the session, shows the draft, and — only after explicit confirmation — creates it in whichever tracker the host session can reach.

## Supported trackers

Same family as `ticket-start` — adapts to whichever tracker is reachable:

- **Jira** via the Atlassian MCP (`getVisibleJiraProjects`, `getJiraProjectIssueTypesMetadata`, `createJiraIssue`).
- **Linear** via the Linear MCP (issue-create tool).
- **GitHub Issues** via the `gh` CLI (`gh issue create`).
- **GitLab Issues** via the `glab` CLI (`glab issue create`).

### Tracker & project detection

The project's `CLAUDE.md` or `AGENTS.md` should declare the tracker and target project. Check there first; fall back to heuristics only if it doesn't say.

- **Tracker**: read the `Tracker:` field. If absent, infer from what's connected — Atlassian MCP present → Jira; Linear MCP present → Linear; otherwise `gh`/`glab` per the git remote.
- **Target project / repo**: for Jira, derive the project key from the `Ticket key format` (e.g. `PROJ-\d+` → project `PROJ`) or an explicit `Default ticket project:` field. For GitHub/GitLab, default to the current repo's remote. If the project is ambiguous (multiple projects, no config), ask — do not guess.

If no tracker tool is available at all, stop and tell the user; offer to write the draft to a file or to the chat so nothing is lost.

## Steps

### Step 1 — Gather context

Start from `$ARGUMENTS`, then enrich from what's already in the session so the user doesn't re-type what they just saw:

- The file(s) and `file:line` locations under discussion.
- The current branch and any associated PR/MR.
- Relevant code, error output, or diff hunks already in the conversation.

Do **not** go spelunking through the whole codebase or run a wide investigation — this is a capture step, not a debugging session. Pull from the immediate context; if a key detail is missing (e.g. expected vs. actual behaviour), ask one focused question rather than inventing it.

### Step 2 — Classify the issue type

Map what the user described to the tracker's issue types:

| User signal | Issue type |
|---|---|
| Something is broken / wrong behaviour / regression | **Bug** |
| Make something better, faster, cleaner; tech debt; nice-to-have | **Improvement** (or **Task** if the tracker has no Improvement type) |
| New capability | **Story** / **Task** |

For Jira, fetch the project's real issue-type names first (`getJiraProjectIssueTypesMetadata`) and match against them — don't assume "Improvement" exists. If the mapping is unclear, propose your best guess in the draft and let the user correct it.

### Step 3 — Draft the ticket

Build a structured draft. Adapt fields to the type:

- **Summary / title** — one line, specific and searchable. Not "bug in auth" but "Token refresh retries indefinitely on 401 instead of forcing re-login".
- **Description** — what it is and why it matters, in the user's voice where possible.
- **For bugs**: Steps to reproduce, Expected vs. Actual, and affected `file:line` references.
- **For improvements/tasks**: Motivation, Proposed approach, and Acceptance criteria.
- **Context links** — current branch, PR/MR, and code locations, so whoever picks it up lands in the right place.

Keep it tight. A good ticket is scannable, not an essay.

### Step 4 — Confirm before writing

Show the full draft plus where it will land:

- Tracker + target project/repo.
- Issue type.
- Summary and description as they'll be submitted.

Ask explicitly: "Create this ticket?" Do not call any tracker write tool until the user answers yes in the conversation. If they want edits, revise the draft and re-confirm.

### Step 5 — Create the ticket

Use the right tool for the detected tracker:

- **Jira** — `createJiraIssue` with the resolved cloudId, project key, issue-type name, summary, and description.
- **Linear** — the MCP issue-create tool with team + title + description.
- **GitHub** — `gh issue create --title ... --body ...` (add `--label bug` where it applies).
- **GitLab** — `glab issue create --title ... --description ...`.

Report back the created **key/number and URL**.

### Step 6 — Offer follow-ups, but do not run them unprompted

- **Start it now** — offer to hand off to `ticket-start-worktree` (or `ticket-start`) so the user can begin work immediately in a clean worktree. Closes the capture → start loop.
- Add labels, assignee, sprint, or link it to the current ticket/PR — only if the user asks.

## Hard rule

Do not create the ticket — or run any tracker write (labels, assignee, links, transitions) — without explicit user approval in the conversation. Draft, show, then wait. Never invent reproduction steps, error messages, or acceptance criteria the user didn't provide or that aren't visible in the session; mark anything uncertain as a question in the draft instead.

## References

- `ticket-start` / `ticket-start-worktree` skills in this same plugin — the consume side; natural follow-up after creating a ticket.
- Host project's `CLAUDE.md` / `AGENTS.md` — tracker choice, ticket-key regex / default project, integration branch.
