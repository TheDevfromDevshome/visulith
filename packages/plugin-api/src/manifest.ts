import { ALL_CAPABILITIES, ALL_CAPABILITY_STATUSES, isPluginCapability, type CapabilityStatus, type PluginCapability } from "./capabilities.js";
import {
  error,
  fail,
  hasErrors,
  isRecord,
  ok,
  warning,
  type PluginDiagnostic,
  type PluginValidationResult,
} from "./diagnostics.js";
import { isValidHostApiRange } from "./host-api.js";

/** Only this exact manifest schema version is accepted in the MVP. */
export const PLUGIN_MANIFEST_SCHEMA_VERSION = "1";

export const PERMISSION_KINDS = ["filesystem", "network", "process", "registry", "model", "workspace"] as const;
export type PluginPermissionKind = (typeof PERMISSION_KINDS)[number];

export interface PluginPermission {
  kind: PluginPermissionKind;
  reason: string;
  /** Optional path, host, or resource scope. Purely descriptive in the MVP. */
  scope?: string;
}

/** Mirrors the engine's TypeRef shape so contributions can be consumed directly. */
export interface ManifestTypeRef {
  kind: "primitive" | "external" | "array" | "option";
  name: string;
}

export interface PortContribution {
  id: string;
  direction: "input" | "output";
  kind: "data" | "execution" | "event" | "reference";
  type: ManifestTypeRef;
  required?: boolean;
  description?: string;
}

export interface PropertyContribution {
  key: string;
  type: ManifestTypeRef;
  required: boolean;
}

/** Structurally compatible with @visulith/engine's NodeDefinition. */
export interface NodeDefinitionContribution {
  definitionId: string;
  version: string;
  displayName: string;
  category: string;
  inputs: PortContribution[];
  outputs: PortContribution[];
  properties: PropertyContribution[];
  capabilities: string[];
  description?: string;
}

export interface LanguageMetadataContribution {
  languageId: string;
  displayName: string;
  extensions?: string[];
  mimeTypes?: string[];
  capabilities?: Partial<Record<PluginCapability, CapabilityStatus>>;
}

export interface ToolDefinitionContribution {
  id: string;
  displayName: string;
  kind: "command" | "service" | "external";
  description?: string;
  /** Human-readable hint only. The MVP host never invokes tools. */
  invocationHint?: string;
}

export interface AiProviderContribution {
  id: string;
  displayName: string;
  mode: "local" | "remote" | "unknown";
  capabilities: PluginCapability[];
}

export interface PluginContributions {
  nodes?: NodeDefinitionContribution[];
  languages?: LanguageMetadataContribution[];
  tools?: ToolDefinitionContribution[];
  aiProviders?: AiProviderContribution[];
}

export interface PluginCompatibility {
  /** Engine constraint as a plain string, e.g. ">=0.1.0". Not resolved by the MVP. */
  engine?: string;
  node?: string;
  platforms?: string[];
  notes?: string;
}

export interface PluginManifest {
  schemaVersion: "1";
  id: string;
  name: string;
  version: string;
  hostApi: string;
  categories: string[];
  capabilities: PluginCapability[];
  license: string;
  description?: string;
  publisher?: string;
  permissions?: PluginPermission[];
  contributions?: PluginContributions;
  compatibility?: PluginCompatibility;
}

const ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const TYPE_REF_KINDS: readonly ManifestTypeRef["kind"][] = ["primitive", "external", "array", "option"];
const PORT_DIRECTIONS: readonly PortContribution["direction"][] = ["input", "output"];
const PORT_KINDS: readonly PortContribution["kind"][] = ["data", "execution", "event", "reference"];

function readString(value: unknown, field: string, diagnostics: PluginDiagnostic[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected a non-empty string for "${field}".`));
    return undefined;
  }
  return value;
}

function readOptionalString(value: unknown, field: string, diagnostics: PluginDiagnostic[]): string | undefined {
  if (value === undefined) return undefined;
  return readString(value, field, diagnostics);
}

function readStringArray(value: unknown, field: string, diagnostics: PluginDiagnostic[]): string[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an array for "${field}".`));
    return undefined;
  }
  const result: string[] = [];
  value.forEach((item, index) => {
    const itemValue = readString(item, `${field}[${index}]`, diagnostics);
    if (itemValue !== undefined) result.push(itemValue);
  });
  return result;
}

function readTypeRef(value: unknown, field: string, diagnostics: PluginDiagnostic[]): ManifestTypeRef | undefined {
  if (!isRecord(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}".`));
    return undefined;
  }
  const kind = value["kind"];
  const name = readString(value["name"], `${field}.name`, diagnostics);
  if (typeof kind !== "string" || !TYPE_REF_KINDS.includes(kind as ManifestTypeRef["kind"])) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown type kind at "${field}.kind": ${String(kind)}.`));
    return undefined;
  }
  if (name === undefined) return undefined;
  return { kind: kind as ManifestTypeRef["kind"], name };
}

function readPorts(value: unknown, field: string, direction: PortContribution["direction"], diagnostics: PluginDiagnostic[]): PortContribution[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an array for "${field}".`));
    return undefined;
  }
  const result: PortContribution[] = [];
  value.forEach((raw, index) => {
    const portField = `${field}[${index}]`;
    if (!isRecord(raw)) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${portField}".`));
      return;
    }
    const id = readString(raw["id"], `${portField}.id`, diagnostics);
    const kindValue = raw["kind"];
    const type = readTypeRef(raw["type"], `${portField}.type`, diagnostics);
    if (typeof kindValue !== "string" || !PORT_KINDS.includes(kindValue as PortContribution["kind"])) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown port kind at "${portField}.kind": ${String(kindValue)}.`));
      return;
    }
    if (id === undefined || type === undefined) return;
    const required = raw["required"];
    if (required !== undefined && typeof required !== "boolean") {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `"${portField}.required" must be a boolean.`));
      return;
    }
    const description = readOptionalString(raw["description"], `${portField}.description`, diagnostics);
    result.push({
      id,
      direction,
      kind: kindValue as PortContribution["kind"],
      type,
      ...(required === undefined ? {} : { required }),
      ...(description === undefined ? {} : { description }),
    });
  });
  return result;
}

function readProperties(value: unknown, field: string, diagnostics: PluginDiagnostic[]): PropertyContribution[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an array for "${field}".`));
    return undefined;
  }
  const result: PropertyContribution[] = [];
  value.forEach((raw, index) => {
    const propertyField = `${field}[${index}]`;
    if (!isRecord(raw)) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${propertyField}".`));
      return;
    }
    const key = readString(raw["key"], `${propertyField}.key`, diagnostics);
    const type = readTypeRef(raw["type"], `${propertyField}.type`, diagnostics);
    const required = raw["required"];
    if (typeof required !== "boolean") {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `"${propertyField}.required" must be a boolean.`));
      return;
    }
    if (key === undefined || type === undefined) return;
    result.push({ key, type, required });
  });
  return result;
}

function readNode(raw: unknown, field: string, diagnostics: PluginDiagnostic[]): NodeDefinitionContribution | undefined {
  if (!isRecord(raw)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}".`));
    return undefined;
  }
  const definitionId = readString(raw["definitionId"], `${field}.definitionId`, diagnostics);
  const version = readString(raw["version"], `${field}.version`, diagnostics);
  const displayName = readString(raw["displayName"], `${field}.displayName`, diagnostics);
  const category = readString(raw["category"], `${field}.category`, diagnostics);
  const inputs = readPorts(raw["inputs"] ?? [], `${field}.inputs`, "input", diagnostics);
  const outputs = readPorts(raw["outputs"] ?? [], `${field}.outputs`, "output", diagnostics);
  const properties = readProperties(raw["properties"] ?? [], `${field}.properties`, diagnostics);
  const capabilities = readStringArray(raw["capabilities"] ?? [], `${field}.capabilities`, diagnostics);
  const description = readOptionalString(raw["description"], `${field}.description`, diagnostics);
  if (
    definitionId === undefined ||
    version === undefined ||
    displayName === undefined ||
    category === undefined ||
    inputs === undefined ||
    outputs === undefined ||
    properties === undefined ||
    capabilities === undefined
  ) {
    return undefined;
  }
  return {
    definitionId,
    version,
    displayName,
    category,
    inputs,
    outputs,
    properties,
    capabilities,
    ...(description === undefined ? {} : { description }),
  };
}

function readLanguage(raw: unknown, field: string, diagnostics: PluginDiagnostic[]): LanguageMetadataContribution | undefined {
  if (!isRecord(raw)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}".`));
    return undefined;
  }
  const languageId = readString(raw["languageId"], `${field}.languageId`, diagnostics);
  const displayName = readString(raw["displayName"], `${field}.displayName`, diagnostics);
  const extensions = raw["extensions"] === undefined ? undefined : readStringArray(raw["extensions"], `${field}.extensions`, diagnostics);
  const mimeTypes = raw["mimeTypes"] === undefined ? undefined : readStringArray(raw["mimeTypes"], `${field}.mimeTypes`, diagnostics);
  const capabilities: Partial<Record<PluginCapability, CapabilityStatus>> = {};
  if (raw["capabilities"] !== undefined) {
    if (!isRecord(raw["capabilities"])) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}.capabilities".`));
    } else {
      for (const key of Object.keys(raw["capabilities"]).sort()) {
        const status = raw["capabilities"][key];
        if (!isPluginCapability(key)) {
          diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown capability "${key}" at "${field}.capabilities".`));
          continue;
        }
        if (typeof status !== "string" || !ALL_CAPABILITY_STATUSES.includes(status as CapabilityStatus)) {
          diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown capability status at "${field}.capabilities.${key}".`));
          continue;
        }
        capabilities[key] = status as CapabilityStatus;
      }
    }
  }
  if (languageId === undefined || displayName === undefined) return undefined;
  return {
    languageId,
    displayName,
    ...(extensions === undefined ? {} : { extensions }),
    ...(mimeTypes === undefined ? {} : { mimeTypes }),
    ...(Object.keys(capabilities).length === 0 ? {} : { capabilities }),
  };
}

function readTool(raw: unknown, field: string, diagnostics: PluginDiagnostic[]): ToolDefinitionContribution | undefined {
  if (!isRecord(raw)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}".`));
    return undefined;
  }
  const id = readString(raw["id"], `${field}.id`, diagnostics);
  const displayName = readString(raw["displayName"], `${field}.displayName`, diagnostics);
  const kindValue = raw["kind"];
  if (typeof kindValue !== "string" || !["command", "service", "external"].includes(kindValue)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown tool kind at "${field}.kind": ${String(kindValue)}.`));
    return undefined;
  }
  if (id === undefined || displayName === undefined) return undefined;
  const description = readOptionalString(raw["description"], `${field}.description`, diagnostics);
  const invocationHint = readOptionalString(raw["invocationHint"], `${field}.invocationHint`, diagnostics);
  return {
    id,
    displayName,
    kind: kindValue as ToolDefinitionContribution["kind"],
    ...(description === undefined ? {} : { description }),
    ...(invocationHint === undefined ? {} : { invocationHint }),
  };
}

function readAiProvider(raw: unknown, field: string, diagnostics: PluginDiagnostic[]): AiProviderContribution | undefined {
  if (!isRecord(raw)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}".`));
    return undefined;
  }
  const id = readString(raw["id"], `${field}.id`, diagnostics);
  const displayName = readString(raw["displayName"], `${field}.displayName`, diagnostics);
  const modeValue = raw["mode"];
  if (typeof modeValue !== "string" || !["local", "remote", "unknown"].includes(modeValue)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown AI provider mode at "${field}.mode": ${String(modeValue)}.`));
    return undefined;
  }
  const rawCapabilities = readStringArray(raw["capabilities"] ?? [], `${field}.capabilities`, diagnostics) ?? [];
  const capabilities: PluginCapability[] = [];
  for (const value of rawCapabilities) {
    if (!isPluginCapability(value)) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown AI provider capability "${value}" at "${field}.capabilities".`));
      continue;
    }
    capabilities.push(value);
  }
  if (id === undefined || displayName === undefined) return undefined;
  return { id, displayName, mode: modeValue as AiProviderContribution["mode"], capabilities };
}

function readPermissions(value: unknown, diagnostics: PluginDiagnostic[]): PluginPermission[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an array for "permissions".'));
    return undefined;
  }
  const result: PluginPermission[] = [];
  value.forEach((raw, index) => {
    const field = `permissions[${index}]`;
    if (!isRecord(raw)) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Expected an object for "${field}".`));
      return;
    }
    const kind = raw["kind"];
    const reason = readString(raw["reason"], `${field}.reason`, diagnostics);
    const scope = readOptionalString(raw["scope"], `${field}.scope`, diagnostics);
    if (typeof kind !== "string" || !PERMISSION_KINDS.includes(kind as PluginPermissionKind)) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", `Unknown permission kind at "${field}.kind": ${String(kind)}.`));
      return;
    }
    if (reason === undefined) return;
    result.push({ kind: kind as PluginPermissionKind, reason, ...(scope === undefined ? {} : { scope }) });
  });
  return result;
}

function readContributions(value: unknown, diagnostics: PluginDiagnostic[]): PluginContributions | undefined {
  if (!isRecord(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an object for "contributions".'));
    return undefined;
  }
  const contributions: PluginContributions = {};
  if (value["nodes"] !== undefined) {
    if (!Array.isArray(value["nodes"])) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an array for "contributions.nodes".'));
    } else {
      const nodes: NodeDefinitionContribution[] = [];
      value["nodes"].forEach((raw, index) => {
        const node = readNode(raw, `contributions.nodes[${index}]`, diagnostics);
        if (node !== undefined) nodes.push(node);
      });
      contributions.nodes = nodes;
    }
  }
  if (value["languages"] !== undefined) {
    if (!Array.isArray(value["languages"])) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an array for "contributions.languages".'));
    } else {
      const languages: LanguageMetadataContribution[] = [];
      value["languages"].forEach((raw, index) => {
        const language = readLanguage(raw, `contributions.languages[${index}]`, diagnostics);
        if (language !== undefined) languages.push(language);
      });
      contributions.languages = languages;
    }
  }
  if (value["tools"] !== undefined) {
    if (!Array.isArray(value["tools"])) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an array for "contributions.tools".'));
    } else {
      const tools: ToolDefinitionContribution[] = [];
      value["tools"].forEach((raw, index) => {
        const tool = readTool(raw, `contributions.tools[${index}]`, diagnostics);
        if (tool !== undefined) tools.push(tool);
      });
      contributions.tools = tools;
    }
  }
  if (value["aiProviders"] !== undefined) {
    if (!Array.isArray(value["aiProviders"])) {
      diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an array for "contributions.aiProviders".'));
    } else {
      const providers: AiProviderContribution[] = [];
      value["aiProviders"].forEach((raw, index) => {
        const provider = readAiProvider(raw, `contributions.aiProviders[${index}]`, diagnostics);
        if (provider !== undefined) providers.push(provider);
      });
      contributions.aiProviders = providers;
    }
  }
  return contributions;
}

function readCompatibility(value: unknown, diagnostics: PluginDiagnostic[]): PluginCompatibility | undefined {
  if (!isRecord(value)) {
    diagnostics.push(error("PLUGIN_INVALID_FIELD", 'Expected an object for "compatibility".'));
    return undefined;
  }
  const result: PluginCompatibility = {};
  const engine = readOptionalString(value["engine"], "compatibility.engine", diagnostics);
  const node = readOptionalString(value["node"], "compatibility.node", diagnostics);
  const platforms = value["platforms"] === undefined ? undefined : readStringArray(value["platforms"], "compatibility.platforms", diagnostics);
  const notes = readOptionalString(value["notes"], "compatibility.notes", diagnostics);
  if (engine !== undefined) result.engine = engine;
  if (node !== undefined) result.node = node;
  if (platforms !== undefined) result.platforms = platforms;
  if (notes !== undefined) result.notes = notes;
  return result;
}

/** Validate untrusted JSON into a versioned plugin manifest. No I/O and no code execution. */
export function validatePluginManifest(input: unknown): PluginValidationResult<PluginManifest> {
  const diagnostics: PluginDiagnostic[] = [];
  if (!isRecord(input)) {
    return fail([error("PLUGIN_MANIFEST_INVALID", "Plugin manifest must be a JSON object.")]);
  }

  if (input["schemaVersion"] !== PLUGIN_MANIFEST_SCHEMA_VERSION) {
    diagnostics.push(
      error(
        "PLUGIN_SCHEMA_UNSUPPORTED",
        `Plugin schemaVersion ${String(input["schemaVersion"])} is not supported (expected ${PLUGIN_MANIFEST_SCHEMA_VERSION}).`,
        undefined,
        "Upgrade the manifest to schemaVersion 1.",
      ),
    );
  }

  const id = readString(input["id"], "id", diagnostics);
  const name = readString(input["name"], "name", diagnostics);
  const version = readString(input["version"], "version", diagnostics);
  const hostApi = readString(input["hostApi"], "hostApi", diagnostics);
  const license = readString(input["license"], "license", diagnostics);
  const description = readOptionalString(input["description"], "description", diagnostics);
  const publisher = readOptionalString(input["publisher"], "publisher", diagnostics);

  if (id !== undefined && !ID_PATTERN.test(id)) {
    diagnostics.push(
      error(
        "PLUGIN_ID_INVALID",
        `Plugin id "${id}" must be a lower-case identifier (optionally @scope/name) with . _ or - separators.`,
      ),
    );
  }
  if (version !== undefined && !VERSION_PATTERN.test(version)) {
    diagnostics.push(error("PLUGIN_VERSION_INVALID", `Plugin version "${version}" must be a semver-like x.y.z string.`));
  }
  if (hostApi !== undefined && !isValidHostApiRange(hostApi)) {
    diagnostics.push(error("PLUGIN_HOST_API_RANGE_INVALID", `Unsupported hostApi range "${hostApi}".`));
  }

  const rawCategories = readStringArray(input["categories"] ?? [], "categories", diagnostics) ?? [];
  if (rawCategories.length === 0) {
    diagnostics.push(error("PLUGIN_CATEGORIES_EMPTY", "At least one category is required."));
  }
  const categories = [...new Set(rawCategories)];

  const rawCapabilities = readStringArray(input["capabilities"] ?? [], "capabilities", diagnostics) ?? [];
  if (rawCapabilities.length === 0) {
    diagnostics.push(error("PLUGIN_CAPABILITIES_EMPTY", "At least one capability is required."));
  }
  const capabilities: PluginCapability[] = [];
  const seenCapabilities = new Set<string>();
  for (const value of rawCapabilities) {
    if (!isPluginCapability(value)) {
      diagnostics.push(
        error(
          "PLUGIN_CAPABILITY_UNKNOWN",
          `Unknown capability "${value}". Expected one of: ${ALL_CAPABILITIES.join(", ")}.`,
        ),
      );
      continue;
    }
    if (seenCapabilities.has(value)) {
      diagnostics.push(warning("PLUGIN_CAPABILITY_DUPLICATE", `Duplicate capability "${value}" was ignored.`));
      continue;
    }
    seenCapabilities.add(value);
    capabilities.push(value);
  }

  const permissions = input["permissions"] === undefined ? undefined : readPermissions(input["permissions"], diagnostics);
  const contributions = input["contributions"] === undefined ? undefined : readContributions(input["contributions"], diagnostics);
  const compatibility = input["compatibility"] === undefined ? undefined : readCompatibility(input["compatibility"], diagnostics);

  if (hasErrors(diagnostics)) return fail(diagnostics);
  return ok({
    schemaVersion: PLUGIN_MANIFEST_SCHEMA_VERSION,
    id: id as string,
    name: name as string,
    version: version as string,
    hostApi: hostApi as string,
    categories,
    capabilities,
    license: license as string,
    ...(description === undefined ? {} : { description }),
    ...(publisher === undefined ? {} : { publisher }),
    ...(permissions === undefined ? {} : { permissions }),
    ...(contributions === undefined ? {} : { contributions }),
    ...(compatibility === undefined ? {} : { compatibility }),
  }, diagnostics);
}
