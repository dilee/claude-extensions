import { execFile } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
}

export function exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        maxBuffer: 10 * 1024 * 1024,
        timeout: options.timeoutMs,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        if (error && "code" in error && error.code === "ENOENT") {
          reject(new Error(`Command not found: ${command}. Install it and make sure it's on your PATH.`));
          return;
        }
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: error && typeof error.code === "number" ? error.code : error ? 1 : 0,
        });
      },
    );

    if (options.stdin !== undefined && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
  });
}

export async function execOrThrow(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const result = await exec(command, args, options);
  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
    throw new Error(`${command} ${args.join(" ")}: ${msg}`);
  }
  return result;
}
