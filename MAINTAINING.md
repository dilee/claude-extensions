# Maintaining this repo

A tour of how the marketplace works, what each extension type is, and the recipes for adding or changing things without breaking the contract. Read this once when you come back to the repo after a while; use the recipes as a reference during a change.

## Contents

- [Mental model](#mental-model)
- [Extension types used here](#extension-types-used-here)
- [The one concept to internalise: descriptions are trigger specs](#the-one-concept-to-internalise-descriptions-are-trigger-specs)
- [Runtime walk-through for each type](#runtime-walk-through-for-each-type)
- [Repo rules — non-negotiable](#repo-rules--non-negotiable)
- [Maintenance recipes](#maintenance-recipes)
- [Validation loop](#validation-loop)
- [Local testing](#local-testing)
- [Gotchas specific to this repo](#gotchas-specific-to-this-repo)
- [File-by-file cheat sheet](#file-by-file-cheat-sheet)

## Mental model

```
marketplace  →  plugins  →  extensions
```

- **A marketplace** is a GitHub repo Claude Code can load via `/plugin marketplace add`. It's just a directory with `.claude-plugin/marketplace.json` at the root that lists one or more plugins.
- **A plugin** is a unit of install. Users opt in with `/plugin install <name>@<marketplace>`. It lives at `plugins/<name>/` and has its own `.claude-plugin/plugin.json`.
- **An extension** is a piece of behaviour a plugin ships. Claude Code supports several types; this repo uses three.

At runtime Claude Code reads the manifests, then:

- loads skill descriptions into context so the model can decide when to activate them,
- surfaces user-invoked skills (slash commands) so users can invoke them by name,
- starts MCP servers declared in `.mcp.json` files so their tools become callable.

## Extension types used here

| Type | Example | Location | Fires when |
|---|---|---|---|
| **Auto-invoked skill** | `branch-naming` | `plugins/dev-workflow/skills/branch-naming/SKILL.md` | Claude reads the `description` frontmatter and activates when the situation matches. |
| **User-invoked skill** | `ticket-start` | `plugins/dev-workflow/skills/ticket-start/SKILL.md` | Same file shape, plus `disable-model-invocation: true` — only fires when the user asks by name or types `/ticket-start`. |
| **Agent** | `docs-sync` | `plugins/dev-workflow/agents/docs-sync.md` | User asks Claude to invoke it. Runs in a **fresh context**, returns a short report. |
| **MCP server** | `git-platform` | `plugins/git-platform/` (TypeScript) | Declared in `.mcp.json`. Claude Code starts the server process and treats its registered tools like first-class functions. |

### Why all four exist

They solve different problems:

- **Auto-invoked skills** are *conventions* — rules Claude should apply proactively while working. Example: "use these branch prefixes." The model needs the rule present whenever it might matter.
- **User-invoked skills** are *workflows* — discrete multi-step procedures the user triggers explicitly. Example: "start a ticket." No need to compete for attention; the user asks.
- **Agents** are for *focused analysis that would bloat the main conversation*. Example: scanning a diff for doc gaps. Fresh context + word cap keeps the main thread lean.
- **MCP servers** are for *real code* — network calls, credentials, state. Example: hitting the GitHub API. Typed tools give schema enforcement, proper error handling, and keep tokens out of the LLM context.

## The one concept to internalise: descriptions are trigger specs

This is the single most load-bearing rule in the repo.

**Bad** (feature description — Claude has no idea when to activate):

```yaml
description: Helps with git branch naming conventions.
```

**Good** (trigger spec — tells Claude exactly when to fire):

```yaml
description: TRIGGER when the user or assistant is about to run `git checkout -b`, `git switch -c`, `git branch <name>`, or is proposing a branch name.
```

Claude reads the `description` field of every loaded skill and agent to decide whether the current moment calls for it. Feature-style descriptions just sit there. Trigger-style descriptions fire.

Same principle applies to agent `description` frontmatter.

## Runtime walk-through for each type

### Auto-invoked skill (`branch-naming`)

1. User types: "let me branch off to fix X."
2. Claude's context includes `branch-naming`'s description. The phrase "branch off" matches the trigger spec.
3. The skill body gets surfaced. It contains the rules (prefix table, hard rules, violation steps).
4. Claude follows the rules while responding — proposes the corrected name, asks for confirmation, runs the command.

Frontmatter:

```yaml
---
description: Enforce git branch naming conventions. TRIGGER when…
---
```

No `disable-model-invocation` key → auto-invoked.

### User-invoked skill (`ticket-start`)

1. User types `/ticket-start PROJ-123`.
2. `$ARGUMENTS` (the text after the slash-command) gets substituted into the skill body wherever the template uses it.
3. Claude follows the body like a recipe: parse → fetch → map type → confirm → create.

Frontmatter:

```yaml
---
description: …
disable-model-invocation: true
---
```

That flag is what makes it user-invoked-only.

### Agent (`docs-sync`)

1. User: "use the docs-sync agent."
2. Claude spawns a subagent with its own fresh context and only the tools listed in the agent frontmatter (`Read, Grep, Glob, Bash`).
3. The agent runs checks per its system prompt (the agent file body *is* its system prompt), caps its output at ~400 words, and returns to the main conversation.
4. You see the report; the main conversation's context stays lean.

Frontmatter:

```yaml
---
name: docs-sync
description: Use this agent when…
tools: Read, Grep, Glob, Bash
---
```

### MCP server (`git-platform`)

1. Claude Code starts the server at session start per `.mcp.json` — `npx tsx src/index.ts`.
2. Server registers 9 tools with zod schemas via `server.tool(...)`.
3. Claude sees those tools, calls them with typed params, gets JSON back.
4. Platform detection runs per call via `git remote get-url origin`.

The `.mcp.json`:

```json
{
  "mcpServers": {
    "git-platform": {
      "command": "npx",
      "args": ["tsx", "${CLAUDE_PLUGIN_ROOT}/src/index.ts"],
      "env": { "BITBUCKET_USERNAME": "", "BITBUCKET_TOKEN": "" }
    }
  }
}
```

`${CLAUDE_PLUGIN_ROOT}` is the plugin's install directory — set by Claude Code when it launches the server.

## Repo rules — non-negotiable

These are in `AGENTS.md` for a reason. Break them and the marketplace stops working (or leaks something it shouldn't).

| Rule | Why |
|---|---|
| Component dirs (`skills/`, `agents/`) at plugin root — **never** inside `.claude-plugin/` | Only `plugin.json` belongs in `.claude-plugin/`. Putting skills there means Claude Code won't find them. |
| `version` lives in `marketplace.json`, **not** in `plugin.json` | If both are set, `plugin.json` silently wins — a bug magnet. Pick one. |
| Skill descriptions are trigger specs, not feature blurbs | See above. Feature descriptions don't fire. |
| Agents cap their own output (`~400 words`) | Agents without caps defeat their own purpose — they pollute the main context just like running the analysis inline would. |
| Side-effectful actions require explicit in-conversation confirmation | Branch creation, pushes, PR merges, ticket transitions. Never silent. |
| No project-specific identifiers in public files | No employer name, real ticket keys, internal URLs. Illustrative examples use `PROJ-1234`, `example.com`, `acme-corp`. |
| Paths in manifests start with `./` | Relative, rooted at marketplace root. Never `../`. |
| Don't `git add`, `git commit`, or `git push` without explicit user request | Stated in `AGENTS.md`. |

## Maintenance recipes

### Add a new auto-invoked skill

1. Create `plugins/<plugin>/skills/<skill-name>/SKILL.md` — note: uppercase `SKILL.md`, inside a folder named after the skill (not a flat file).
2. Frontmatter:

   ```yaml
   ---
   description: TRIGGER when … Stops … before …
   ---
   ```

   Write the description as a trigger spec.

3. Body: opening paragraph stating purpose, rules, hard constraints, what-to-do-on-violation steps.
4. Bump the plugin's version in `.claude-plugin/marketplace.json`.
5. Test: `/plugin marketplace add ./` from repo root, then `/plugin install <plugin>@dilee` in a scratch project. Trigger the situation and confirm the skill activates.

### Add a new user-invoked skill

Same as above, plus `disable-model-invocation: true` in the frontmatter. Body can reference `$ARGUMENTS` for the text passed in by the user.

### Add a new agent

1. Create `plugins/<plugin>/agents/<agent-name>.md` (flat file, not a folder).
2. Frontmatter:

   ```yaml
   ---
   name: <agent-name>
   description: Use this agent when …
   tools: Read, Grep, Glob, Bash   # only what the agent needs
   ---
   ```

3. Body is the system prompt. Structure: opening single-job statement → what you check → how to run → output format → **word cap** at the end.
4. Bump plugin version.

### Add a new MCP tool to `git-platform`

Multi-file change. Walk through:

1. **Types** (`src/types.ts`) — add param and return types for the new tool.
2. **Abstract method** (`src/adapters/base.ts`) — declare it on the abstract class:

   ```ts
   abstract newTool(params: NewToolParams): Promise<NewToolResult>;
   ```

3. **Concrete implementations** — add the method in all three adapters:
   - `src/adapters/github.ts` — typically via `gh` CLI.
   - `src/adapters/gitlab.ts` — via `glab api --input -` (never `--raw-field` for JSON bodies).
   - `src/adapters/bitbucket.ts` — direct REST via `this.api(...)`.
4. **Register the tool** (`src/index.ts`) — `server.tool(name, description, zodSchema, handler)`.
5. **Type-check** — `cd plugins/git-platform && npx tsc --noEmit`.
6. **Bump** the plugin version in `marketplace.json`.
7. **Update** the plugin README with the new tool row and an example prompt.

### Add a whole new plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`. Copy shape from an existing plugin.
2. Add skill / agent / MCP-server files as needed (use recipes above).
3. Add the plugin's entry to the top-level `marketplace.json` `plugins` array. Include `name`, `source: "./plugins/<name>"`, `description`, `version`, `keywords`, `license`.
4. Add a README at `plugins/<name>/README.md`.
5. Update root `README.md` plugin table.
6. Update `AGENTS.md` tree diagram.
7. Validate: `claude plugin validate .`.

### Bumping versions

SemVer. Rules of thumb:

- **Patch** (0.1.0 → 0.1.1) — bug fixes, doc-only changes to existing behaviour (if they don't change how Claude invokes things).
- **Minor** (0.1.0 → 0.2.0) — new skills, new agents, new MCP tools, new trigger conditions.
- **Major** (0.1.0 → 1.0.0) — breaking changes to existing skill names, tool signatures, or trigger specs.

Always bump in `marketplace.json` (not `plugin.json`).

### Removing a skill / agent / tool

1. Delete the source file(s).
2. Update plugin README (remove the row in its table).
3. Update root README quick-reference.
4. Bump the plugin version — at least minor, major if anyone might rely on the removed behaviour.

## Validation loop

Run these before every push:

```bash
# JSON structure
python3 -m json.tool .claude-plugin/marketplace.json >/dev/null

# Marketplace / plugin manifest validation
claude plugin validate .

# TypeScript (only if you touched git-platform)
cd plugins/git-platform && npx tsc --noEmit

# Public-safety: no employer / internal / credential strings
grep -rnEi 'YOUR-EMPLOYER|your-internal-host|real-ticket-pattern' \
  --exclude-dir=.git --exclude-dir=docs --exclude-dir=node_modules .
```

All four must pass.

## Local testing

From the repo root, inside Claude Code:

```
/plugin marketplace add ./
/plugin install <plugin>@dilee
```

Then in a scratch git repo, run the real trigger:

- **Skill**: do the thing that should fire it and confirm the skill activates.
- **Agent**: ask Claude to invoke it and check the output.
- **MCP tool**: ask Claude to do something that maps to the tool, confirm the tool call.

If a skill doesn't fire when expected, the description is almost always the problem — rewrite it as a trigger spec.

## Gotchas specific to this repo

These bit during the build; keep them in mind:

1. **`$schema` in `marketplace.json` fails the current validator.** It's been removed. If you copy examples from older docs that include it, strip it out.
2. **GitLab `glab api` body passing.** Never use `--raw-field "=<json>"` — that creates an empty-named field. Always use `--input -` with stdin (see `src/adapters/gitlab.ts`'s `api()` helper).
3. **Bitbucket reviewers need UUIDs.** Not usernames. Bitbucket Cloud's public API doesn't expose a username → UUID lookup; the user has to provide the UUID.
4. **Bitbucket Data Center is a different API.** The adapter talks to `api.bitbucket.org` — Cloud only. Don't assume the code works against a self-hosted Bitbucket.
5. **The `$NAME_CMD` pattern for secrets.** When adding auth for a new provider, mirror `getBitbucketAuth()` — resolve from `$NAME` first, fall back to `$NAME_CMD` (a shell command). Don't hardcode any specific secret-manager CLI.
6. **`node_modules/` ends up at the plugin root.** The root `.gitignore` already ignores it — keep that rule intact when editing `.gitignore`.
7. **Platform detection re-runs per MCP call.** Don't cache detection globally — users can `cd` between repos inside a session. Caching belongs at the MCP-call boundary, not the process.

## File-by-file cheat sheet

| File | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace manifest. Lists every plugin with versions and descriptions. This is what `/plugin marketplace add` reads. |
| `plugins/<p>/.claude-plugin/plugin.json` | Plugin-specific manifest. Name, description, author, license, keywords. **No `version` here.** |
| `plugins/<p>/skills/<s>/SKILL.md` | One skill. Frontmatter + body. |
| `plugins/<p>/agents/<a>.md` | One agent. Frontmatter + system-prompt body. |
| `plugins/<p>/.mcp.json` | MCP-server plugins only. How Claude Code launches the server. |
| `plugins/<p>/README.md` | User-facing docs for the plugin. |
| `AGENTS.md` (root) | Canonical instructions for AI coding agents editing this repo. The rules live here. |
| `CLAUDE.md` (root) | Pointer to `AGENTS.md`. Exists so Claude Code's native loader picks up the rules. |
| `CONTRIBUTING.md` | Rules for external contributors. |
| `MAINTAINING.md` | This file. |
| `README.md` (root) | Public entry point. |

---

The pattern is: each piece has its manifest, its body, and a narrow invocation contract; the rules in `AGENTS.md` keep future edits consistent; the validators catch the rest.
