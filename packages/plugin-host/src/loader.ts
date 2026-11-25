import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  HOST_API_VERSION,
  error,
  satisfiesHostApiRange,
  validatePluginManifest,
  withPath,
  type PluginDiagnostic,
  type PluginManifest,
} from "@visulith/plugin-api";

/** All loading is declarative: JSON is parsed and validated. Plugin code is never imported or executed. */
export interface LoadOptions {
  /** Host API version used for compatibility checks. Defaults to the plugin-api constant. */
  hostApiVersion?: string;
  /** Whether newly discovered plugins start enabled. Defaults to true. */
  enabledByDefault?: boolean;
}

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  /** Absolute path of the manifest file. */
  manifestPath: string;
  /** Absolute directory containing the manifest. */
  directory: string;
  enabled: boolean;
}

export interface PluginLoadResult {
  plugins: LoadedPlugin[];
  diagnostics: PluginDiagnostic[];
}

function emptyResult(): PluginLoadResult {
  return { plugins: [], diagnostics: [] };
}

function readJson(manifestPath: string): { value?: unknown; diagnostics: PluginDiagnostic[] } {
  let text: string;
  try {
    text = readFileSync(manifestPath, "utf8");
  } catch (cause) {
    return {
      diagnostics: [
        error(
          "PLUGIN_MANIFEST_UNREADABLE",
          `Could not read plugin manifest: ${cause instanceof Error ? cause.message : String(cause)}.`,
          manifestPath,
        ),
      ],
    };
  }
  try {
    return { value: JSON.parse(text) as unknown, diagnostics: [] };
  } catch (cause) {
    return {
      diagnostics: [
        error(
          "PLUGIN_JSON_INVALID",
          `Plugin manifest is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}.`,
          manifestPath,
        ),
      ],
    };
  }
}

/** Load one manifest file. Invalid or incompatible plugins are reported and not returned. */
export function loadPluginManifestFile(manifestPath: string, options: LoadOptions = {}): PluginLoadResult {
  const absolutePath = resolve(manifestPath);
  const hostApiVersion = options.hostApiVersion ?? HOST_API_VERSION;
  const file = readJson(absolutePath);
  if (file.diagnostics.length > 0 || file.value === undefined) {
    return { plugins: [], diagnostics: file.diagnostics };
  }

  const validation = validatePluginManifest(file.value);
  const diagnostics = validation.diagnostics.map((entry) => withPath(entry, absolutePath));
  if (!validation.ok || validation.value === undefined) {
    return { plugins: [], diagnostics };
  }
  const manifest = validation.value;
  if (!satisfiesHostApiRange(manifest.hostApi, hostApiVersion)) {
    diagnostics.push(
      error(
        "PLUGIN_HOST_API_INCOMPATIBLE",
        `Plugin "${manifest.id}" requires hostApi ${manifest.hostApi}, but the host is ${hostApiVersion}.`,
        absolutePath,
        "Use a compatible plugin version or upgrade the host API.",
      ),
    );
    return { plugins: [], diagnostics };
  }

  return {
    plugins: [
      {
        id: manifest.id,
        manifest,
        manifestPath: absolutePath,
        directory: dirname(absolutePath),
        enabled: options.enabledByDefault ?? true,
      },
    ],
    diagnostics,
  };
}

/**
 * Discover plugin manifests in a directory.
 *
 * Each immediate subdirectory is checked for `plugin.json`; standalone `.json`
 * files in the directory are also treated as manifests, which keeps fixture
 * sets simple. Results are sorted by manifest path for deterministic output.
 */
export function loadPluginDirectory(directory: string, options: LoadOptions = {}): PluginLoadResult {
  const absoluteDirectory = resolve(directory);
  let entries: Dirent[];
  try {
    entries = readdirSync(absoluteDirectory, { withFileTypes: true });
  } catch (cause) {
    return {
      plugins: [],
      diagnostics: [
        error(
          "PLUGIN_DIRECTORY_UNREADABLE",
          `Could not read plugin directory: ${cause instanceof Error ? cause.message : String(cause)}.`,
          absoluteDirectory,
        ),
      ],
    };
  }

  const candidates: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      const manifestPath = join(absoluteDirectory, entry.name, "plugin.json");
      if (existsSync(manifestPath)) candidates.push(manifestPath);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      candidates.push(join(absoluteDirectory, entry.name));
    }
  }

  const result = emptyResult();
  for (const candidate of candidates.sort()) {
    const loaded = loadPluginManifestFile(candidate, options);
    result.plugins.push(...loaded.plugins);
    result.diagnostics.push(...loaded.diagnostics);
  }
  result.plugins.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

/** Read the plugin id expected in a manifest file name; used only for diagnostics. */
export function manifestFileName(manifestPath: string): string {
  return basename(manifestPath);
}
