/**
 * Honest capability declarations for the TypeScript language support plugin.
 * Status values match @visulith/plugin-api's CapabilityStatus union.
 */

export type CapabilityStatus =
  | "Available"
  | "Partial"
  | "Experimental"
  | "Unavailable"
  | "RequiresExternalTool";

export interface CapabilityDeclaration {
  enabled: boolean;
  status: CapabilityStatus;
  note: string;
}

export const TYPESCRIPT_CAPABILITIES = {
  sourceEditing: { enabled: true, status: "Available", note: "Edit TypeScript sources as plain text." },
  syntaxHighlighting: { enabled: true, status: "Available", note: "Static token highlighting; no semantic model required." },
  completion: { enabled: true, status: "Available", note: "Basic completions from local declarations and keywords." },
  diagnostics: { enabled: true, status: "Available", note: "Syntax and type diagnostics require a local tsc toolchain." },
  formatting: { enabled: true, status: "Available", note: "Deterministic formatting rules; external formatters are not invoked." },
  navigation: { enabled: true, status: "Available", note: "Go-to-definition is limited to local symbols." },
  refactoring: { enabled: true, status: "Partial", note: "Only simple local renames are supported." },
  projectDetection: { enabled: true, status: "Partial", note: "Detects tsconfig.json and package.json layouts heuristically." },
  dependencyManagement: {
    enabled: false,
    status: "RequiresExternalTool",
    note: "This package never modifies package.json or installs dependencies.",
  },
  build: { enabled: true, status: "Available", note: "Emits build commands for tsc; execution is a host concern." },
  run: { enabled: true, status: "Available", note: "Emits run commands for Node.js; execution is a host concern." },
  debug: { enabled: false, status: "Unavailable", note: "No debug adapter is provided." },
  irImport: { enabled: false, status: "Unavailable", note: "TypeScript sources are not parsed back into Visulith IR." },
  irExport: { enabled: true, status: "Experimental", note: "Only the engine's supported structured-flow subset lowers to IR." },
  visualNodes: { enabled: true, status: "Experimental", note: "Declarative node metadata only; no plugin code is loaded." },
} as const satisfies Record<string, CapabilityDeclaration>;

export type TypeScriptCapability = keyof typeof TYPESCRIPT_CAPABILITIES;

export const ALL_TYPESCRIPT_CAPABILITIES: readonly TypeScriptCapability[] = Object.keys(
  TYPESCRIPT_CAPABILITIES,
) as TypeScriptCapability[];

export const ENABLED_CAPABILITIES: readonly TypeScriptCapability[] = ALL_TYPESCRIPT_CAPABILITIES.filter(
  (key) => TYPESCRIPT_CAPABILITIES[key].enabled,
);

export const DISABLED_CAPABILITIES: readonly TypeScriptCapability[] = ALL_TYPESCRIPT_CAPABILITIES.filter(
  (key) => !TYPESCRIPT_CAPABILITIES[key].enabled,
);

export function capabilityStatus(capability: TypeScriptCapability): CapabilityStatus {
  return TYPESCRIPT_CAPABILITIES[capability].status;
}

export type ToolchainId = "node" | "tsc" | "npm";

export interface ToolchainHint {
  id: ToolchainId;
  displayName: string;
  detectionCommand: string;
  versionPattern: string;
  requiredFor: readonly TypeScriptCapability[];
  note: string;
}

/** Detection hints only; this package never spawns these commands. */
export const TOOLCHAIN_HINTS: readonly ToolchainHint[] = [
  {
    id: "node",
    displayName: "Node.js",
    detectionCommand: "node --version",
    versionPattern: "^v\\d+\\.\\d+\\.\\d+",
    requiredFor: ["run"],
    note: "Runtime for compiled JavaScript.",
  },
  {
    id: "tsc",
    displayName: "TypeScript compiler",
    detectionCommand: "tsc --version",
    versionPattern: "^Version \\d+\\.\\d+",
    requiredFor: ["build", "diagnostics"],
    note: "Compiler used by build and diagnostics.",
  },
  {
    id: "npm",
    displayName: "npm",
    detectionCommand: "npm --version",
    versionPattern: "^\\d+\\.\\d+\\.\\d+",
    requiredFor: ["dependencyManagement"],
    note: "External package manager; dependencyManagement remains disabled.",
  },
];

export interface DetectedToolchain {
  id: ToolchainId;
  present: boolean;
  hint: string;
}

/** Deterministic detection from a caller-supplied list of available command names. */
export function detectToolchain(availableCommands: readonly string[]): DetectedToolchain[] {
  const available = new Set(availableCommands.map((value) => value.toLowerCase()));
  return TOOLCHAIN_HINTS.map((tool) => {
    const present = available.has(tool.id);
    return {
      id: tool.id,
      present,
      hint: `${tool.detectionCommand} (${present ? "available" : "not detected"})`,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
