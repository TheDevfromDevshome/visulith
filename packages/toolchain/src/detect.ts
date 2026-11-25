import { spawnSync } from "node:child_process";
import { warning, type Diagnostic } from "@visulith/engine";

export interface ToolInfo {
  id: string;
  executable: string;
  available: boolean;
  version?: string;
  path?: string;
  diagnostics: Diagnostic[];
}

/** Detect tools instead of assuming they are installed. Never downloads anything. */
export function detectTool(id: string, executable: string, versionArguments = ["--version"]): ToolInfo {
  try {
    const result = spawnSync(executable, versionArguments, { encoding: "utf8", timeout: 10_000 });
    if (result.error !== undefined || result.status !== 0) {
      return {
        id,
        executable,
        available: false,
        diagnostics: [
          warning(
            "TOOLCHAIN_TOOL_MISSING",
            `Tool "${id}" (${executable}) is not available.`,
            undefined,
            "Install the tool or select another toolchain.",
          ),
        ],
      };
    }
    const version = `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0];
    return { id, executable, available: true, ...(version ? { version } : {}), diagnostics: [] };
  } catch (cause) {
    return {
      id,
      executable,
      available: false,
      diagnostics: [warning("TOOLCHAIN_DETECTION_FAILED", `Detection of "${id}" failed: ${String(cause)}`)],
    };
  }
}

export function detectNodeToolchain(): ToolInfo[] {
  return [detectTool("node", "node"), detectTool("npm", "npm", ["--version"]), detectTool("tsc", "tsc")];
}
