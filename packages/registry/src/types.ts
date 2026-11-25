/** Metadata shape for the local registry and the publish HTTP service. */

export const REGISTRY_INDEX_SCHEMA_VERSION = "0.1";

export interface RegistryChecksum {
  algorithm: "sha256";
  value: string;
}

export interface RegistryPublisher {
  id: string;
  name: string;
  url?: string;
}

export interface RegistryCompatibility {
  hostApi: string;
  engine?: string;
  node?: string;
}

export interface RegistryPermission {
  kind: string;
  reason: string;
  scope?: string;
}

export interface RegistryProvenance {
  repository?: string;
  commit?: string;
  builtAt?: string;
  signed?: boolean;
  notes?: string;
}

export interface RegistryPackageMetadata {
  id: string;
  version: string;
  name?: string;
  description?: string;
  categories?: string[];
  /** Path relative to the directory containing index.json. */
  artifact: string;
  checksum: RegistryChecksum;
  publisher: RegistryPublisher;
  license: string;
  compatibility: RegistryCompatibility;
  permissions: RegistryPermission[];
  provenance: RegistryProvenance;
}

export interface RegistryIndex {
  schemaVersion: "0.1";
  packages: RegistryPackageMetadata[];
}

export interface RegistryDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface InstallResult {
  ok: boolean;
  installedPath?: string;
  diagnostics: RegistryDiagnostic[];
}
