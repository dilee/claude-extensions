---
description: Enforce git branch naming conventions. TRIGGER when the user or assistant is about to run `git checkout -b`, `git switch -c`, `git branch <name>`, `git push -u origin <new-branch>`, or is proposing a branch name. Stops ad-hoc prefixes and missing ticket keys before the branch gets created.
---

# Branch naming

Branches in this project follow predictable prefixes, carry a ticket key where the project uses one, and branch off / merge into the right long-lived branches. Use this skill before any command that creates or pushes a new branch — catch the mistake before the branch exists, not after.

## Four conventional patterns

| Purpose | Pattern | Branch from | Merge into |
|---|---|---|---|
| New feature | `feature/<TICKET-KEY>` | `develop` (Git Flow) or `main` (trunk-based) | same |
| Bug fix on integration branch | `bugfix/<TICKET-KEY>` | `develop` or `main` | same |
| Critical production fix | `hotfix/<TICKET-KEY-or-slug>` | `main` or production branch | `main` AND `develop` (if Git Flow) |
| Release prep | `release/<vX.Y.Z>` or `release/<YYYY.MM.DD.N>` | `develop` or trunk | `main` AND `develop` |

## Ticket key format

The ticket key format is project-specific. Default to `[A-Z]+-\d+` (for example `PROJ-1234`). The host project's `CLAUDE.md` or `AGENTS.md` may specify a different regex — if so, that takes precedence over the default. Casing matters: trackers key their auto-linking off the uppercase form, so do not lowercase the key.

## Hard rules

- Never commit directly to `main`, `master`, `develop`, or any long-lived integration branch — always branch first.
- Never use ad-hoc variants like `feat/`, `bug/`, `fix/`, `feature-`, `BUGFIX/`. Use the exact four prefixes above.
- Hotfixes branch off the production branch, not the integration branch. Merge back into both `main` and `develop` (if the project uses Git Flow).
- Project-specific conventions declared in CLAUDE.md / AGENTS.md override these defaults — always check the host project's config first.

## No ticket key provided?

If the user hasn't given a ticket key and the project expects one, do not invent one. Ask for it. If the user explicitly wants a branch without a key (e.g. quick spike, throwaway experiment), flag that it breaks tracker auto-linking and require explicit confirmation before proceeding.

## What to do when you spot a violation

1. Stop the command. Do not run `git checkout -b` / `git switch -c` / `git push` yet.
2. Surface the correct pattern from the table above and name which rule the proposed branch violated.
3. Propose a corrected branch name that matches the pattern.
4. Run the command only after the user explicitly confirms the corrected name.

## Customizing for a project

A project's `CLAUDE.md` or `AGENTS.md` may override any of the following — check there before applying defaults:

- Ticket-key regex (e.g. a team that uses `PROJ-\d+` only, or a non-standard scheme).
- Integration branch name (`develop` for Git Flow vs `main` for trunk-based).
- Release-version style (semver `vX.Y.Z` vs date-based `YYYY.MM.DD.N`).
- Extra prefixes the team uses (e.g. `chore/`, `docs/`, `spike/`).
