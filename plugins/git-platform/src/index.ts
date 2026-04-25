#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { detectPlatform } from "./platform.js";
import { PlatformAdapter } from "./adapters/base.js";
import { GitHubAdapter } from "./adapters/github.js";
import { GitLabAdapter } from "./adapters/gitlab.js";
import { BitbucketAdapter } from "./adapters/bitbucket.js";
import type { Platform } from "./types.js";

function createAdapter(platform: Platform, owner: string, repo: string): PlatformAdapter {
  switch (platform) {
    case "github": return new GitHubAdapter(owner, repo);
    case "gitlab": return new GitLabAdapter(owner, repo);
    case "bitbucket": return new BitbucketAdapter(owner, repo);
  }
}

async function getAdapter(): Promise<PlatformAdapter> {
  const d = await detectPlatform();
  return createAdapter(d.platform, d.owner, d.repo);
}

function asText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

const server = new McpServer({ name: "git-platform", version: "0.1.0" });

server.tool(
  "git_platform_detect",
  "Detect the git platform (GitHub / GitLab / Bitbucket) and repo identifiers from the current git remote. Set GIT_PLATFORM_OVERRIDE for self-hosted instances.",
  {},
  async () => asText(await detectPlatform()),
);

server.tool(
  "repo_info",
  "Get repository metadata — default branch, visibility, description, URL.",
  {},
  async () => asText(await (await getAdapter()).repoInfo()),
);

server.tool(
  "pr_create",
  "Create a pull request (GitLab: merge request). Returns the created PR.",
  {
    title: z.string().describe("PR title."),
    description: z.string().optional().describe("PR body / description."),
    source_branch: z.string().describe("Branch to merge from."),
    target_branch: z.string().optional().describe("Branch to merge into. Defaults to repo's default branch."),
    draft: z.boolean().optional().describe("Create as draft PR."),
    reviewers: z.array(z.string()).optional().describe("Reviewer usernames (GitHub login, GitLab username, Bitbucket UUID)."),
    labels: z.array(z.string()).optional().describe("Labels to apply. Not all platforms support all labels at create time."),
  },
  async (p) => asText(await (await getAdapter()).prCreate({
    title: p.title,
    description: p.description,
    sourceBranch: p.source_branch,
    targetBranch: p.target_branch,
    draft: p.draft,
    reviewers: p.reviewers,
    labels: p.labels,
  })),
);

server.tool(
  "pr_list",
  "List pull requests. Defaults to open.",
  {
    state: z.enum(["open", "merged", "closed", "all"]).optional(),
    author: z.string().optional().describe("Filter by author username."),
    limit: z.number().optional().describe("Max results (default: 30)."),
  },
  async (p) => asText(await (await getAdapter()).prList({
    state: p.state,
    author: p.author,
    limit: p.limit,
  })),
);

server.tool(
  "pr_view",
  "View a pull request. Optionally include diff and/or CI checks.",
  {
    id: z.number().describe("PR number (GitLab: MR iid)."),
    include_diff: z.boolean().optional(),
    include_checks: z.boolean().optional(),
  },
  async (p) => asText(await (await getAdapter()).prView({
    id: p.id,
    includeDiff: p.include_diff,
    includeChecks: p.include_checks,
  })),
);

server.tool(
  "pr_merge",
  "Merge a pull request. Side-effectful — confirm with user before calling.",
  {
    id: z.number(),
    strategy: z.enum(["merge", "squash", "rebase"]).optional().describe("Defaults to 'merge'."),
    delete_source_branch: z.boolean().optional(),
  },
  async (p) => asText(await (await getAdapter()).prMerge({
    id: p.id,
    strategy: p.strategy,
    deleteSourceBranch: p.delete_source_branch,
  })),
);

server.tool(
  "pr_approve",
  "Approve a pull request. Side-effectful — confirm with user before calling.",
  {
    id: z.number(),
    comment: z.string().optional().describe("Optional approval comment."),
  },
  async (p) => asText(await (await getAdapter()).prApprove({ id: p.id, comment: p.comment })),
);

server.tool(
  "pr_comment",
  "Add a comment to a pull request.",
  {
    id: z.number(),
    body: z.string().describe("Comment body. Markdown supported on all three platforms."),
  },
  async (p) => asText(await (await getAdapter()).prComment({ id: p.id, body: p.body })),
);

server.tool(
  "pr_decline",
  "Close / decline a pull request without merging. Side-effectful — confirm with user before calling.",
  {
    id: z.number(),
  },
  async (p) => asText(await (await getAdapter()).prDecline({ id: p.id })),
);

server.tool(
  "pr_update",
  "Edit an existing PR's title, description, target branch, reviewers, or draft state. Only fields you pass are changed.",
  {
    id: z.number(),
    title: z.string().optional(),
    description: z.string().optional(),
    target_branch: z.string().optional().describe("Retarget the PR to a different base branch."),
    reviewers: z.array(z.string()).optional().describe("Replace reviewer set (GitHub login, GitLab username, Bitbucket UUID)."),
    draft: z.boolean().optional().describe("True converts to draft; false marks ready for review."),
  },
  async (p) => asText(await (await getAdapter()).prUpdate({
    id: p.id,
    title: p.title,
    description: p.description,
    targetBranch: p.target_branch,
    reviewers: p.reviewers,
    draft: p.draft,
  })),
);

server.tool(
  "pr_comment_inline",
  "Add an inline review comment on a specific file/line of a PR's diff.",
  {
    id: z.number(),
    body: z.string().describe("Comment body. Markdown supported."),
    path: z.string().describe("File path as it appears in the diff."),
    line: z.number().describe("1-based line number in the file."),
    side: z.enum(["old", "new"]).optional().describe("Which side of the diff. Defaults to 'new'."),
  },
  async (p) => asText(await (await getAdapter()).prCommentInline({
    id: p.id,
    body: p.body,
    path: p.path,
    line: p.line,
    side: p.side,
  })),
);

server.tool(
  "pr_commits",
  "List the commits included in a pull request.",
  {
    id: z.number(),
  },
  async (p) => asText(await (await getAdapter()).prCommits(p.id)),
);

server.tool(
  "pr_files",
  "List files changed in a pull request, with status (added/modified/removed/renamed) and line counts.",
  {
    id: z.number(),
  },
  async (p) => asText(await (await getAdapter()).prFiles(p.id)),
);

server.tool(
  "branch_list",
  "List branches in the current repo.",
  {
    limit: z.number().optional().describe("Max results (default: 30)."),
    search: z.string().optional().describe("Substring filter on branch name."),
  },
  async (p) => asText(await (await getAdapter()).branchList({ limit: p.limit, search: p.search })),
);

server.tool(
  "branch_view",
  "Get info about a single branch — head SHA, default-branch flag, protection status.",
  {
    name: z.string().describe("Branch name."),
  },
  async (p) => asText(await (await getAdapter()).branchView({ name: p.name })),
);

server.tool(
  "commit_view",
  "Get info about a single commit by SHA.",
  {
    sha: z.string().describe("Commit SHA (full or short)."),
  },
  async (p) => asText(await (await getAdapter()).commitView({ sha: p.sha })),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("git-platform MCP fatal error:", err);
  process.exit(1);
});
