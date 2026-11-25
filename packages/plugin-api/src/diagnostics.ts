/** Structured diagnostics for untrusted plugin manifests and host compatibility checks. */

export type PluginSeverity = "error" | "warning" | "info";

export interface PluginDiagnostic {
  /** Stable machine-readable code, e.g. PLUGIN_SCHEMA_UNSUPPORTED. */
  code: string;
  severity: PluginSeverity;
  message: string;
  /** Filesystem path of the manifest that produced the diagnostic, when known. */
  path?: string;
  remediation?: string;
}

export interface PluginValidationResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: PluginDiagnostic[];
}

export function diagnostic(
  severity: PluginSeverity,
  code: string,
  message: string,
  path?: string,
  remediation?: string,
): PluginDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path ? { path } : {}),
    ...(remediation ? { remediation } : {}),
  };
}

export function error(code: string, message: string, path?: string, remediation?: string): PluginDiagnostic {
  return diagnostic("error", code, message, path, remediation);
}

export function warning(code: string, message: string, path?: string, remediation?: string): PluginDiagnostic {
  return diagnostic("warning", code, message, path, remediation);
}

export function info(code: string, message: string, path?: string): PluginDiagnostic {
  return diagnostic("info", code, message, path);
}

export function withPath(entry: PluginDiagnostic, path: string): PluginDiagnostic {
  return { ...entry, path };
}

export function ok<T>(value: T, diagnostics: PluginDiagnostic[] = []): PluginValidationResult<T> {
  return { ok: true, value, diagnostics };
}

export function fail<T>(diagnostics: PluginDiagnostic[]): PluginValidationResult<T> {
  return { ok: false, diagnostics };
}

export function hasErrors(diagnostics: readonly PluginDiagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === "error");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
