import type {
  ManifestTypeRef,
  NodeDefinitionContribution,
  PortContribution,
  PropertyContribution,
} from "@visulith/plugin-api";

export type { ManifestTypeRef, NodeDefinitionContribution, PortContribution, PropertyContribution };

export const ADAPTER_SCHEMA_VERSION = "0.1";

/** Hand-authored corrections to best-effort generated nodes. */
export interface AdapterOverride {
  definitionId: string;
  exclude?: boolean;
  displayName?: string;
  category?: string;
  description?: string;
  inputs?: PortContribution[];
  outputs?: PortContribution[];
  properties?: PropertyContribution[];
  capabilities?: string[];
}

export interface AdapterFile {
  schemaVersion: "0.1";
  overrides: AdapterOverride[];
}

export interface InspectionDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface InspectionResult {
  packageName?: string;
  version?: string;
  /** Relative paths of the .d.ts files that were inspected. */
  sourceFiles: string[];
  nodes: NodeDefinitionContribution[];
  diagnostics: InspectionDiagnostic[];
  /** Always true: .d.ts parsing is intentionally best-effort and partial. */
  partial: true;
}

export interface InspectOptions {
  /** Defaults to `<packageDir>/adapters/nodes.json`. */
  adapterPath?: string;
  /** Safety limit for large packages. Defaults to 50. */
  maxFiles?: number;
}
