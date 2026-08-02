import { spawn } from "node:child_process";

export function runPython(
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cwd = opts?.cwd ?? process.cwd();
  const timeoutMs = opts?.timeoutMs ?? 10 * 60_000;

  return new Promise((resolve, reject) => {
    const child = spawn("python3", args, {
      cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`python timeout after ${timeoutMs}ms: ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function parseLastJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Prefer last JSON object in stdout (scripts often print progress then JSON).
  const start = trimmed.lastIndexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  return JSON.parse(trimmed);
}
