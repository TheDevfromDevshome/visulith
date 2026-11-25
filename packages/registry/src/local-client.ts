import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "./checksum.js";
import {
  REGISTRY_INDEX_SCHEMA_VERSION,
  type InstallResult,
  type RegistryDiagnostic,
  type RegistryIndex,
  type RegistryPackageMetadata,
} from "./types.js";

const DEFAULT_INDEX_PATH = fileURLToPath(new URL("../../../fixtures/registry/index.json", import.meta.url));

export interface LocalRegistryClientOptions {
  /** Override the registry index path; defaults to the checked-in fixture index. */
  index?: string;
  /** Directory containing artifacts; defaults to the index directory. */
  artifactRoot?: string;
}

export interface RegistrySearchQuery {
  text?: string;
  category?: string;
}

function diagnostic(code: string, message: string, path?: string): RegistryDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function readIndex(indexPath: string, diagnostics: RegistryDiagnostic[]): RegistryIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(indexPath, "utf8")) as unknown;
  } catch (cause) {
    diagnostics.push(
      diagnostic(
        "REGISTRY_INDEX_INVALID",
        `Could not read registry index: ${cause instanceof Error ? cause.message : String(cause)}.`,
        indexPath,
      ),
    );
    return { schemaVersion: REGISTRY_INDEX_SCHEMA_VERSION, packages: [] };
  }
  if (typeof parsed !== "object" || parsed === null || !("schemaVersion" in parsed) || !("packages" in parsed)) {
    diagnostics.push(diagnostic("REGISTRY_INDEX_INVALID", "Registry index must contain schemaVersion and packages.", indexPath));
    return { schemaVersion: REGISTRY_INDEX_SCHEMA_VERSION, packages: [] };
  }
  const record = parsed as { schemaVersion?: unknown; packages?: unknown };
  if (record.schemaVersion !== REGISTRY_INDEX_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic("REGISTRY_INDEX_UNSUPPORTED", `Unsupported registry index schemaVersion ${String(record.schemaVersion)}.`, indexPath),
    );
    return { schemaVersion: REGISTRY_INDEX_SCHEMA_VERSION, packages: [] };
  }
  if (!Array.isArray(record.packages)) {
    diagnostics.push(diagnostic("REGISTRY_INDEX_INVALID", 'Registry index "packages" must be an array.', indexPath));
    return { schemaVersion: REGISTRY_INDEX_SCHEMA_VERSION, packages: [] };
  }
  const packages: RegistryPackageMetadata[] = [];
  record.packages.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      diagnostics.push(diagnostic("REGISTRY_ENTRY_INVALID", `Package at index ${index} must be an object.`, indexPath));
      return;
    }
    const candidate = entry as RegistryPackageMetadata;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.version !== "string" ||
      typeof candidate.artifact !== "string" ||
      typeof candidate.checksum?.value !== "string"
    ) {
      diagnostics.push(diagnostic("REGISTRY_ENTRY_INVALID", `Package at index ${index} is missing required fields.`, indexPath));
      return;
    }
    packages.push(candidate);
  });
  return { schemaVersion: REGISTRY_INDEX_SCHEMA_VERSION, packages };
}

/** Reads a JSON registry index, verifies artifacts with node:crypto, and copies verified files. */
export class LocalRegistryClient {
  private readonly indexPath: string;
  private readonly artifactRoot: string;
  private readonly index: RegistryIndex;
  private readonly diagnostics: RegistryDiagnostic[] = [];

  constructor(options: LocalRegistryClientOptions = {}) {
    this.indexPath = resolve(options.index ?? DEFAULT_INDEX_PATH);
    this.artifactRoot = resolve(options.artifactRoot ?? dirname(this.indexPath));
    this.index = readIndex(this.indexPath, this.diagnostics);
  }

  listPackages(): readonly RegistryPackageMetadata[] {
    return [...this.index.packages].sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
  }

  getPackage(id: string): RegistryPackageMetadata | undefined {
    return this.index.packages.find((entry) => entry.id === id);
  }

  search(query: RegistrySearchQuery = {}): readonly RegistryPackageMetadata[] {
    const text = (query.text ?? "").toLowerCase();
    const category = (query.category ?? "").toLowerCase();
    return this.listPackages().filter((entry) => {
      if (category.length > 0 && !(entry.categories ?? []).some((value) => value.toLowerCase() === category)) {
        return false;
      }
      if (text.length === 0) return true;
      return [entry.id, entry.name ?? "", entry.description ?? "", ...(entry.categories ?? [])].some((value) =>
        value.toLowerCase().includes(text),
      );
    });
  }

  artifactPath(entry: RegistryPackageMetadata): string {
    const candidate = resolve(this.artifactRoot, entry.artifact);
    const relativePath = relative(this.artifactRoot, candidate);
    if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
      const message = `Artifact path "${entry.artifact}" escapes the artifact root.`;
      this.diagnostics.push(diagnostic("REGISTRY_ARTIFACT_PATH_INVALID", message, this.indexPath));
      return "";
    }
    return candidate;
  }

  verifyPackage(id: string): boolean {
    const entry = this.getPackage(id);
    if (entry === undefined) return false;
    const artifactPath = this.artifactPath(entry);
    if (artifactPath === "" || !existsSync(artifactPath)) return false;
    if (entry.checksum.algorithm !== "sha256") return false;
    return sha256File(artifactPath) === entry.checksum.value.toLowerCase();
  }

  /**
   * Copy a verified artifact into a target directory. Verification happens
   * before any write; a bad checksum never produces a file.
   */
  installPackage(id: string, targetDirectory: string, options: { fileName?: string; overwrite?: boolean } = {}): InstallResult {
    const entry = this.getPackage(id);
    if (entry === undefined) {
      return {
        ok: false,
        diagnostics: [diagnostic("REGISTRY_PACKAGE_NOT_FOUND", `Unknown registry package "${id}".`)],
      };
    }
    if (entry.checksum.algorithm !== "sha256") {
      return {
        ok: false,
        diagnostics: [diagnostic("REGISTRY_CHECKSUM_UNSUPPORTED", `Unsupported checksum algorithm "${entry.checksum.algorithm}".`)],
      };
    }

    const artifactPath = this.artifactPath(entry);
    if (artifactPath === "" || !existsSync(artifactPath)) {
      return {
        ok: false,
        diagnostics: [diagnostic("REGISTRY_ARTIFACT_MISSING", `Artifact for "${id}" does not exist: ${entry.artifact}.`)],
      };
    }

    const actual = sha256File(artifactPath);
    if (actual !== entry.checksum.value.toLowerCase()) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            "REGISTRY_CHECKSUM_MISMATCH",
            `Artifact for "${id}" has sha256 ${actual}, expected ${entry.checksum.value.toLowerCase()}.`,
            artifactPath,
          ),
        ],
      };
    }

    const directory = resolve(targetDirectory);
    const installedPath = resolve(directory, options.fileName ?? basename(entry.artifact));
    if (existsSync(installedPath) && options.overwrite !== true) {
      return {
        ok: false,
        diagnostics: [diagnostic("REGISTRY_TARGET_EXISTS", `Target file already exists: ${installedPath}.`)],
      };
    }

    mkdirSync(directory, { recursive: true });
    copyFileSync(artifactPath, installedPath);
    return { ok: true, installedPath, diagnostics: [] };
  }

  allDiagnostics(): readonly RegistryDiagnostic[] {
    return [...this.diagnostics];
  }
}
