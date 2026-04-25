import { PlatformAdapter } from "./base.js";
import { execOrThrow } from "../utils/exec.js";
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

interface GlMr {
  iid: number;
  title: string;
  state: string;
  author: { username: string };
  source_branch: string;
  target_branch: string;
  web_url: string;
  draft?: boolean;
  work_in_progress?: boolean;
  created_at: string;
  updated_at: string;
  description?: string;
  user_notes_count?: number;
  merged_at?: string | null;
}

export class GitLabAdapter extends PlatformAdapter {
  private get project() {
    return encodeURIComponent(`${this.owner}/${this.repo}`);
  }

  /**
   * Call `glab api` with optional JSON body piped via stdin. `glab api` reuses
   * the auth context from `glab auth login`, so we never see a token.
   */
  private async api<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> {
    const args = ["api", path, "--method", method];
    const options: { stdin?: string } = {};
    if (body !== undefined) {
      args.push("--input", "-");
      options.stdin = JSON.stringify(body);
    }
    const result = await execOrThrow("glab", args, options);
    const text = result.stdout.trim();
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  async repoInfo(): Promise<RepoInfo> {
    const data = await this.api<{
      path: string;
      namespace: { full_path: string };
      default_branch: string;
      description: string | null;
      visibility: string;
      web_url: string;
    }>(`projects/${this.project}`);
    return {
      platform: "gitlab",
      owner: data.namespace.full_path,
      repo: data.path,
      defaultBranch: data.default_branch,
      description: data.description ?? "",
      visibility: data.visibility as RepoInfo["visibility"],
      url: data.web_url,
    };
  }

  async prCreate(params: PullRequestCreateParams): Promise<PullRequest> {
    const body: Record<string, unknown> = {
      source_branch: params.sourceBranch,
      title: params.title,
    };
    if (params.targetBranch) body.target_branch = params.targetBranch;
    if (params.description) body.description = params.description;
    if (params.draft) body.title = `Draft: ${params.title}`;
    if (params.labels?.length) body.labels = params.labels.join(",");

    if (params.reviewers?.length) {
      const ids = await Promise.all(params.reviewers.map((u) => this.lookupUserId(u)));
      body.reviewer_ids = ids.filter((x): x is number => x !== null);
    }

    const data = await this.api<GlMr>(`projects/${this.project}/merge_requests`, "POST", body);
    return mapGlMr(data);
  }

  async prList(params: PullRequestListParams): Promise<PullRequest[]> {
    const qs = new URLSearchParams();
    qs.set("per_page", String(params.limit ?? 30));
    if (params.state === "merged") qs.set("state", "merged");
    else if (params.state === "closed") qs.set("state", "closed");
    else if (params.state === "all") qs.set("state", "all");
    else qs.set("state", "opened");
    if (params.author) qs.set("author_username", params.author);

    const data = await this.api<GlMr[]>(`projects/${this.project}/merge_requests?${qs.toString()}`);
    return data.map(mapGlMr);
  }

  async prView(params: PullRequestViewParams): Promise<PullRequestDetail> {
    const data = await this.api<GlMr & { changes_count?: string }>(
      `projects/${this.project}/merge_requests/${params.id}`,
    );
    const detail: PullRequestDetail = {
      ...mapGlMr(data),
      description: data.description ?? "",
      commentCount: data.user_notes_count ?? 0,
    };
    if (params.includeDiff) {
      const changes = await this.api<{ changes?: { diff: string; new_path: string; old_path: string }[] }>(
        `projects/${this.project}/merge_requests/${params.id}/changes`,
      );
      detail.diff = (changes.changes ?? [])
        .map((c) => `--- ${c.old_path}\n+++ ${c.new_path}\n${c.diff}`)
        .join("\n");
    }
    if (params.includeChecks) {
      const pipelines = await this.api<{ id: number; status: string; web_url: string; ref: string }[]>(
        `projects/${this.project}/merge_requests/${params.id}/pipelines`,
      );
      detail.checks = pipelines.slice(0, 5).map((p) => ({
        name: `pipeline #${p.id} (${p.ref})`,
        status: mapGlPipelineStatus(p.status),
        url: p.web_url,
      }));
    }
    return detail;
  }

  async prMerge(params: PullRequestMergeParams): Promise<{ merged: boolean; message: string }> {
    const body: Record<string, unknown> = {};
    if (params.strategy === "squash") body.squash = true;
    if (params.deleteSourceBranch) body.should_remove_source_branch = true;
    await this.api(`projects/${this.project}/merge_requests/${params.id}/merge`, "PUT", body);
    return { merged: true, message: `Merged MR !${params.id}` };
  }

  async prApprove(params: PullRequestApproveParams): Promise<{ approved: boolean; message: string }> {
    await this.api(`projects/${this.project}/merge_requests/${params.id}/approve`, "POST", {});
    if (params.comment) {
      await this.prComment({ id: params.id, body: params.comment });
    }
    return { approved: true, message: `Approved MR !${params.id}` };
  }

  async prComment(params: PullRequestCommentParams): Promise<{ id: number; message: string }> {
    const data = await this.api<{ id: number }>(
      `projects/${this.project}/merge_requests/${params.id}/notes`,
      "POST",
      { body: params.body },
    );
    return { id: data.id, message: `Commented on MR !${params.id}` };
  }

  async prDecline(params: PullRequestDeclineParams): Promise<{ declined: boolean; message: string }> {
    await this.api(`projects/${this.project}/merge_requests/${params.id}`, "PUT", { state_event: "close" });
    return { declined: true, message: `Closed MR !${params.id}` };
  }

  async prUpdate(params: PullRequestUpdateParams): Promise<PullRequest> {
    const body: Record<string, unknown> = {};
    let title = params.title;
    if (params.draft !== undefined && title === undefined) {
      const current = await this.api<GlMr>(`projects/${this.project}/merge_requests/${params.id}`);
      title = current.title;
    }
    if (title !== undefined) {
      const stripped = title.replace(/^(Draft:\s*|WIP:\s*)/i, "");
      body.title = params.draft ? `Draft: ${stripped}` : stripped;
    }
    if (params.description !== undefined) body.description = params.description;
    if (params.targetBranch !== undefined) body.target_branch = params.targetBranch;
    if (params.reviewers !== undefined) {
      const ids = await Promise.all(params.reviewers.map((u) => this.lookupUserId(u)));
      body.reviewer_ids = ids.filter((x): x is number => x !== null);
    }
    const data = await this.api<GlMr>(`projects/${this.project}/merge_requests/${params.id}`, "PUT", body);
    return mapGlMr(data);
  }

  async prCommentInline(params: PullRequestInlineCommentParams): Promise<{ id: string; message: string }> {
    const versions = await this.api<{
      base_commit_sha: string;
      head_commit_sha: string;
      start_commit_sha: string;
    }[]>(`projects/${this.project}/merge_requests/${params.id}/versions`);
    const v = versions[0];
    if (!v) throw new Error(`No diff versions found for MR !${params.id}`);

    const position: Record<string, unknown> = {
      base_sha: v.base_commit_sha,
      head_sha: v.head_commit_sha,
      start_sha: v.start_commit_sha,
      position_type: "text",
      new_path: params.path,
      old_path: params.path,
    };
    if (params.side === "old") position.old_line = params.line;
    else position.new_line = params.line;

    const data = await this.api<{ id: string }>(
      `projects/${this.project}/merge_requests/${params.id}/discussions`,
      "POST",
      { body: params.body, position },
    );
    return { id: data.id, message: `Commented on MR !${params.id} ${params.path}:${params.line}` };
  }

  async prCommits(id: number): Promise<PullRequestCommit[]> {
    const data = await this.api<{
      id: string;
      message: string;
      author_name: string;
      author_email: string;
      authored_date: string;
      web_url: string;
    }[]>(`projects/${this.project}/merge_requests/${id}/commits?per_page=100`);
    return data.map((c) => ({
      sha: c.id,
      message: c.message,
      author: c.author_name,
      authoredAt: c.authored_date,
      url: c.web_url,
    }));
  }

  async prFiles(id: number): Promise<PullRequestFile[]> {
    const data = await this.api<{
      changes?: {
        new_path: string;
        old_path: string;
        new_file?: boolean;
        deleted_file?: boolean;
        renamed_file?: boolean;
      }[];
    }>(`projects/${this.project}/merge_requests/${id}/changes`);
    return (data.changes ?? []).map((c) => ({
      path: c.new_path,
      oldPath: c.renamed_file ? c.old_path : undefined,
      status: c.new_file ? "added" : c.deleted_file ? "removed" : c.renamed_file ? "renamed" : "modified",
    }));
  }

  async branchList(params: BranchListParams): Promise<BranchInfo[]> {
    const qs = new URLSearchParams();
    qs.set("per_page", String(params.limit ?? 30));
    if (params.search) qs.set("search", params.search);
    const data = await this.api<{
      name: string;
      commit: { id: string };
      default: boolean;
      protected: boolean;
      web_url?: string;
    }[]>(`projects/${this.project}/repository/branches?${qs.toString()}`);
    return data.map((b) => ({
      name: b.name,
      sha: b.commit.id,
      isDefault: b.default,
      protected: b.protected,
      url: b.web_url,
    }));
  }

  async branchView(params: BranchViewParams): Promise<BranchInfo> {
    const data = await this.api<{
      name: string;
      commit: { id: string };
      default: boolean;
      protected: boolean;
      web_url?: string;
    }>(`projects/${this.project}/repository/branches/${encodeURIComponent(params.name)}`);
    return {
      name: data.name,
      sha: data.commit.id,
      isDefault: data.default,
      protected: data.protected,
      url: data.web_url,
    };
  }

  async commitView(params: CommitViewParams): Promise<CommitInfo> {
    const data = await this.api<{
      id: string;
      message: string;
      author_name: string;
      authored_date: string;
      committer_name: string;
      committed_date: string;
      web_url: string;
      parent_ids: string[];
    }>(`projects/${this.project}/repository/commits/${params.sha}`);
    return {
      sha: data.id,
      message: data.message,
      author: data.author_name,
      authoredAt: data.authored_date,
      committer: data.committer_name,
      committedAt: data.committed_date,
      url: data.web_url,
      parents: data.parent_ids,
    };
  }

  private async lookupUserId(username: string): Promise<number | null> {
    try {
      const users = await this.api<{ id: number }[]>(`users?username=${encodeURIComponent(username)}`);
      return users[0]?.id ?? null;
    } catch {
      return null;
    }
  }
}

function mapGlMr(mr: GlMr): PullRequest {
  let state: PullRequest["state"] = "open";
  if (mr.merged_at || mr.state === "merged") state = "merged";
  else if (mr.state === "closed") state = "closed";

  return {
    id: mr.iid,
    title: mr.title,
    state,
    author: mr.author.username,
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    url: mr.web_url,
    draft: Boolean(mr.draft ?? mr.work_in_progress),
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
  };
}

function mapGlPipelineStatus(status: string): Check["status"] {
  switch (status) {
    case "success": return "success";
    case "failed": return "failure";
    case "running": case "pending": case "preparing": case "waiting_for_resource": return "in_progress";
    case "canceled": return "cancelled";
    case "skipped": return "skipped";
    default: return "unknown";
  }
}
