# Contributing

Thanks for the interest. This repo is a Claude Code plugin marketplace, so contributions land as skills, agents, or whole new plugins. Keep changes small, public-safe, and testable.

## Adding a skill, command-style skill, or agent

Each plugin lives at `plugins/<plugin-name>/` and has this layout:

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
└── agents/
    └── <agent-name>.md
```

Put `skills/` and `agents/` at the plugin root — not inside `.claude-plugin/`. Only `plugin.json` goes in `.claude-plugin/`.

### Skill frontmatter

```yaml
---
description: <trigger spec — see rules below>
# optional:
disable-model-invocation: true   # set for user-invoked only skills
---
```

### Agent frontmatter

```yaml
---
name: <agent-name>
description: <when to invoke the agent>
tools: Read, Grep, Glob, Bash   # only the tools the agent actually needs
---
```

## Frontmatter rules

- A skill's `description` must describe **when** the skill should activate (trigger conditions, e.g. "TRIGGER when the user is about to run X") — not what the skill does. Feature-style descriptions fail to fire.
- Every agent must end its system prompt with a hard output cap (e.g. "Cap the report at ~400 words"). Agents that dump pages of output defeat their own purpose.
- Any skill or agent that takes side-effectful actions (creating branches, pushing to remote, transitioning tickets, deleting files, calling external APIs) must ask for explicit user confirmation in the conversation before running. Encode this as a hard rule in the skill / agent body.

## Public-safety rules

This repo is public. Do not commit:

- Project-specific identifiers — real ticket keys, internal tool names, company names.
- Credentials, tokens, API keys, or private URLs.
- Internal host names or non-public infrastructure paths.

Illustrative examples use `PROJ-1234`, `example.com`, `acme-corp`. Run `grep -ri` across the repo before pushing.

## Testing

Local test from the repo root:

```
/plugin marketplace add ./
/plugin install <plugin-name>@dilee
```

Validation before any PR is merged:

```bash
claude plugin validate .
```

Both must succeed. For skills and agents, include a real trigger test — actually invoke the skill or agent in a scratch project and verify it fires and behaves as documented.

## Versioning

- SemVer on each plugin.
- Bump the version on any behaviour change — new skill, new agent, changed skill trigger, changed agent prompt.
- Don't bump for doc-only or typo fixes.
- Update `marketplace.json` on every bump. Create `CHANGELOG.md` on the first post-0.1.0 release and keep it current from then on.
