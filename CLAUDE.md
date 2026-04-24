# CLAUDE.md — instructions for Claude when editing this repo

This repository is a public Claude Code plugin marketplace maintained by dilee. It ships one or more plugins that extend Claude Code with skills and agents, installable via `/plugin marketplace add dilee/claude-extensions`. When editing this repo, your audience is two groups at once: marketplace consumers (who install these plugins into their own projects) and future maintainers (who will add more plugins here).

For the full conceptual tour and maintenance recipes (adding skills / agents / MCP tools / plugins, versioning, validation), see [MAINTAINING.md](./MAINTAINING.md).

## Structure

```
claude-extensions/
├── .claude-plugin/
│   └── marketplace.json
├── .gitignore
├── CLAUDE.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── plugins/
    ├── dev-workflow/
    │   ├── .claude-plugin/
    │   │   └── plugin.json
    │   ├── README.md
    │   ├── skills/
    │   │   ├── branch-naming/
    │   │   │   └── SKILL.md
    │   │   └── ticket-start/
    │   │       └── SKILL.md
    │   └── agents/
    │       └── docs-sync.md
    └── git-platform/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── .mcp.json
        ├── README.md
        ├── package.json
        ├── tsconfig.json
        └── src/           # TypeScript MCP server source
            ├── index.ts
            ├── platform.ts
            ├── types.ts
            ├── adapters/
            └── utils/
```

Component directories (`skills/`, `agents/`) live at each plugin's root, never inside `.claude-plugin/`. For MCP-server plugins, `.mcp.json` lives at the plugin root and `src/` holds the server implementation. Only `plugin.json` goes in `.claude-plugin/`.

## Editing conventions

- Bump versions in `marketplace.json` per SemVer. For now, version lives in the marketplace entry (not in `plugin.json`) — if both are set, `plugin.json` silently wins.
- Skill `description` frontmatter is load-bearing. It is the text Claude reads to decide whether to activate a skill, so write it as a trigger spec ("TRIGGER when…", "Use when the user is about to…"), not as a feature description. Feature-style descriptions fail to fire.
- Never hardcode project-specific identifiers (ticket keys, company names, internal tool names, private URLs) — this repo is public. Illustrative examples use `PROJ-1234`, `example.com`, `acme-corp`.
- Do not commit credentials, tokens, or internal URLs. Do a `grep -ri` scan before every push.
- Do not `git add` or `git commit` without an explicit user request.
- Do not `git push` without explicit user permission.

## Testing locally

From the repo root:

```
/plugin marketplace add ./
/plugin install dev-workflow@dilee
```

Validate the manifest structure with:

```bash
claude plugin validate .
```

Both install and validate must succeed before pushing. Run a trigger test as well — spin up a test repo, try to create a feature branch, and confirm the `branch-naming` skill actually fires.
