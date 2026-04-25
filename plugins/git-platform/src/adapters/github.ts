import { PlatformAdapter } from "./base.js";
import { exec, execOrThrow } from "../utils/exec.js";
import type {
  RepoInfo,
  PullRequest,
  PullRequestDetail,
  PullRequestCreateParams,
  PullRequestListParams,
  PullRequestViewParams,
  PullRequestMergeParams,
  PullRequestApproveParams,
  PullRequestCommentParams,
  PullRequestDeclineParams,
  PullRequestUpdateParams,
  PullRequestInlineCommentParams,
  PullRequestCommit,
  PullRequestFile,
  BranchInfo,
  BranchListParams,
  BranchViewParams,
  CommitInfo,
  CommitViewParams,
  Check,
} from "../types.js";

interface GhPr {
  number: number;
  title: string;
  state: string;
  isDraft?: boolean;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  body?: string;
  comments?: unknown[];
  mergedAt?: string | null;
}

export class GitHubAdapter extends PlatformAdapter {
  private get slug() {
    return `${this.owner}/${this.repo}`;
  }

  private async gh(args: string[], stdin?: string): Promise<string> {
    const result = await execOrThrow("gh", args, stdin !== undefined ? { stdin } : {});
    return result.stdout;
  }

  async repoInfo(): Promise<RepoInfo> {
    const data = JSON.parse(
      await this.gh([
        "repo", "view", this.slug,
        "--json", "name,owner,defaultBranchRef,description,visibility,url",
      ]),
    ) as {
      name: string;
      owner: { login: string };
      defaultBranchRef: { name: string } | null;
      description: string | null;
      visibility: string;
      url: string;
    };
    return {
      platform: "github",
      owner: data.owner.login,
      repo: data.name,
      defaultBranch: data.defaultBranchRef?.name ?? "main",
      description: data.description ?? "",
      visibility: data.visibility.toLowerCase() as RepoInfo["visibility"],
      url: data.url,
    };
  }

  async prCreate(params: PullRequestCreateParams): Promise<PullRequest> {
    const args = [
      "pr", "create",
      "--repo", this.slug,
      "--title", params.title,
      "--body", params.description ?? "",
      "--head", params.sourceBranch,
    ];
    if (params.targetBranch) args.push("--base", params.targetBranch);
    if (params.draft) args.push("--draft");
    if (params.reviewers?.length) args.push("--reviewer", params.reviewers.join(","));
    if (params.labels?.length) args.push("--label", params.labels.join(","));

    const out = (await this.gh(args)).trim();
    const urlMatch = out.match(/https:\/\/\S+\/pull\/(\d+)/);
    if (!urlMatch) {
      throw new Error(`gh pr create succeeded but did not return a URL:\n${out}`);
    }
    return this.prView({ id: Number(urlMatch[1]) });
  }

  async prList(params: PullRequestListParams): Promise<PullRequest[]> {
    const args = [
      "pr", "list",
      "--repo", this.slug,
      "--limit", String(params.limit ?? 30),
      "--json", "number,title,state,isDraft,author,headRefName,baseRefName,url,createdAt,updatedAt,mergedAt",
    ];
    if (params.state === "merged") args.push("--state", "merged");
    else if (params.state === "closed") args.push("--state", "closed");
    else if (params.state === "all") args.push("--state", "all");
    else args.push("--state", "open");
    if (params.author) args.push("--author", params.author);

    const data = JSON.parse(await this.gh(args)) as GhPr[];
    return data.map(mapGhPr);
  }

  async prView(params: PullRequestViewParams): Promise<PullRequestDetail> {
    const fields = [
      "number", "title", "state", "isDraft", "author", "headRefName", "baseRefName",
      "url", "createdAt", "updatedAt", "body", "comments", "mergedAt",
    ];
    const data = JSON.parse(
      await this.gh(["pr", "view", String(params.id), "--repo", this.slug, "--json", fields.join(",")]),
    ) as GhPr;

    const detail: PullRequestDetail = {
      ...mapGhPr(data),
      description: data.body ?? "",
      commentCount: data.comments?.length ?? 0,
    };

    if (params.includeDiff) {
      detail.diff = await this.gh(["pr", "diff", String(params.id), "--repo", this.slug]);
    }
    if (params.includeChecks) {
      detail.checks = await this.prChecks(params.id);
    }
    return detail;
  }

  private async prChecks(id: number): Promise<Check[]> {
    const result = await exec("gh", [
      "pr", "checks", String(id), "--repo", this.slug, "--json", "name,state,link",
    ]);
    if (result.exitCode !== 0 && !result.stdout.trim()) {
      return [];
    }
    try {
      const rows = JSON.parse(result.stdout) as { name: string; state: string; link?: string }[];
      return rows.map((r) => ({ name: r.name, status: mapGhCheckState(r.state), url: r.link }));
    } catch {
      return [];
    }
  }

  async prMerge(params: PullRequestMergeParams): Promise<{ merged: boolean; message: string }> {
    const args = ["pr", "merge", String(params.id), "--repo", this.slug];
    switch (params.strategy ?? "merge") {
      case "squash": args.push("--squash"); break;
      case "rebase": args.push("--rebase"); break;
      default: args.push("--merge"); break;
    }
    if (params.deleteSourceBranch) args.push("--delete-branch");
    const out = await this.gh(args);
    return { merged: true, message: out.trim() || `Merged PR #${params.id}` };
  }

  async prApprove(params: PullRequestApproveParams): Promise<{ approved: boolean; message: string }> {
    const args = ["pr", "review", String(params.id), "--repo", this.slug, "--approve"];
    if (params.comment) args.push("--body", params.comment);
    const out = await this.gh(args);
    return { approved: true, message: out.trim() || `Approved PR #${params.id}` };
  }

  async prComment(params: PullRequestCommentParams): Promise<{ id: number; message: string }> {
    const out = await this.gh(
      ["pr", "comment", String(params.id), "--repo", this.slug, "--body-file", "-"],
      params.body,
    );
    return { id: params.id, message: out.trim() || `Commented on PR #${params.id}` };
  }

  async prDecline(params: PullRequestDeclineParams): Promise<{ declined: boolean; message: string }> {
    const out = await this.gh(["pr", "close", String(params.id), "--repo", this.slug]);
    return { declined: true, message: out.trim() || `Closed PR #${params.id}` };
  }

  async prUpdate(params: PullRequestUpdateParams): Promise<PullRequest> {
    const args = ["pr", "edit", String(params.id), "--repo", this.slug];
    if (params.title !== undefined) args.push("--title", params.title);
    if (params.description !== undefined) args.push("--body", params.description);
    if (params.targetBranch !== undefined) args.push("--base", params.targetBranch);
    if (params.reviewers !== undefined) {
      args.push("--add-reviewer", params.reviewers.join(","));
    }
    await this.gh(args);
    if (params.draft === true) {
      await this.gh(["pr", "ready", String(params.id), "--repo", this.slug, "--undo"]);
    } else if (params.draft === false) {
      await this.gh(["pr", "ready", String(params.id), "--repo", this.slug]);
    }
    return this.prView({ id: params.id });
  }

  async prCommentInline(params: PullRequestInlineCommentParams): Promise<{ id: number; message: string }> {
    const head = JSON.parse(
      await this.gh(["pr", "view", String(params.id), "--repo", this.slug, "--json", "headRefOid"]),
    ) as { headRefOid: string };

    const body: Record<string, unknown> = {
      body: params.body,
      path: params.path,
      line: params.line,
      side: params.side === "old" ? "LEFT" : "RIGHT",
      commit_id: head.headRefOid,
    };

    const out = await this.gh(
      [
        "api",
        "--method", "POST",
        `repos/${this.slug}/pulls/${params.id}/comments`,
        "--input", "-",
      ],
      JSON.stringify(body),
    );
    const data = JSON.parse(out) as { id: number };
    return { id: data.id, message: `Commented on PR #${params.id} ${params.path}:${params.line}` };
  }

  async prCommits(id: number): Promise<PullRequestCommit[]> {
    const out = await this.gh([
      "api", `repos/${this.slug}/pulls/${id}/commits`, "--paginate",
    ]);
    const data = JSON.parse(out) as {
      sha: string;
      commit: { message: string; author: { name: string; date: string } };
      author: { login?: string } | null;
      html_url: string;
    }[];
    return data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author.name,
      authoredAt: c.commit.author.date,
      url: c.html_url,
    }));
  }

  async prFiles(id: number): Promise<PullRequestFile[]> {
    const out = await this.gh([
      "api", `repos/${this.slug}/pulls/${id}/files`, "--paginate",
    ]);
    const data = JSON.parse(out) as {
      filename: string;
      previous_filename?: string;
      status: string;
      additions: number;
      deletions: number;
    }[];
    return data.map((f) => ({
      path: f.filename,
      oldPath: f.previous_filename,
      status: mapGhFileStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
    }));
  }

  async branchList(params: BranchListParams): Promise<BranchInfo[]> {
    const args = [
      "api", `repos/${this.slug}/branches`,
      "--paginate",
      "-f", `per_page=${params.limit ?? 30}`,
    ];
    const data = JSON.parse(await this.gh(args)) as {
      name: string;
      commit: { sha: string };
      protected: boolean;
    }[];
    const repo = await this.repoInfo();
    let branches = data.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      isDefault: b.name === repo.defaultBranch,
      protected: b.protected,
    }));
    if (params.search) {
      const q = params.search.toLowerCase();
      branches = branches.filter((b) => b.name.toLowerCase().includes(q));
    }
    if (params.limit) branches = branches.slice(0, params.limit);
    return branches;
  }

  async branchView(params: BranchViewParams): Promise<BranchInfo> {
    const out = await this.gh([
      "api", `repos/${this.slug}/branches/${encodeURIComponent(params.name)}`,
    ]);
    const data = JSON.parse(out) as {
      name: string;
      commit: { sha: string };
      protected: boolean;
    };
    const repo = await this.repoInfo();
    return {
      name: data.name,
      sha: data.commit.sha,
      isDefault: data.name === repo.defaultBranch,
      protected: data.protected,
    };
  }

  async commitView(params: CommitViewParams): Promise<CommitInfo> {
    const out = await this.gh(["api", `repos/${this.slug}/commits/${params.sha}`]);
    const data = JSON.parse(out) as {
      sha: string;
      commit: {
        message: string;
        author: { name: string; date: string };
        committer: { name: string; date: string };
      };
      author: { login?: string } | null;
      committer: { login?: string } | null;
      html_url: string;
      parents: { sha: string }[];
    };
    return {
      sha: data.sha,
      message: data.commit.message,
      author: data.author?.login ?? data.commit.author.name,
      authoredAt: data.commit.author.date,
      committer: data.committer?.login ?? data.commit.committer.name,
      committedAt: data.commit.committer.date,
      url: data.html_url,
      parents: data.parents.map((p) => p.sha),
    };
  }
}

function mapGhPr(pr: GhPr): PullRequest {
  const state = (pr.mergedAt ? "merged" : pr.state.toLowerCase()) as PullRequest["state"];
  return {
    id: pr.number,
    title: pr.title,
    state: state === "open" || state === "merged" || state === "closed" ? state : "closed",
    author: pr.author.login,
    sourceBranch: pr.headRefName,
    targetBranch: pr.baseRefName,
    url: pr.url,
    draft: Boolean(pr.isDraft),
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
  };
}

function mapGhFileStatus(s: string): PullRequestFile["status"] {
  switch (s) {
    case "added": return "added";
    case "removed": return "removed";
    case "modified": case "changed": return "modified";
    case "renamed": return "renamed";
    default: return "unknown";
  }
}

function mapGhCheckState(state: string): Check["status"] {
  switch (state.toUpperCase()) {
    case "SUCCESS": return "success";
    case "FAILURE": case "ERROR": case "TIMED_OUT": return "failure";
    case "IN_PROGRESS": case "QUEUED": case "PENDING": return "in_progress";
    case "CANCELLED": return "cancelled";
    case "SKIPPED": case "NEUTRAL": return "skipped";
    default: return "unknown";
  }
}
