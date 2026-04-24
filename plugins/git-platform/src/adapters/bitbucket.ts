import { PlatformAdapter } from "./base.js";
import { getBitbucketAuth, basicAuthHeader } from "../utils/auth.js";
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
} from "../types.js";

const BB_API = "https://api.bitbucket.org/2.0";

interface BbRepo {
  slug: string;
  owner: { username?: string; display_name: string };
  mainbranch?: { name: string };
  description?: string;
  is_private: boolean;
  links: { html: { href: string } };
}

interface BbPr {
  id: number;
  title: string;
  state: string;
  author: { username?: string; display_name: string; nickname?: string };
  source: { branch: { name: string } };
  destination: { branch: { name: string } };
  links: { html: { href: string } };
  draft?: boolean;
  created_on: string;
  updated_on: string;
  description?: string;
  comment_count?: number;
}

export class BitbucketAdapter extends PlatformAdapter {
  private get slug() {
    return `${this.owner}/${this.repo}`;
  }

  private authHeader(): string {
    return basicAuthHeader(getBitbucketAuth());
  }

  private async api<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
    const url = `${BB_API}/${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bitbucket ${method} ${path} → ${res.status} ${res.statusText}\n${text}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status === 204) return undefined as unknown as T;
    if (contentType.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  async repoInfo(): Promise<RepoInfo> {
    const data = await this.api<BbRepo>(`repositories/${this.slug}`);
    return {
      platform: "bitbucket",
      owner: data.owner.username ?? data.owner.display_name,
      repo: data.slug,
      defaultBranch: data.mainbranch?.name ?? "main",
      description: data.description ?? "",
      visibility: data.is_private ? "private" : "public",
      url: data.links.html.href,
    };
  }

  async prCreate(params: PullRequestCreateParams): Promise<PullRequest> {
    const body: Record<string, unknown> = {
      title: params.title,
      source: { branch: { name: params.sourceBranch } },
    };
    if (params.description) body.description = params.description;
    if (params.targetBranch) body.destination = { branch: { name: params.targetBranch } };
    if (params.reviewers?.length) {
      body.reviewers = params.reviewers.map((uuid) => ({ uuid }));
    }
    if (params.draft) body.draft = true;

    const data = await this.api<BbPr>(`repositories/${this.slug}/pullrequests`, "POST", body);
    return mapBbPr(data);
  }

  async prList(params: PullRequestListParams): Promise<PullRequest[]> {
    let stateFilter = "OPEN";
    if (params.state === "merged") stateFilter = "MERGED";
    else if (params.state === "closed") stateFilter = "DECLINED";
    else if (params.state === "all") stateFilter = "";

    const qs = new URLSearchParams();
    qs.set("pagelen", String(params.limit ?? 30));
    if (stateFilter) qs.set("state", stateFilter);

    const data = await this.api<{ values: BbPr[] }>(`repositories/${this.slug}/pullrequests?${qs.toString()}`);
    let prs = data.values.map(mapBbPr);
    if (params.author) {
      prs = prs.filter((p) => p.author === params.author);
    }
    return prs;
  }

  async prView(params: PullRequestViewParams): Promise<PullRequestDetail> {
    const data = await this.api<BbPr>(`repositories/${this.slug}/pullrequests/${params.id}`);
    const detail: PullRequestDetail = {
      ...mapBbPr(data),
      description: data.description ?? "",
      commentCount: data.comment_count ?? 0,
    };
    if (params.includeDiff) {
      detail.diff = await this.api<string>(`repositories/${this.slug}/pullrequests/${params.id}/diff`);
    }
    if (params.includeChecks) {
      // Bitbucket exposes build status per commit. v0.1.0 stops short of
      // wiring that up — /statuses requires a commit hash walk; will land
      // with pipeline_status in v0.2.0.
      detail.checks = [];
    }
    return detail;
  }

  async prMerge(params: PullRequestMergeParams): Promise<{ merged: boolean; message: string }> {
    const mergeStrategyMap = { merge: "merge_commit", squash: "squash", rebase: "fast_forward" } as const;
    const body: Record<string, unknown> = {
      merge_strategy: mergeStrategyMap[params.strategy ?? "merge"],
    };
    if (params.deleteSourceBranch) body.close_source_branch = true;
    await this.api(`repositories/${this.slug}/pullrequests/${params.id}/merge`, "POST", body);
    return { merged: true, message: `Merged PR #${params.id}` };
  }

  async prApprove(params: PullRequestApproveParams): Promise<{ approved: boolean; message: string }> {
    await this.api(`repositories/${this.slug}/pullrequests/${params.id}/approve`, "POST", {});
    if (params.comment) {
      await this.prComment({ id: params.id, body: params.comment });
    }
    return { approved: true, message: `Approved PR #${params.id}` };
  }

  async prComment(params: PullRequestCommentParams): Promise<{ id: number; message: string }> {
    const data = await this.api<{ id: number }>(
      `repositories/${this.slug}/pullrequests/${params.id}/comments`,
      "POST",
      { content: { raw: params.body } },
    );
    return { id: data.id, message: `Commented on PR #${params.id}` };
  }

  async prDecline(params: PullRequestDeclineParams): Promise<{ declined: boolean; message: string }> {
    await this.api(`repositories/${this.slug}/pullrequests/${params.id}/decline`, "POST", {});
    return { declined: true, message: `Declined PR #${params.id}` };
  }
}

function mapBbPr(pr: BbPr): PullRequest {
  let state: PullRequest["state"] = "open";
  const s = pr.state.toUpperCase();
  if (s === "MERGED") state = "merged";
  else if (s === "DECLINED" || s === "SUPERSEDED") state = "closed";

  return {
    id: pr.id,
    title: pr.title,
    state,
    author: pr.author.username ?? pr.author.nickname ?? pr.author.display_name,
    sourceBranch: pr.source.branch.name,
    targetBranch: pr.destination.branch.name,
    url: pr.links.html.href,
    draft: Boolean(pr.draft),
    createdAt: pr.created_on,
    updatedAt: pr.updated_on,
  };
}
