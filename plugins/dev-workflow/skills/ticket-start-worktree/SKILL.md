---
description: Fetch a ticket from the project's tracker and create its correctly-named branch in a separate git worktree, leaving the current checkout untouched. Invoke explicitly; do not auto-trigger.
disable-model-invocation: true
---

# Ticket start (worktree)

Start work on ticket: $ARGUMENTS

This is the worktree variant of `ticket-start`. It does everything `ticket-start` does — fetch the ticket, map its type to a branch prefix, propose a correctly-named branch — but instead of switching the current checkout to the new branch, it cuts the branch into a **separate git worktree**. The directory you're working in now stays exactly as it is.

Reach for this when you want to start a ticket without disturbing in-progress work: no stashing, no committing half-done changes, no losing your build state. The new branch gets its own directory; you `cd` into it to work and your original checkout is untouched. The branch is always cut from the **latest** remote tip of the base branch, and your local-only config (`.env` and friends) is copied into the new worktree so it's ready to build and run.

This skill is user-invoked only. Run it when the user types `/ticket-start-worktree <TICKET-KEY>` or explicitly asks to "start ticket X in a worktree".

## Supported trackers

Same as `ticket-start` — this skill adapts to whichever tracker the host Claude Code session can reach:

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

### Step 4 — Compute the worktree path

Worktrees live in a sibling directory next to the repo so they never pollute the working tree or need gitignoring. Flatten branch-name slashes to dashes for the directory name:

```bash
repo_root=$(git rev-parse --show-toplevel)
repo_name=$(basename "$repo_root")
parent_dir=$(dirname "$repo_root")
branch="<prefix><TICKET-KEY>"           # e.g. feature/PROJ-1234
wt_dirname=$(printf '%s' "$branch" | tr '/' '-')   # feature-PROJ-1234
wt_path="$parent_dir/$repo_name.worktrees/$wt_dirname"
```

So a repo at `/work/myrepo` and branch `feature/PROJ-1234` yields the worktree at `/work/myrepo.worktrees/feature-PROJ-1234`.

If the user wants a different location, honour it. If `$wt_path` already exists, stop and ask the user how to proceed (reuse, pick another path, or abort) — do not clobber it.

### Step 5 — Detect local-only config the new worktree will need

A fresh worktree contains only the files tracked on the base branch. Local-only files — `.env` and friends, plus other git-ignored local config — won't be there, so the app usually can't build or run in the new worktree until they're copied over.

Find the candidates: git-ignored env/config files in the current checkout, excluding the committed example/template variants (those are already in the worktree via the branch):

```bash
git -C "$repo_root" ls-files -o -i --exclude-standard \
  | grep -E '(^|/)\.env([.][^/]*)?$' \
  | grep -vE '\.env\.(example|sample|template|dist|tpl)$'
```

This catches `.env`, `.env.local`, `.env.production`, and nested ones like `apps/api/.env`. Extend the pattern if the project keeps other local-only config (e.g. `*.local.json`, `config/local.yml`, service-account keys). If nothing matches, there's nothing to copy — note that and move on.

These files often hold secrets. Copy them **locally only** — never commit, push, or print their contents. Because the worktree shares the repo's ignore rules, the copied files stay git-ignored there too, so there's no risk of accidentally committing them.

### Step 6 — Confirm with the user before creating anything

Show:

- One-line ticket summary.
- Proposed branch name (`<prefix><TICKET-KEY>`, e.g. `feature/PROJ-1234`).
- Base branch the new branch will be cut from — and that it will be the **latest** remote tip (see Step 7).
- Worktree path the branch will live in.
- The list of local-only config files (from Step 5) that will be copied in, if any.

Ask explicitly: "Proceed?" Do not create the worktree or copy any files until the user answers yes in the conversation.

### Step 7 — Create the worktree from the *latest* base

Always cut the branch from the freshly-fetched remote tip of the base branch, so the worktree starts from the latest development code — never a stale local branch:

```bash
git fetch origin <base-branch>
git worktree add -b <prefix><TICKET-KEY> "$wt_path" origin/<base-branch>
```

Branching off `origin/<base-branch>` right after the fetch is what guarantees "latest": it ignores whatever state the local base branch happens to be in, and never touches or pulls the current checkout. Confirm the tip if you want with `git -C "$wt_path" log -1 --oneline`.

- **No `origin` remote, or the base isn't on the remote:** you can't guarantee latest. Tell the user, then branch off the local base only if they accept it: `git worktree add -b <prefix><TICKET-KEY> "$wt_path" <base-branch>`.
- **Branch already exists:** omit `-b` and check it out into the worktree: `git worktree add "$wt_path" <prefix><TICKET-KEY>` — confirm first, since a branch can be checked out in only one worktree at a time and reusing it may not be intended.

**A dirty working tree is not a blocker here.** Unlike `ticket-start`, this skill never touches the current checkout, so uncommitted changes and untracked files are safe to leave in place — the whole point of the worktree variant.

### Step 8 — Copy the local-only config into the worktree

For each file found in Step 5, copy it to the same relative path inside the worktree, creating parent directories as needed and preserving file modes:

```bash
git -C "$repo_root" ls-files -o -i --exclude-standard \
  | grep -E '(^|/)\.env([.][^/]*)?$' \
  | grep -vE '\.env\.(example|sample|template|dist|tpl)$' \
  | while IFS= read -r f; do
      mkdir -p "$wt_path/$(dirname "$f")"
      cp -p "$repo_root/$f" "$wt_path/$f"
    done
```

Report which files were copied (by path, not contents). Skip this step entirely if Step 5 found nothing.

### Step 9 — Tell the user where to work

Tell the user to `cd "$wt_path"` to start working on the ticket, and confirm their original checkout is unchanged and still on its current branch.

### Step 10 — Offer follow-ups, but do not run them unprompted

- Transition the ticket to "In Progress" in the tracker — only if the user approves.
- Offer to draft a spec / design doc if the ticket is non-trivial.
- Remind the user that when the ticket is done and merged, the worktree can be cleaned up with `git worktree remove "$wt_path"` (and the branch deleted separately if desired). Do not run the cleanup yourself.

## Hard rules

- Do not auto-run anything with external side effects (ticket transitions, `git push`, tracker API writes, worktree removal) without explicit user approval in the conversation. Propose, then wait.
- Copied `.env`/config files are for local use only — never commit, push, or print their contents. They stay git-ignored in the worktree; keep it that way.

## References

- `ticket-start` skill in this same plugin — the in-place variant that switches the current checkout instead of using a worktree. Use that when you want to work in the repo's main directory.
- `branch-naming` skill in this same plugin — authoritative source for branch prefix rules and violation handling.
- Host project's `CLAUDE.md` / `AGENTS.md` — tracker choice, ticket-key regex, integration branch name.
