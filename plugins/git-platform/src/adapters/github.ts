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
