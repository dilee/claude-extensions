export type Platform = "github" | "gitlab" | "bitbucket";

export interface PlatformDetection {
  platform: Platform;
  owner: string;
  repo: string;
  remoteUrl: string;
  host: string;
}

export interface RepoInfo {
  platform: Platform;
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  visibility: "public" | "private" | "internal";
  url: string;
}

export type PrState = "open" | "merged" | "closed";

export interface PullRequest {
  id: number;
  title: string;
  state: PrState;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  url: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequestDetail extends PullRequest {
  description: string;
  commentCount: number;
  diff?: string;
  checks?: Check[];
}

export interface Check {
  name: string;
  status: "queued" | "in_progress" | "success" | "failure" | "cancelled" | "skipped" | "unknown";
  url?: string;
}

export interface PullRequestCreateParams {
  title: string;
  description?: string;
  sourceBranch: string;
  targetBranch?: string;
  draft?: boolean;
  reviewers?: string[];
  labels?: string[];
}

export interface PullRequestListParams {
  state?: PrState | "all";
  author?: string;
  limit?: number;
}

export interface PullRequestViewParams {
  id: number;
  includeDiff?: boolean;
  includeChecks?: boolean;
}

export interface PullRequestMergeParams {
  id: number;
  strategy?: "merge" | "squash" | "rebase";
  deleteSourceBranch?: boolean;
}

export interface PullRequestApproveParams {
  id: number;
  comment?: string;
}

export interface PullRequestCommentParams {
  id: number;
  body: string;
}

export interface PullRequestDeclineParams {
  id: number;
}

export interface PullRequestUpdateParams {
  id: number;
  title?: string;
  description?: string;
  targetBranch?: string;
  reviewers?: string[];
  draft?: boolean;
}

export interface PullRequestInlineCommentParams {
  id: number;
  body: string;
  path: string;
  line: number;
  side?: "old" | "new";
}

export interface PullRequestCommit {
  sha: string;
  message: string;
  author: string;
  authoredAt: string;
  url?: string;
}

export interface PullRequestFile {
  path: string;
  oldPath?: string;
  status: "added" | "modified" | "removed" | "renamed" | "unknown";
  additions?: number;
  deletions?: number;
}

export interface BranchInfo {
  name: string;
  sha: string;
  isDefault?: boolean;
  protected?: boolean;
  url?: string;
}

export interface BranchListParams {
  limit?: number;
  search?: string;
}

export interface BranchViewParams {
  name: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  authoredAt: string;
  committer?: string;
  committedAt?: string;
  url?: string;
  parents?: string[];
}

export interface CommitViewParams {
  sha: string;
}
