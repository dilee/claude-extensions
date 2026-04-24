# Implementation Plan: Claude Code Extensions Marketplace

> A self-contained spec you can hand directly to Claude Code. It instructs Claude Code to scaffold a public Claude Code plugin marketplace repository from empty to a working v0.1.0 release. Every file, frontmatter field, and verification step is specified below. Follow the execution order in Section 10.

---

## 1. Goal

Build a public GitHub repository that serves as a Claude Code plugin marketplace. It must:

- Be installable via `/plugin marketplace add dilee/claude-extensions`.
- Ship one working plugin named `dev-workflow` at version `0.1.0`.
- Contain one auto-invoked skill, one user-invoked skill, and one background agent — enough to demonstrate all three extension types.
- Be public-safe: no employer names, no project-specific identifiers, no real ticket keys, no hardcoded repo URLs other than the marketplace's own.
- Have a README that explains installation, what each component does, and the "project parameters contract" users put in their own CLAUDE.md.
- Pass `claude plugin validate .` with no errors.

Out of scope for v0.1.0: MCP servers, hooks, additional plugins (backend-essentials, frontend-essentials), and CI.

## 2. Repository metadata

- **GitHub repo**: `dilee/claude-extensions`
- **Marketplace `name` field** (inside `marketplace.json`): `dilee`
- **Install command** (documented in README): `/plugin marketplace add dilee/claude-extensions` then `/plugin install dev-workflow@dilee`
- **License**: MIT
- **Author name in manifests**: `dilee`

Do not use any of the following reserved marketplace names: `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `knowledge-work-plugins`, `life-sciences`. Do not use names that impersonate official marketplaces.

## 3. Final directory structure (v0.1.0)

```
claude-extensions/
├── .claude-plugin/
│   └── marketplace.json
├── .gitignore
├── CLAUDE.md                          ← instructions for Claude when editing THIS repo
├── CONTRIBUTING.md
├── LICENSE                            ← MIT
├── README.md                          ← public-facing docs
└── plugins/
    └── dev-workflow/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── README.md                  ← plugin-specific docs
        ├── skills/
        │   ├── branch-naming/
        │   │   └── SKILL.md           ← auto-invoked
        │   └── ticket-start/
        │       └── SKILL.md           ← user-invoked (disable-model-invocation: true)
        └── agents/
            └── docs-sync.md
```

Component directories (`skills/`, `agents/`) must be at the plugin root, not inside `.claude-plugin/`. Only `plugin.json` goes in `.claude-plugin/`.

## 4. File specifications

Each file below has: (a) purpose, (b) exact format/frontmatter, (c) content requirements. Where content is prose, write it in your own words; do not copy from other public repositories.

### 4.1 `.claude-plugin/marketplace.json`

**Format** (exact structure):

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "dilee",
  "owner": {
    "name": "dilee"
  },
  "metadata": {
    "description": "Personal Claude Code extensions — dev workflow helpers and more."
  },
  "plugins": [
    {
      "name": "dev-workflow",
      "source": "./plugins/dev-workflow",
      "description": "Universal dev workflow — branch naming conventions, ticket-driven branch creation, and pre-PR documentation sync.",
      "version": "0.1.0",
      "keywords": ["workflow", "git", "branch-naming", "tickets", "docs-sync"],
      "license": "MIT"
    }
  ]
}
```

The `version` is set here (marketplace entry) *or* in `plugin.json`, not both — `plugin.json` silently wins if both are set. Keep version here for now.

### 4.2 `plugins/dev-workflow/.claude-plugin/plugin.json`

```json
{
  "name": "dev-workflow",
  "description": "Universal dev workflow — branch naming conventions, ticket-driven branch creation, and pre-PR documentation sync. Reads per-project parameters from the project's CLAUDE.md or AGENTS.md.",
  "author": {
    "name": "dilee"
  },
  "homepage": "https://github.com/dilee/claude-extensions",
  "repository": "https://github.com/dilee/claude-extensions",
  "license": "MIT",
  "keywords": ["workflow", "git", "branch-naming", "tickets", "docs-sync", "pr-review"]
}
```

Do not set `version` here for v0.1.0 — it lives in marketplace.json.

### 4.3 `plugins/dev-workflow/skills/branch-naming/SKILL.md`

**Frontmatter** (exact):

```yaml
---
description: Enforce git branch naming conventions. TRIGGER when the user or assistant is about to run `git checkout -b`, `git switch -c`, `git branch <name>`, `git push -u origin <new-branch>`, or is proposing a branch name. Stops ad-hoc prefixes and missing ticket keys before the branch gets created.
---
```

This skill is **auto-invoked**. Do NOT add `disable-model-invocation: true`.

**Body content requirements** (write in your own words):

1. A one-paragraph opening that states the purpose: branches follow predictable prefixes with a ticket key where the project uses one, and branch off / merge into the right long-lived branches.

2. A "Four conventional patterns" table with these rows:

   | Purpose | Pattern | Branch from | Merge into |
   |---|---|---|---|
   | New feature | `feature/<TICKET-KEY>` | `develop` (Git Flow) or `main` (trunk-based) | same |
   | Bug fix on integration branch | `bugfix/<TICKET-KEY>` | `develop` or `main` | same |
   | Critical production fix | `hotfix/<TICKET-KEY-or-slug>` | `main` or production branch | `main` AND `develop` (if Git Flow) |
   | Release prep | `release/<vX.Y.Z>` or `release/<YYYY.MM.DD.N>` | `develop` or trunk | `main` AND `develop` |

3. A paragraph explaining that:
   - The ticket key format is project-specific. Default to `[A-Z]+-\d+` (for example `PROJ-1234`).
   - The project's `CLAUDE.md` or `AGENTS.md` may specify a different regex — if so, that takes precedence.
   - Casing matters for tracker auto-linking. Do not lowercase.

4. A "Hard rules" list:
   - Never commit directly to `main`, `master`, `develop`, or any long-lived integration branch — always branch first.
   - Never use ad-hoc variants like `feat/`, `bug/`, `fix/`, `feature-`, `BUGFIX/`. Use the exact four prefixes above.
   - Hotfixes branch off the production branch, not the integration branch. Merge back to both.
   - Project-specific conventions in CLAUDE.md / AGENTS.md override these defaults.

5. A "No ticket key provided?" section: if the user hasn't given a ticket key and the project expects one, do not invent one. Ask for it. If they explicitly want a branch without a key, flag that it breaks tracker auto-linking and require explicit confirmation.

6. A "What to do when you spot a violation" section (numbered steps): stop the command, surface the correct pattern, propose a corrected name, only run the command after user confirms.

7. A "Customizing for a project" section listing what a project's CLAUDE.md may override: ticket-key regex, integration branch name (`develop` vs `main`), release-version style (date vs semver), extra prefixes the team uses.

**Must not include**: any specific ticket key like `WERD-\d+` or `PROJ-1234` other than in illustrative examples. No employer names. No company-specific branch conventions.

### 4.4 `plugins/dev-workflow/skills/ticket-start/SKILL.md`

**Frontmatter** (exact):

```yaml
---
description: Fetch a ticket from the project's tracker and create the correctly-named branch for it. Invoke explicitly; do not auto-trigger.
disable-model-invocation: true
---
```

The `disable-model-invocation: true` flag makes this user-invoked only (similar to a slash command). Users run it by explicitly asking Claude to invoke `ticket-start` or by typing `/ticket-start <TICKET-KEY>`.

**Body content requirements**:

1. Opening line: "Start work on ticket: $ARGUMENTS" (this renders the user's arguments into the skill body at invocation time).

2. **Supported trackers** section listing common setups and explaining that the skill adapts to whichever tracker the host Claude Code session has access to via MCP or CLI:
   - Jira via the Atlassian MCP (`getJiraIssue`, `transitionJiraIssue`)
   - Linear via the Linear MCP
   - GitHub Issues via the `gh` CLI
   - GitLab Issues via the `glab` CLI

3. **Tracker detection** subsection: detect from the ticket-key format:
   - `[A-Z]+-\d+` → likely Jira or Linear
   - `#\d+` → GitHub or GitLab issue
   - Other patterns → ask the user
   - The project's CLAUDE.md / AGENTS.md should specify which tracker — check there first.

4. **Numbered steps** (the actual workflow):

   **Step 1 — Parse the ticket key/number from `$ARGUMENTS`.** If it doesn't match any known pattern, ask for it and stop.

   **Step 2 — Fetch the ticket** using the right tool for the detected tracker. If fetching fails or no tracker tool is available, surface that and ask whether to proceed with only the key.

   **Step 3 — Map issue type to branch prefix:**

   | Issue type | Prefix | Branch off |
   |---|---|---|
   | Story / Task / Epic / feature request | `feature/` | `develop` (Git Flow) or `main` (trunk-based) |
   | Bug / defect | `bugfix/` | same as above |
   | Sub-task | use the parent's type | same as parent |

   Include a note that hotfixes are context-dependent — if the ticket or user signals urgent production fix, ask whether to use `hotfix/` off the production branch instead.

   Include a note on detecting Git Flow vs trunk-based: check `git branch -a` for a `develop` branch; default to `develop` if it exists, otherwise `main`.

   **Step 4 — Confirm with the user before creating the branch.** Show:
   - One-line ticket summary
   - Proposed branch name (`<prefix><TICKET-KEY>`, e.g. `feature/PROJ-1234`)
   - Base branch
   - Explicitly ask: "Proceed?" Do not create the branch until the user answers yes in the conversation.

   **Step 5 — Create the branch** from the correct base. Include the exact commands in a bash code block:
   ```bash
   git fetch origin
   git checkout <base-branch>
   git pull --ff-only
   git checkout -b <prefix><TICKET-KEY>
   ```
   If the working tree is dirty, stop and ask before proceeding.

   **Step 6 — Offer follow-ups but do not run them unprompted:**
   - Transition the ticket to "In Progress" (only if the user approves)
   - Offer to draft a spec document if this is a non-trivial feature

5. **Hard rule at the end of the body**: do not auto-run anything with external side effects (ticket transitions, pushing to remote) without explicit user approval in the conversation.

6. **References** section: points to `branch-naming` skill in the same plugin as the authoritative source for branch rules, and to the project's CLAUDE.md / AGENTS.md for tracker and ticket-key format.

**Must not include**: hardcoded ticket keys, hardcoded tracker URLs, employer names, or any assumption the project uses a specific tracker.

### 4.5 `plugins/dev-workflow/agents/docs-sync.md`

**Frontmatter** (exact):

```yaml
---
name: docs-sync
description: Use this agent to check whether code changes on the current branch require documentation updates that haven't been made yet. Invoke before creating a PR that touches architecture, endpoints, integrations, or the data model. The agent reports what docs need updating — it does not update them itself.
tools: Read, Grep, Glob, Bash
---
```

**Body content requirements** (agent system prompt):

1. Opening paragraph stating the agent's single job: scan the current branch's diff against the base branch and list every documentation file that should have been updated alongside the code change but wasn't. Be concrete — point to file paths and the specific sections to update, not vague "update the docs" notes.

2. **Where docs live** section: the agent detects the project's docs folder by checking, in order, for a top-level directory named: `docs/`, `Docs/`, `documentation/`, `doc/`. If none, it falls back to `README.md` and folder-level `README.md`s. Include a note that it should detect the base branch by trying `origin/develop`, then `origin/main`, then `origin/master`, and ask the user if none exist.

3. **What you check** — a numbered list of checks, each with a **Trigger** (what in the diff activates this check) and a **Check** (what to look for in docs):

   **Check 1: New or changed HTTP endpoints → API reference**
   - Trigger: diff touches HTTP controller / router / handler files across common frameworks (ASP.NET Controllers, Express/Fastify/Koa routes, NestJS `*.controller.ts`, Django/Flask/FastAPI views, Rails routes/controllers, Spring `*Controller.java`, Go route registrations).
   - Check: look in `docs/api/` for entries covering the new or changed routes; flag missing or stale ones with verb + path.

   **Check 2: New external integration → integrations doc**
   - Trigger: diff adds a dependency in `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `*.csproj`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json` where the package name looks like a third-party service (examples: stripe, twilio, sendgrid, clerk, auth0, segment, posthog, datadog, aws-*).
   - Check: grep the docs folder for mentions of the service; if not listed, flag with the package name and where it's used.

   **Check 3: Schema/migration changes → data-model docs**
   - Trigger: diff adds a migration file, or changes an entity / model / schema file (ORM models, Prisma schema, SQLAlchemy classes, Django models, ActiveRecord models, EF Core entities, TypeORM entities, Diesel schema).
   - Check: if there's an ER diagram or data-model doc, flag it for review.

   **Check 4: New ADR-worthy decision**
   - Trigger: diff introduces a pattern or convention not covered by any existing ADR — new auth scheme, new messaging topology, new background-job pattern, library swap, or significant architectural shift.
   - Check: read `docs/adr/README.md` (or equivalent). If the change represents a decision that could reasonably have gone another way, suggest the user write a new ADR. Be conservative: routine code changes are not ADRs.

   **Check 5: Broken references**
   - Trigger: diff renames or moves a file that docs reference.
   - Check: grep the docs folder for references to the old path. Flag each broken link.

4. **How to run** section with exact bash commands:

   ```bash
   # Detect base branch
   git fetch origin --quiet
   git show-ref --verify --quiet refs/remotes/origin/develop && BASE=origin/develop \
     || git show-ref --verify --quiet refs/remotes/origin/main && BASE=origin/main \
     || BASE=origin/master

   # Files changed
   git diff --name-only $BASE...HEAD
   # Full diff
   git diff $BASE...HEAD
   ```

5. **Output format** — group findings by severity, most actionable first. Include file paths with line hints where possible. Three sections:

   - **Must update before PR** — concrete doc gaps tied to specific code changes
   - **Should consider** — judgment calls like potential ADRs
   - **Nothing to update** — only include this section if the agent actually ran checks and found no gaps, so the reviewer knows the scan happened

6. **Ground rules at the end** (hard constraints the agent must follow):
   - Be specific. Don't say "consider updating architecture docs" — say which file and which section.
   - Don't invent findings. If the diff doesn't touch something, don't speculate.
   - Don't fix the docs unless the user explicitly asked for that — the job is to report, not write.
   - **Cap the report at ~400 words.** Link, don't quote.

**Must not include**: references to any specific project, docs folder layout beyond the common ones above, or any employer-specific conventions.

### 4.6 Root-level files

#### 4.6.1 `LICENSE`

Standard MIT license text, with copyright line `Copyright (c) 2026 dilee` (current year). Use the canonical MIT text — do not invent wording.

#### 4.6.2 `.gitignore`

```
# OS
.DS_Store
Thumbs.db

# Editors
.vscode/
.idea/
*.swp

# Claude Code
.claude/
!.claude-plugin/

# Node (in case plugins add JS tooling later)
node_modules/
dist/
*.log
```

The `!.claude-plugin/` line is critical — ensures the `.claude-plugin/` folders are tracked even though `.claude/` is ignored.

#### 4.6.3 `CLAUDE.md` (repo-level instructions for Claude when editing THIS repo)

Write this file in your own words, covering:

1. One-paragraph intro: this repo is a public Claude Code plugin marketplace maintained by dilee.

2. **Structure** subsection with an ASCII tree of the repo layout (mirroring Section 3 of this plan).

3. **Editing conventions** subsection:
   - Bump versions in `marketplace.json` per SemVer.
   - Skill `description` frontmatter is load-bearing — it's what Claude reads to decide whether to activate. Write it as a trigger spec ("TRIGGER when..."), not as a feature description.
   - Never hardcode project-specific identifiers (ticket keys, company names, internal tool names) — the repo is public.
   - Do not commit credentials, tokens, or internal URLs. Scan before every push.
   - Do not commit without explicit user request.
   - Do not push without explicit user permission.

4. **Testing locally** subsection: instructions to run `/plugin marketplace add ./` from the repo root and `/plugin install dev-workflow@dilee` to test before pushing. Mention `claude plugin validate .` as the validation command.

#### 4.6.4 `README.md` (public-facing)

Write in your own words. Structure:

1. **Title**: `# Claude Code Extensions`

2. **One-paragraph subtitle**: "A personal plugin marketplace for Claude Code. Drop-in extensions for the dev workflow everyone reinvents on every project."

3. **Installation** section with a fenced bash block:
   ```bash
   # Add this marketplace (one time)
   /plugin marketplace add dilee/claude-extensions

   # Install plugins
   /plugin install dev-workflow@dilee
   ```
   Plus a one-liner on updating: `/plugin marketplace update`.

4. **Plugins** section — for each plugin (just `dev-workflow` in v0.1.0), include:
   - Name and current version
   - One-paragraph summary
   - A table of skills with columns: Name | Type (auto / user-invoked) | What it does
   - A table of agents with columns: Name | What it does

5. **Project parameters contract** section — this is the key public API. Explain that plugins read per-project configuration from the host project's `CLAUDE.md` or `AGENTS.md`, and give a copy-paste block users can drop into their own project's CLAUDE.md:

   ````markdown
   ## Project conventions (read by Claude Code extensions)

   - Ticket key format: `[A-Z]+-\d+`   # adjust to your tracker, e.g. `PROJ-\d+`
   - Integration branch: `main`         # or `develop` if you use Git Flow
   - Tracker: Jira                      # Jira | Linear | GitHub | GitLab
   - Docs folder: `docs/`
   - ADR folder: `docs/adr/`
   ````

6. **Requirements** table: for each plugin, list any prerequisites. For `dev-workflow` v0.1.0, the only requirement is a git repo; `ticket-start` works best if the host Claude Code session has an MCP or CLI connection to your tracker (Jira / Linear / GitHub / GitLab).

7. **Repository structure** section with an ASCII tree (same as Section 3 of this plan).

8. **How it works** section — brief explanation of the three extension types and when each fires:
   - **Auto-invoked skills**: Claude reads their `description` frontmatter and activates them when the situation matches. Used for conventions Claude should apply as it works.
   - **User-invoked skills** (`disable-model-invocation: true`): only run when explicitly requested. Used for on-demand workflows.
   - **Agents**: run in a fresh context and return a concise report. Used for focused analysis that would otherwise bloat the main conversation.

9. **Contributing** section: brief, points to `CONTRIBUTING.md`.

10. **License**: "MIT. See [LICENSE](./LICENSE)."

#### 4.6.5 `CONTRIBUTING.md`

Write in your own words. Cover:

1. How to add a new skill, command-style skill, or agent — file locations, frontmatter fields, and conventions.

2. Frontmatter rules:
   - Skill `description` must describe *when* the skill should activate (trigger conditions), not what it does.
   - Agents must include hard output caps in their system prompt (e.g., "Cap the report at ~400 words").
   - Commands and workflows that take side-effectful actions (git branch creation, remote push, ticket transitions) must ask for explicit confirmation in the conversation before running.

3. Public-safety rules:
   - No project-specific identifiers (ticket keys, internal URLs, company names).
   - No credentials, tokens, or private paths.
   - Illustrative examples use `PROJ-1234`, `example.com`, `acme-corp`.

4. Testing:
   - Local test: `/plugin marketplace add ./` from repo root, then `/plugin install <plugin>@dilee`.
   - Validation: `claude plugin validate .` must pass before PRs are merged.

5. Versioning:
   - SemVer on each plugin.
   - Bump version on behavior changes, not on doc-only or typo fixes.
   - Update both `marketplace.json` and `CHANGELOG.md` (create on first release).

#### 4.6.6 `plugins/dev-workflow/README.md`

Shorter, plugin-specific README. Covers:

- What the plugin does, in one paragraph.
- Table of skills (both) with one-line descriptions.
- The docs-sync agent with a one-line description.
- Link back to the root README for the project parameters contract.

## 5. Core design conventions (apply throughout)

These apply to every file you write. Do not skip any.

1. **Descriptions are trigger specs.** In every `SKILL.md` and agent file, the `description` field must describe *when the thing should activate*, not *what it does*. Claude reads this field to decide whether to invoke, so feature-style descriptions fail to fire.

2. **Never act irreversibly without explicit confirmation.** Any skill or agent that creates branches, pushes commits, transitions tickets, deletes files, or calls external APIs must pause and ask for confirmation in the conversation first. Hardcode this behavior in the skill body itself.

3. **Read per-project parameters from CLAUDE.md / AGENTS.md; don't hardcode them.** Ticket-key regex, integration branch name, docs folder path — all of these are project-specific and must be read from the host project's config file. The extension provides defaults; the project overrides.

4. **Cap agent output.** Every agent must end its system prompt with a word cap ("~400 words"). Agents that dump pages of output defeat their own purpose.

5. **No project-specific identifiers in public code.** No ticket keys other than generic examples (`PROJ-1234`), no company names, no internal URLs, no tracker-specific assumptions.

6. **Paths in manifests start with `./`.** Relative paths must be rooted at the marketplace root and begin with `./`. Never use `../`.

## 6. Verification — must pass before committing

Run these locally after all files are written. Do not commit if any fail.

1. **Directory structure check.** Verify the tree in Section 3 exactly — in particular:
   - `.claude-plugin/` at repo root contains only `marketplace.json`.
   - `plugins/dev-workflow/.claude-plugin/` contains only `plugin.json`.
   - `skills/` and `agents/` live at the plugin root, NOT inside `.claude-plugin/`.

2. **JSON validity.** Run `python3 -m json.tool .claude-plugin/marketplace.json >/dev/null` and the same for `plugins/dev-workflow/.claude-plugin/plugin.json`. Both must exit 0.

3. **Marketplace validation.** Run `claude plugin validate .` from the repo root. Must pass with zero errors. Warnings about kebab-case, descriptions, etc. should be addressed before committing.

4. **Install test.** From the repo root:
   ```
   /plugin marketplace add ./
   /plugin install dev-workflow@dilee
   ```
   Both must succeed.

5. **Trigger test — auto-invoked skill.** In a test repo, start Claude Code and ask it to "create a feature branch for ticket PROJ-1234." The `branch-naming` skill should activate and propose `feature/PROJ-1234`, not a raw or incorrect name.

6. **Trigger test — user-invoked skill.** Type `/ticket-start PROJ-1234` (or ask Claude to invoke `ticket-start`). It should parse the key, attempt to fetch, confirm the branch name, and stop for approval before creating.

7. **Trigger test — agent.** Make a small code change in a test repo (e.g., add a new route handler), then ask Claude to "use the docs-sync agent to check docs." The agent should run, scan the diff, and return a short findings report.

8. **Public-safety scan.** `grep -ri` across the repo for: `WERD`, company/employer name, any real domain, any real ticket ID you've ever used, any internal URL. Must return zero matches.

## 7. What is NOT in v0.1.0

Do not build these. They are future work.

- MCP server plugins (e.g., Bitbucket, Jira MCP server).
- Additional plugins: `backend-essentials`, `frontend-essentials`, `architecture-skills`.
- Hooks (`hooks/hooks.json`).
- CI / GitHub Actions for validation.
- CHANGELOG.md (optional; add on first version bump after 0.1.0).
- Additional skills beyond the two specified.
- Additional agents beyond `docs-sync`.

If you notice something is missing during implementation, note it in a `TODO.md` at the repo root rather than adding it in. Keep v0.1.0 small.

## 8. Authoritative references

If any detail in this plan conflicts with the current Claude Code docs, the docs win. Verify against:

- **Plugin marketplaces**: https://code.claude.com/docs/en/plugin-marketplaces
- **Plugins reference**: https://code.claude.com/docs/en/plugins-reference
- **Skills**: https://code.claude.com/docs/en/skills
- **Subagents**: https://code.claude.com/docs/en/sub-agents

In particular, re-check the `SKILL.md` frontmatter field list and the agent frontmatter field list before you write those files — the spec evolves.

## 9. Style notes

- Use Markdown. No HTML.
- Tables where comparisons matter; prose otherwise.
- Code fences for all code and command examples, with the language specified (` ```bash`, ` ```json`, ` ```yaml`).
- Keep the skill body prose tight — these are instructions for Claude to follow at runtime, not user-facing docs. Shorter is better.
- Keep the README polished — it's public-facing and is the first thing users see.

## 10. Execution order

Build in this exact order. Do not commit or push anything until the very end, and only after explicit user approval.

1. Create the directory skeleton (empty folders per Section 3).
2. Write `LICENSE`, `.gitignore`.
3. Write `.claude-plugin/marketplace.json`.
4. Write `plugins/dev-workflow/.claude-plugin/plugin.json`.
5. Write `plugins/dev-workflow/skills/branch-naming/SKILL.md`.
6. Write `plugins/dev-workflow/skills/ticket-start/SKILL.md`.
7. Write `plugins/dev-workflow/agents/docs-sync.md`.
8. Write `plugins/dev-workflow/README.md`.
9. Write root `CLAUDE.md`.
10. Write `CONTRIBUTING.md`.
11. Write `README.md`.
12. Run every verification step in Section 6. Fix anything that fails.
13. Show me a summary: files created, validation output, and what each skill/agent does. STOP and wait for my approval before any `git add`, `git commit`, or `git push`. Do not create the GitHub repo for me.

## 11. When you're done

Produce a final summary including:

- List of files created with their paths and line counts.
- Output of `claude plugin validate .`.
- A suggested first commit message (Conventional Commits format, e.g. `feat: initial v0.1.0 marketplace with dev-workflow plugin`).
- Any deviations from this plan and why.
- Next steps the user should take (create GitHub repo, push, test install from GitHub).

Do not push or create remote repositories yourself. Stop and hand off.
