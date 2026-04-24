import { execSync } from "node:child_process";

export interface BasicAuth {
  username: string;
  token: string;
}

/**
 * Resolve a credential from `$NAME`, falling back to `$NAME_CMD` (a shell
 * command whose stdout becomes the value). The _CMD form lets users plug in
 * any secret-manager CLI — `op read`, `pass show`, `aws secretsmanager …` —
 * without the plugin taking a dependency on any specific one.
 */
export function resolveCredential(name: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.trim()) return direct.trim();

  const cmd = process.env[`${name}_CMD`];
  if (cmd) {
    try {
      return execSync(cmd, { encoding: "utf-8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to resolve ${name} via ${name}_CMD=${cmd}: ${msg}`);
    }
  }

  return undefined;
}

export function getBitbucketAuth(): BasicAuth {
  const username = resolveCredential("BITBUCKET_USERNAME");
  const token = resolveCredential("BITBUCKET_TOKEN");

  if (!username || !token) {
    throw new Error(
      [
        "Bitbucket authentication requires BITBUCKET_USERNAME and BITBUCKET_TOKEN.",
        "Set them directly, or use the _CMD variants to pull from a secret manager —",
        `  e.g. BITBUCKET_TOKEN_CMD="op read op://Personal/Bitbucket/token"`,
        "",
        "BITBUCKET_USERNAME: your Bitbucket username or Atlassian email.",
        "BITBUCKET_TOKEN:    an API token from https://bitbucket.org/account/settings/api-tokens/",
        "                    (App passwords are deprecated; use API tokens.)",
      ].join("\n"),
    );
  }

  return { username, token };
}

export function basicAuthHeader(auth: BasicAuth): string {
  const encoded = Buffer.from(`${auth.username}:${auth.token}`).toString("base64");
  return `Basic ${encoded}`;
}
