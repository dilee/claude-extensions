---
description: Pre-PR quality gate. Review the branch's changes for best-practice violations, patterns that deviate from the rest of the codebase, and reusability gaps; fix only the valid findings; strip noise comments while keeping doc comments; then open or update the PR. TRIGGER only when the user types `/pre-pr` or explicitly says "do a pre-PR review", "quality review then open the PR", "review, clean up, and raise the PR". Invoke explicitly; do not auto-trigger. MUTATES files and performs git/PR actions, but only after confirmation.
disable-model-invocation: true
---

# Pre-PR review

Run the pre-PR quality gate for: $ARGUMENTS

This skill is the last stop before a pull request. You've written and **tested** the code; this turns "it works" into "it's ready for review" in one motion: a codebase-aware quality pass → fix only the valid findings → a comment cleanup → the PR itself. It assumes the change is already tested and does not write the feature for you.

It's the active counterpart to `docs-sync` (which only *reports* doc gaps): this one reviews, edits, and ships. The review is Claude's own, grounded in how the surrounding code is already written — with an optional second opinion from CodeRabbit / Codex / Gemini if you have those plugins installed.

This skill is user-invoked only. Run it when the user types `/pre-pr [...]` or explicitly asks to "do a pre-PR review and open the PR".

## Arguments

`$ARGUMENTS` is optional and parsed loosely:

- A **base branch** name → diff against that instead of the auto-detected base.
- A **scope token** — `committed` / `uncommitted` / `all` (default `all`: the whole branch delta plus uncommitted work).
- A **focus hint** — freeform text like "focus on the API layer" narrows what the review weights most. It never narrows what gets *checked* for correctness, only what's emphasised.

## Steps

### Step 1 — Preflight & scope

```bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Not inside a git repository."; exit 1; }
BASE=""
for b in develop main master; do
  if git show-ref --verify --quiet "refs/remotes/origin/$b"; then BASE="origin/$b"; break; fi
done
# Files in scope: committed-vs-base plus uncommitted working-tree changes.
{ git diff --name-only "${BASE:-HEAD}"...HEAD; git diff --name-only HEAD; } | sort -u
```

Override `BASE` if the user passed a branch. Read the project's `CLAUDE.md` / `AGENTS.md` for the integration branch, docs folder, and **test command** (see the project-parameters block in the plugin README). If the diff against base is empty, say so and stop — there is nothing to review.

### Step 2 — Codebase-aware quality review (Claude)

Review the in-scope changes against four lenses. The second lens is why this is *codebase-aware*: before flagging a deviation, read neighbouring and sibling files to learn how this repo actually does the thing — don't apply generic preferences.

- **Consistency** — naming, file/module structure, error-handling style, layering, framework idioms. Flag what diverges *drastically* from the established pattern, not minor stylistic taste.
- **Reusability / DRY** — logic that reimplements an existing shared helper/abstraction, or duplicated logic that should be extracted.
- **Best practices** — language/framework correctness, error handling, resource cleanup, input validation, obvious edge cases, dead code.
- **Anything missed** — missing tests for new branches, security-sensitive spots, leftover debug code, `TODO`s shipped by accident.

Compile the findings with `file:line`, the lens, a severity, a one-line proposed fix, and a **validity judgment**: `valid` (clear, should fix), `subjective` (style/opinion), or `uncertain` (might be a false positive / needs your input). Present a brief list; the full triage happens in Step 4.

### Step 3 — Optional second opinion

After your own findings, offer to augment them with an external reviewer — **only if one is installed**, and **only on the user's say-so**:

- **CodeRabbit** — the `/coderabbit-review` skill (read-only).
- **Codex** — the `codex-review` agent.
- **Gemini** — the `gemini-review` agent.

If the user wants one, run it, then merge its findings into the list, de-duplicating against your own. This step is non-blocking: if no such plugin is installed or the user declines, note it in one line and continue with your own review.

### Step 4 — Triage, then fix only the valid issues

Present the consolidated findings grouped by severity, each tagged `valid` / `subjective` / `uncertain`. Recommend the **valid** set as the fix list. List the subjective and uncertain ones, but do **not** fix them unless the user opts in.

Show the planned edits, then apply the valid set with `Edit` / `Write` as a batch **after a single confirmation**. Don't ask per-file unless an edit is genuinely ambiguous.

### Step 5 — Comment hygiene

Scoped to comments this change **added or modified** — never touch pre-existing comments elsewhere in the files, and never reformat the whole file.

- **Remove**: comments that restate what the code plainly does, narration of obvious steps, commented-out code, decorative banners, and scaffolding/`TODO` noise we added.
- **Keep, always**: comments that explain **why** (rationale, workarounds, invariants, perf/security caveats, issue links) and license/header blocks.
- **Doc comments are compulsory**: never strip a doc comment (the language's doc convention — JSDoc/TSDoc, Python docstrings, Javadoc/KDoc, Go doc comments, rustdoc, etc.), and **add** one to any new exported/public declaration this change introduced that lacks one.

When unsure whether a comment carries non-obvious intent, keep it.

### Step 6 — Re-verify after fixing

Applying fixes after the code was tested can regress it, so re-run the project's tests/build before raising the PR. Use the **test command** declared in `CLAUDE.md` / `AGENTS.md` if present; otherwise ask the user for it rather than guessing a heavy suite. If something fails, fix forward only when the cause is obvious and in-scope; otherwise stop and report. **Cap at two fix→test passes** — don't loop.

### Step 7 — Clear scaffolding

If this work created spec, plan, or design docs purely as scaffolding for the implementation, clear them before the PR — delete them, or move them to the project's archive location if it keeps one (e.g. an `archive/` folder) — so they don't ship with the feature and the codebase stays lean. Keep anything that's genuinely part of the deliverable (ADRs, user-facing docs). Do this before the commit so it lands in the same change, and confirm before deleting.

### Step 8 — Open or update the PR

1. Offer to run the `docs-sync` agent first, so any doc gaps ride in the same PR (offer; don't force).
2. **Commit** the changes: stage them, propose a commit message, and commit **only after confirmation**.
3. Determine PR state for the current branch — exists → **update**; none → **create**. Prefer the `git-platform` MCP if installed (GitHub / GitLab / Bitbucket); otherwise fall back to `gh` / `glab`.
4. Propose the PR title and body — what changed, the quality pass performed, and the test status — then **push and create/update the PR only after confirmation**.
5. Report the PR URL.

## Hard rules

- Every action with external side effects — commit, push, PR create/update — requires explicit in-conversation confirmation. Propose, then wait.
- **Fix only valid findings.** Never auto-apply subjective or uncertain ones without the user's go-ahead.
- **Never strip doc comments.** Comment hygiene is scoped to what this change introduced — never reformat the whole file's or codebase's comments.
- If the diff against base is empty, say so and stop.
- The second opinion is opt-in and non-blocking; if the reviewer plugin/CLI isn't installed, note it and continue with Claude's review.
- Never fabricate findings. If the review is clean, say so and move straight to comment hygiene and the PR.
- Re-run tests after fixing where a command is known, and surface failures honestly — never open a PR claiming a state you didn't verify.
- **Loop cap = 2** on both review→fix and fix→test passes.

## References

- `docs-sync` agent (same plugin) — the pre-PR doc-gap scan; offer it before finalising the PR.
- `branch-naming` skill (same plugin) — already governs the branch this PR comes from.
- `coderabbit-review` / `codex-review` / `gemini-review` (sibling plugins, if installed) — the optional second opinion in Step 3.
- `git-platform` MCP (if installed) — PR create/update across GitHub / GitLab / Bitbucket; otherwise `gh` / `glab`.
- Host project `CLAUDE.md` / `AGENTS.md` — integration branch, docs folder, and test command.
