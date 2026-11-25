export type Severity = "error" | "warning" | "info";

/** Stable location information. All identifiers are optional so diagnostics can point at the closest known element. */
export interface SourceRef {
  graphId?: string;
  nodeId?: string;
  portId?: string;
  connectionId?: string;
}

export interface Diagnostic {
  /** Stable machine-readable code, e.g. GRAPH_DUPLICATE_NODE_ID. */
  code: string;
  severity: Severity;
  message: string;
  origin?: SourceRef;
  remediation?: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  diagnostics: Diagnostic[];
}

export function diagnostic(
  severity: Severity,
  code: string,
  message: string,
  origin?: SourceRef,
  remediation?: string,
): Diagnostic {
  return {
    code,
    severity,
    message,
    ...(origin ? { origin } : {}),
    ...(remediation ? { remediation } : {}),
  };
}

export function error(code: string, message: string, origin?: SourceRef, remediation?: string): Diagnostic {
  return diagnostic("error", code, message, origin, remediation);
}

export function warning(code: string, message: string, origin?: SourceRef, remediation?: string): Diagnostic {
  return diagnostic("warning", code, message, origin, remediation);
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === "error");
}

export function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value, diagnostics: [] };
}

export function fail<T>(diagnostics: Diagnostic[]): ValidationResult<T> {
  return { ok: false, diagnostics };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatDiagnostic(entry: Diagnostic): string {
  const location = entry.origin
    ? ` [${Object.entries(entry.origin)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(", ")}]`
    : "";
  const remediation = entry.remediation ? ` Remediation: ${entry.remediation}` : "";
  return `${entry.severity.toUpperCase()} ${entry.code}: ${entry.message}${location}${remediation}`;
}
