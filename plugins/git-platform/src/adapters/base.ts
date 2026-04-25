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
} from "../types.js";

export abstract class PlatformAdapter {
  constructor(
    protected readonly owner: string,
    protected readonly repo: string,
  ) {}

  abstract repoInfo(): Promise<RepoInfo>;

  abstract prCreate(params: PullRequestCreateParams): Promise<PullRequest>;
  abstract prList(params: PullRequestListParams): Promise<PullRequest[]>;
  abstract prView(params: PullRequestViewParams): Promise<PullRequestDetail>;
  abstract prMerge(params: PullRequestMergeParams): Promise<{ merged: boolean; message: string }>;
  abstract prApprove(params: PullRequestApproveParams): Promise<{ approved: boolean; message: string }>;
  abstract prComment(params: PullRequestCommentParams): Promise<{ id: number; message: string }>;
  abstract prDecline(params: PullRequestDeclineParams): Promise<{ declined: boolean; message: string }>;

  abstract prUpdate(params: PullRequestUpdateParams): Promise<PullRequest>;
  abstract prCommentInline(params: PullRequestInlineCommentParams): Promise<{ id: number | string; message: string }>;
  abstract prCommits(id: number): Promise<PullRequestCommit[]>;
  abstract prFiles(id: number): Promise<PullRequestFile[]>;

  abstract branchList(params: BranchListParams): Promise<BranchInfo[]>;
  abstract branchView(params: BranchViewParams): Promise<BranchInfo>;
  abstract commitView(params: CommitViewParams): Promise<CommitInfo>;
}
