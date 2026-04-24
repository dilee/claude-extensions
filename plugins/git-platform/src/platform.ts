import { execOrThrow } from "./utils/exec.js";
import type { Platform, PlatformDetection } from "./types.js";

interface HostRule {
  platform: Platform;
  hostPattern: RegExp;
}

const HOST_RULES: HostRule[] = [
  { platform: "github", hostPattern: /(^|\.)github\.com$/i },
  { platform: "gitlab", hostPattern: /(^|\.)gitlab\.(com|io)$/i },
  { platform: "bitbucket", hostPattern: /(^|\.)bitbucket\.(org|io)$/i },
];

/**
 * Parse an origin URL into {host, owner, repo}. Handles both SSH shorthand
 * (`git@host:owner/repo.git`) and https (`https://host/owner/repo.git`).
 * Supports GitLab subgroups by treating everything before the final `/` as
 * the owner path.
 */
export function parseRemote(remoteUrl: string): { host: string; owner: string; repo: string } | null {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");

  // SSH: git@host:owner/repo  or  ssh://git@host/owner/repo
  const sshMatch = trimmed.match(/^(?:ssh:\/\/)?[^@]+@([^:/]+)[:/](.+)$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const path = sshMatch[2];
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash <= 0) return null;
    return { host, owner: path.slice(0, lastSlash), repo: path.slice(lastSlash + 1) };
  }

  // HTTPS: https://host/owner/repo  or  https://user@host/owner/repo
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/^\/+/, "");
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash <= 0) return null;
    return { host: u.host, owner: path.slice(0, lastSlash), repo: path.slice(lastSlash + 1) };
  } catch {
    return null;
  }
}

function classifyHost(host: string): Platform | null {
  for (const rule of HOST_RULES) {
    if (rule.hostPattern.test(host)) return rule.platform;
  }
  return null;
}

/**
 * Detect the platform and repo identifiers. Resolution order:
 *   1. `$GIT_PLATFORM_OVERRIDE` — set this for self-hosted GHE / GitLab / Bitbucket Server.
 *   2. Match the remote host against the built-in host patterns.
 *   3. Fail with a clear error listing what was tried.
 */
export async function detectPlatform(cwd?: string): Promise<PlatformDetection> {
  const { stdout } = await execOrThrow("git", ["remote", "get-url", "origin"], { cwd });
  const remoteUrl = stdout.trim();
  if (!remoteUrl) {
    throw new Error("No git remote 'origin' found. Run this inside a repo that has an origin remote.");
  }

  const parsed = parseRemote(remoteUrl);
  if (!parsed) {
    throw new Error(`Could not parse remote URL: ${remoteUrl}`);
  }

  const override = process.env.GIT_PLATFORM_OVERRIDE?.toLowerCase() as Platform | undefined;
  const platform = override && (["github", "gitlab", "bitbucket"] as const).includes(override)
    ? override
    : classifyHost(parsed.host);

  if (!platform) {
    throw new Error(
      `Could not detect platform from host '${parsed.host}'. ` +
        `For self-hosted instances, set GIT_PLATFORM_OVERRIDE=github|gitlab|bitbucket.`,
    );
  }

  return { platform, owner: parsed.owner, repo: parsed.repo, remoteUrl, host: parsed.host };
}
