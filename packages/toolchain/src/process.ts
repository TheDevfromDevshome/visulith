import { spawn, type ChildProcess } from "node:child_process";
import { error, type Diagnostic } from "@visulith/engine";

export interface ProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  environment?: Record<string, string>;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  cancelled: boolean;
  diagnostics: Diagnostic[];
}

/** Structured process execution with timeout and cancellation. Raw output is preserved. */
export function runProcess(request: ProcessRequest, signal?: AbortSignal): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(request.executable, request.args, {
        cwd: request.cwd,
        env: { ...process.env, ...(request.environment ?? {}) },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (cause) {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: "",
        cancelled: false,
        diagnostics: [error("PROCESS_SPAWN_FAILED", `Cannot start "${request.executable}": ${String(cause)}`)],
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let settled = false;
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const finish = (exitCode: number, diagnostics: Diagnostic[] = []): void => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, stdout, stderr, cancelled, diagnostics });
    };

    const timeout = request.timeoutMs === undefined ? undefined : setTimeout(() => {
      cancelled = true;
      child.kill();
      finish(124, [error("PROCESS_TIMEOUT", `Process exceeded ${request.timeoutMs} ms and was cancelled.`)]);
    }, request.timeoutMs);
    timeout?.unref();

    const onAbort = (): void => {
      cancelled = true;
      child.kill();
      finish(130, [error("PROCESS_CANCELLED", "Process was cancelled by the user.")]);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (cause) => {
      finish(-1, [error("PROCESS_FAILED", `Process failed: ${cause.message}`)]);
    });
    child.on("close", (code) => {
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      finish(code ?? -1);
    });
  });
}
