/** Capability names are stable strings; manifests must not invent new ones in the MVP. */

export const CAPABILITIES = {
  sourceEditing: "sourceEditing",
  syntaxHighlighting: "syntaxHighlighting",
  completion: "completion",
  diagnostics: "diagnostics",
  formatting: "formatting",
  navigation: "navigation",
  refactoring: "refactoring",
  projectDetection: "projectDetection",
  dependencyManagement: "dependencyManagement",
  build: "build",
  run: "run",
  debug: "debug",
  irImport: "irImport",
  irExport: "irExport",
  visualNodes: "visualNodes",
} as const;

export type PluginCapability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES: readonly PluginCapability[] = Object.values(CAPABILITIES);

export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === "string" && ALL_CAPABILITIES.includes(value as PluginCapability);
}

/** Implementation status used by declarative language/tool descriptions. */
export type CapabilityStatus =
  | "Available"
  | "Partial"
  | "Experimental"
  | "Unavailable"
  | "RequiresExternalTool";

export const ALL_CAPABILITY_STATUSES: readonly CapabilityStatus[] = [
  "Available",
  "Partial",
  "Experimental",
  "Unavailable",
  "RequiresExternalTool",
];
