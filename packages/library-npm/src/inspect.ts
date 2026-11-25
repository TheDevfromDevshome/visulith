import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type {
  AdapterFile,
  AdapterOverride,
  InspectionDiagnostic,
  InspectionResult,
  InspectOptions,
  ManifestTypeRef,
  NodeDefinitionContribution,
  PortContribution,
} from "./types.js";
import { ADAPTER_SCHEMA_VERSION } from "./types.js";

const FUNCTION_PATTERN = /export\s+declare\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([^;]+);/g;
const CLASS_PATTERN = /export\s+declare\s+class\s+([A-Za-z_$][\w$]*)\s*\{([\s\S]*?)^\s*\}/gm;
const CONSTRUCTOR_PATTERN = /constructor\s*\(([^)]*)\)\s*;/g;
const METHOD_PATTERN = /^\s+(?!private\b|protected\b|constructor\b)([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([^;]+);/gm;

function diagnostic(code: string, message: string, path?: string): InspectionDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function findDeclarationFiles(packageDirectory: string, maxFiles: number): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  const root = resolve(packageDirectory);
  let truncated = false;

  function walk(directory: string, depth: number): void {
    if (depth > 6 || files.length >= maxFiles) {
      if (files.length >= maxFiles) truncated = true;
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        walk(join(directory, entry.name), depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test-d.ts")) {
        files.push(relative(root, join(directory, entry.name)).replace(/\\/g, "/"));
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
      }
    }
  }

  walk(root, 0);
  return { files: files.sort(), truncated };
}

/** Map a small TypeScript type subset to a structured type reference. */
export function tsTypeToRef(rawType: string): ManifestTypeRef {
  const text = rawType.trim().replace(/\s+/g, " ");
  const promise = /^Promise<(.+)>$/.exec(text);
  if (promise !== null) return tsTypeToRef(promise[1] ?? text);

  if (text === "string") return { kind: "primitive", name: "core.string" };
  if (text === "number") return { kind: "primitive", name: "core.f64" };
  if (text === "boolean") return { kind: "primitive", name: "core.bool" };
  if (text === "void" || text === "undefined" || text === "null") return { kind: "primitive", name: "core.unit" };

  const arraySuffix = /^(.+)\[\]$/.exec(text);
  if (arraySuffix !== null) return { kind: "array", name: tsTypeToRef(arraySuffix[1] ?? text).name };
  const arrayGeneric = /^Array<(.+)>$/.exec(text);
  if (arrayGeneric !== null) return { kind: "array", name: tsTypeToRef(arrayGeneric[1] ?? text).name };

  return { kind: "external", name: text };
}

function parseParameters(raw: string): PortContribution[] {
  const ports: PortContribution[] = [];
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  parts.forEach((part, index) => {
    const match = /^([A-Za-z_$][\w$]*)(\?)?\s*:\s*(.+)$/.exec(part);
    if (match === null) return;
    ports.push({
      id: match[1] ?? `arg${index + 1}`,
      direction: "input",
      kind: "data",
      type: tsTypeToRef(match[3] ?? "unknown"),
      required: match[2] !== "?",
      description: `Best-effort parameter ${index + 1} inferred from a .d.ts file.`,
    });
  });
  return ports;
}

function parseReturnType(raw: string | undefined): ManifestTypeRef {
  return raw === undefined || raw.trim().length === 0
    ? { kind: "primitive", name: "core.unit" }
    : tsTypeToRef(raw);
}

function makeNode(
  packageKey: string,
  version: string,
  symbolName: string,
  inputs: PortContribution[],
  returnType: ManifestTypeRef,
  sourceFile: string,
): NodeDefinitionContribution {
  const outputs: PortContribution[] =
    returnType.kind === "primitive" && returnType.name === "core.unit"
      ? []
      : [
          {
            id: "result",
            direction: "output",
            kind: "data",
            type: returnType,
            description: "Best-effort return value inferred from a .d.ts file.",
          },
        ];
  return {
    definitionId: `npm.${packageKey}.${symbolName}`,
    version,
    displayName: symbolName,
    category: "npm",
    inputs,
    outputs,
    properties: [],
    capabilities: ["visualNodes", "best-effort", "partial"],
    description: `Best-effort contribution inferred from ${sourceFile}; review before use.`,
  };
}

function loadAdapters(adapterPath: string, diagnostics: InspectionDiagnostic[]): AdapterOverride[] {
  if (!existsSync(adapterPath)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(adapterPath, "utf8")) as unknown;
  } catch (cause) {
    diagnostics.push(
      diagnostic("NPM_ADAPTER_INVALID", `Could not parse adapter file: ${cause instanceof Error ? cause.message : String(cause)}.`, adapterPath),
    );
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || !("overrides" in parsed)) {
    diagnostics.push(diagnostic("NPM_ADAPTER_INVALID", 'Adapter file must contain an "overrides" array.', adapterPath));
    return [];
  }
  const adapter = parsed as Partial<AdapterFile>;
  if (adapter.schemaVersion !== undefined && adapter.schemaVersion !== ADAPTER_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic("NPM_ADAPTER_UNSUPPORTED", `Unsupported adapter schemaVersion ${String(adapter.schemaVersion)}.`, adapterPath),
    );
    return [];
  }
  if (!Array.isArray(adapter.overrides)) {
    diagnostics.push(diagnostic("NPM_ADAPTER_INVALID", '"overrides" must be an array.', adapterPath));
    return [];
  }
  const overrides: AdapterOverride[] = [];
  adapter.overrides.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null || typeof (entry as AdapterOverride).definitionId !== "string") {
      diagnostics.push(diagnostic("NPM_ADAPTER_INVALID", `Override at index ${index} needs a definitionId string.`, adapterPath));
      return;
    }
    overrides.push(entry as AdapterOverride);
  });
  return overrides;
}

function applyAdapters(nodes: NodeDefinitionContribution[], overrides: readonly AdapterOverride[]): NodeDefinitionContribution[] {
  const byId = new Map(overrides.map((entry) => [entry.definitionId, entry]));
  const result: NodeDefinitionContribution[] = [];
  for (const node of nodes) {
    const override = byId.get(node.definitionId);
    if (override === undefined) {
      result.push(node);
      continue;
    }
    byId.delete(node.definitionId);
    if (override.exclude === true) continue;
    result.push({
      ...node,
      ...(override.displayName === undefined ? {} : { displayName: override.displayName }),
      ...(override.category === undefined ? {} : { category: override.category }),
      ...(override.description === undefined ? {} : { description: override.description }),
      ...(override.inputs === undefined ? {} : { inputs: override.inputs }),
      ...(override.outputs === undefined ? {} : { outputs: override.outputs }),
      ...(override.properties === undefined ? {} : { properties: override.properties }),
      ...(override.capabilities === undefined ? {} : { capabilities: override.capabilities }),
    });
  }
  // Overrides for nodes that were not inferred can add a manually authored node.
  for (const override of byId.values()) {
    if (override.exclude === true) continue;
    result.push({
      definitionId: override.definitionId,
      version: "manual",
      displayName: override.displayName ?? override.definitionId,
      category: override.category ?? "manual",
      inputs: override.inputs ?? [],
      outputs: override.outputs ?? [],
      properties: override.properties ?? [],
      capabilities: override.capabilities ?? ["visualNodes", "manual"],
      ...(override.description === undefined ? {} : { description: override.description }),
    });
  }
  return result.sort((a, b) => a.definitionId.localeCompare(b.definitionId));
}

/**
 * Best-effort inspection of an npm-style package directory.
 *
 * This uses lightweight regular expressions over .d.ts files. It does not
 * load the package, execute code, or use the TypeScript compiler. Complex
 * signatures (overloads, mapped types, generics with commas) may be missed.
 */
export function inspectPackage(packageDirectory: string, options: InspectOptions = {}): InspectionResult {
  const root = resolve(packageDirectory);
  const diagnostics: InspectionDiagnostic[] = [];
  const packageJsonPath = join(root, "package.json");
  let packageName: string | undefined;
  let version: string | undefined;

  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: unknown; version?: unknown };
      if (typeof parsed.name === "string" && parsed.name.length > 0) packageName = parsed.name;
      if (typeof parsed.version === "string" && parsed.version.length > 0) {
        version = parsed.version;
      } else {
        diagnostics.push(diagnostic("NPM_VERSION_MISSING", "package.json has no usable version; nodes use \"unknown\".", packageJsonPath));
      }
    } catch (cause) {
      diagnostics.push(
        diagnostic("NPM_PACKAGE_JSON_INVALID", `Could not parse package.json: ${cause instanceof Error ? cause.message : String(cause)}.`, packageJsonPath),
      );
    }
  } else {
    diagnostics.push(diagnostic("NPM_PACKAGE_JSON_MISSING", "package.json was not found.", packageJsonPath));
  }

  const packageKey = (packageName ?? basename(root)).replace(/^@/, "").replace(/[/\\]/g, "-");
  const nodeVersion = version ?? "unknown";
  const found = findDeclarationFiles(root, options.maxFiles ?? 50);
  if (found.truncated) {
    diagnostics.push(diagnostic("NPM_FILE_LIMIT", `Stopped after ${options.maxFiles ?? 50} declaration files.`));
  }
  if (found.files.length === 0) {
    diagnostics.push(diagnostic("NPM_DECLARATIONS_MISSING", "No .d.ts files were found."));
  }

  const nodes: NodeDefinitionContribution[] = [];
  for (const relativePath of found.files) {
    const absolutePath = join(root, relativePath);
    let text: string;
    try {
      text = readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
    } catch {
      diagnostics.push(diagnostic("NPM_DECLARATION_UNREADABLE", `Could not read ${relativePath}.`, absolutePath));
      continue;
    }

    const functionCount = (text.match(/export\s+declare\s+function\b/g) ?? []).length;
    const functionNodesBefore = nodes.length;
    for (const match of text.matchAll(FUNCTION_PATTERN)) {
      const name = match[1];
      if (name === undefined) continue;
      nodes.push(makeNode(packageKey, nodeVersion, name, parseParameters(match[2] ?? ""), parseReturnType(match[3]), relativePath));
    }
    const skippedFunctions = functionCount - (nodes.length - functionNodesBefore);
    if (skippedFunctions > 0) {
      diagnostics.push(
        diagnostic(
          "NPM_SIGNATURE_PARTIAL",
          `${skippedFunctions} function declaration(s) in ${relativePath} could not be inferred; review the source manually.`,
          absolutePath,
        ),
      );
    }

    const classCount = (text.match(/export\s+declare\s+class\b/g) ?? []).length;
    let matchedClasses = 0;
    for (const classMatch of text.matchAll(CLASS_PATTERN)) {
      const className = classMatch[1];
      if (className === undefined) continue;
      matchedClasses += 1;
      const body = classMatch[2] ?? "";
      const classNodesBefore = nodes.length;
      for (const constructorMatch of body.matchAll(CONSTRUCTOR_PATTERN)) {
        nodes.push(makeNode(packageKey, nodeVersion, className, parseParameters(constructorMatch[1] ?? ""), tsTypeToRef(className), relativePath));
      }
      for (const methodMatch of body.matchAll(METHOD_PATTERN)) {
        const methodName = methodMatch[1];
        if (methodName === undefined) continue;
        nodes.push(
          makeNode(
            packageKey,
            nodeVersion,
            `${className}.${methodName}`,
            parseParameters(methodMatch[2] ?? ""),
            parseReturnType(methodMatch[3]),
            relativePath,
          ),
        );
      }
      if (nodes.length === classNodesBefore) {
        // Keep the class visible even when no constructor/method signature was parseable.
        nodes.push(makeNode(packageKey, nodeVersion, className, [], tsTypeToRef(className), relativePath));
      }
    }
    if (classCount > matchedClasses) {
      diagnostics.push(
        diagnostic(
          "NPM_SIGNATURE_PARTIAL",
          `${classCount - matchedClasses} class declaration(s) in ${relativePath} could not be inferred; review the source manually.`,
          absolutePath,
        ),
      );
    }
  }

  const adapterPath = options.adapterPath ?? join(root, "adapters", "nodes.json");
  const overrides = loadAdapters(adapterPath, diagnostics);
  const finalNodes = applyAdapters(nodes, overrides);

  return {
    ...(packageName === undefined ? {} : { packageName }),
    version,
    sourceFiles: found.files,
    nodes: finalNodes,
    diagnostics,
    partial: true,
  };
}
