import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PluginRegistry } from "../index.js";

const pluginsDirectory = fileURLToPath(new URL("../../../../fixtures/plugins", import.meta.url));
const validManifestPath = join(pluginsDirectory, "valid-node-pack", "plugin.json");

test("a plugin directory loads valid manifests and rejects invalid or incompatible ones", () => {
  const registry = new PluginRegistry();
  const result = registry.loadDirectory(pluginsDirectory);

  assert.deepEqual(
    result.plugins.map((plugin) => plugin.id),
    ["example.node-pack"],
  );
  const codes = result.diagnostics.map((entry) => entry.code);
  assert.ok(codes.includes("PLUGIN_SCHEMA_UNSUPPORTED"));
  assert.ok(codes.includes("PLUGIN_CAPABILITY_UNKNOWN"));
  assert.ok(codes.includes("PLUGIN_HOST_API_INCOMPATIBLE"));
  assert.ok(result.diagnostics.every((entry) => entry.path !== undefined));

  assert.equal(registry.isEnabled("example.node-pack"), true);
  assert.deepEqual(
    registry.permissionsFor("example.node-pack").map((permission) => permission.kind),
    ["workspace"],
  );
  assert.deepEqual(
    registry.permissionDisclosure().map((entry) => entry.pluginId),
    ["example.node-pack"],
  );
});

test("node contributions aggregate into an engine-compatible map and respect enable state", () => {
  const registry = new PluginRegistry();
  registry.loadDirectory(pluginsDirectory);

  const definitions = registry.nodeDefinitionRegistry();
  assert.equal(definitions.size, 1);
  const definition = definitions.get("example.node-pack.notify");
  assert.equal(definition?.definitionId, "example.node-pack.notify");
  assert.equal(definition?.version, "0.1.0");
  assert.equal(definition?.displayName, "Notify");
  assert.equal(definition?.category, "io");
  assert.equal(definition?.inputs.length, 2);
  assert.equal(definition?.outputs.length, 1);
  assert.deepEqual(definition?.properties, [
    { key: "message", type: { kind: "primitive", name: "core.string" }, required: true },
  ]);

  assert.equal(registry.disable("example.node-pack"), true);
  assert.equal(registry.collectNodeDefinitions().size, 0);
  assert.equal(registry.collectNodeDefinitions(false).size, 1);
  assert.equal(registry.enable("example.node-pack"), true);
  assert.equal(registry.isEnabled("example.future-plugin"), false);
});

test("malformed JSON and duplicate plugin ids produce structured diagnostics", () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-plugins-"));
  try {
    const manifest = readFileSync(validManifestPath, "utf8");
    mkdirSync(join(directory, "first"), { recursive: true });
    mkdirSync(join(directory, "second"), { recursive: true });
    writeFileSync(join(directory, "first", "plugin.json"), manifest);
    writeFileSync(join(directory, "second", "plugin.json"), manifest);
    writeFileSync(join(directory, "broken.json"), "{ not json");

    const registry = new PluginRegistry();
    const result = registry.loadDirectory(directory);
    assert.equal(result.plugins.length, 2);
    assert.equal(registry.list().length, 1);
    const codes = registry.allDiagnostics().map((entry) => entry.code);
    assert.ok(codes.includes("PLUGIN_ID_DUPLICATE"));
    assert.ok(codes.includes("PLUGIN_JSON_INVALID"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
