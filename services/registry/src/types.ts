/** Wire and storage shapes for the minimal registry HTTP service. */

export const REGISTRY_SERVICE_SCHEMA_VERSION = "0.1";

export interface ServiceChecksum {
  algorithm: "sha256";
  value: string;
}

export interface ServicePublisher {
  id: string;
  name: string;
  url?: string;
}

export interface ServiceCompatibility {
  hostApi: string;
  engine?: string;
  node?: string;
}

export interface ServicePermission {
  kind: string;
  reason: string;
  scope?: string;
}

export interface ServiceProvenance {
  repository?: string;
  commit?: string;
  builtAt?: string;
  signed?: boolean;
  notes?: string;
}

export interface ServicePackage {
  id: string;
  version: string;
  name?: string;
  description?: string;
  categories?: string[];
  artifact: string;
  checksum: ServiceChecksum;
  publisher: ServicePublisher;
  license: string;
  compatibility: ServiceCompatibility;
  permissions: ServicePermission[];
  provenance: ServiceProvenance;
}

export interface RegistryFile {
  schemaVersion: "0.1";
  packages: ServicePackage[];
}

export interface PublishRequest {
  metadata: ServicePackage;
  /** Artifact path relative to the directory containing the registry JSON file. */
  artifactPath: string;
}

export interface ErrorPayload {
  error: {
    code: string;
    message: string;
  };
}
