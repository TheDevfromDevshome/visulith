import {
  error,
  warning,
  type NodeDefinitionContribution,
  type PluginDiagnostic,
  type PluginPermission,
} from "@visulith/plugin-api";
import {
  loadPluginDirectory,
  loadPluginManifestFile,
  type LoadOptions,
  type LoadedPlugin,
  type PluginLoadResult,
} from "./loader.js";

export interface PluginRegistryOptions extends LoadOptions {}

/** Runtime-readable registry with the same key/value shape as the engine's NodeDefinitionRegistry. */
export type HostNodeDefinitionRegistry = ReadonlyMap<string, NodeDefinitionContribution>;

export interface PluginPermissionDisclosure {
  pluginId: string;
  permissions: readonly PluginPermission[];
}

/**
 * In-memory registry of declarative plugins.
 *
 * The host never imports plugin modules and never calls provider interfaces.
 * Enabling a plugin only makes its declared contributions visible to the
 * application; permissions are disclosed for review, not granted or enforced.
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly diagnostics: PluginDiagnostic[] = [];
  private readonly options: PluginRegistryOptions;

  constructor(options: PluginRegistryOptions = {}) {
    this.options = options;
  }

  loadDirectory(directory: string): PluginLoadResult {
    return this.merge(loadPluginDirectory(directory, this.options));
  }

  loadFile(manifestPath: string): PluginLoadResult {
    return this.merge(loadPluginManifestFile(manifestPath, this.options));
  }

  private merge(result: PluginLoadResult): PluginLoadResult {
    const diagnostics = [...result.diagnostics];
    for (const plugin of result.plugins) {
      if (this.plugins.has(plugin.id)) {
        diagnostics.push(
          error(
            "PLUGIN_ID_DUPLICATE",
            `Plugin "${plugin.id}" is already registered; the duplicate was ignored.`,
            plugin.manifestPath,
          ),
        );
        continue;
      }
      this.plugins.set(plugin.id, plugin);
    }
    this.diagnostics.push(...diagnostics);
    return { plugins: result.plugins, diagnostics };
  }

  list(): readonly LoadedPlugin[] {
    return [...this.plugins.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  enable(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (plugin === undefined) return false;
    plugin.enabled = true;
    return true;
  }

  disable(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (plugin === undefined) return false;
    plugin.enabled = false;
    return true;
  }

  isEnabled(id: string): boolean {
    return this.plugins.get(id)?.enabled ?? false;
  }

  permissionsFor(id: string): readonly PluginPermission[] {
    return this.plugins.get(id)?.manifest.permissions ?? [];
  }

  /** Permissions of all known plugins, for display in an application UI or CLI. */
  permissionDisclosure(): readonly PluginPermissionDisclosure[] {
    return this.list().map((plugin) => ({
      pluginId: plugin.id,
      permissions: plugin.manifest.permissions ?? [],
    }));
  }

  /** Aggregate declarative node contributions. The first definition for an id wins. */
  collectNodeDefinitions(enabledOnly = true): HostNodeDefinitionRegistry {
    const definitions = new Map<string, NodeDefinitionContribution>();
    for (const plugin of this.list()) {
      if (enabledOnly && !plugin.enabled) continue;
      for (const definition of plugin.manifest.contributions?.nodes ?? []) {
        if (definitions.has(definition.definitionId)) {
          this.diagnostics.push(
            warning(
              "PLUGIN_NODE_DEFINITION_DUPLICATE",
              `Node definition "${definition.definitionId}" is already contributed; the first one wins.`,
              plugin.manifestPath,
            ),
          );
          continue;
        }
        definitions.set(definition.definitionId, definition);
      }
    }
    return definitions;
  }

  /** Alias that makes the engine compatibility of the returned map explicit. */
  nodeDefinitionRegistry(): HostNodeDefinitionRegistry {
    return this.collectNodeDefinitions();
  }

  allDiagnostics(): readonly PluginDiagnostic[] {
    return [...this.diagnostics];
  }

  clear(): void {
    this.plugins.clear();
    this.diagnostics.length = 0;
  }
}
