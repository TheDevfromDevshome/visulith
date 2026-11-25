import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  PERMISSION_KINDS,
  validatePluginManifest,
} from "../index.js";

const validManifest = {
  schemaVersion: "1",
  id: "example.node-pack",
  name: "Example Node Pack",
  version: "1.0.0",
  hostApi: "^0.1",
  categories: ["nodes"],
  capabilities: [CAPABILITIES.visualNodes, CAPABILITIES.irExport],
  license: "MIT",
  permissions: [{ kind: "workspace", reason: "Read graph documents." }],
  contributions: {
    nodes: [
      {
        definitionId: "example.echo",
        version: "1.0.0",
        displayName: "Echo",
        category: "io",
        inputs: [
          {
            id: "exec-in",
            direction: "input",
            kind: "execution",
            type: { kind: "primitive", name: "core.unit" },
            required: true,
          },
        ],
        outputs: [
          {
            id: "exec-out",
            direction: "output",
            kind: "execution",
            type: { kind: "primitive", name: "core.unit" },
          },
        ],
        properties: [],
        capabilities: ["structured-flow"],
      },
    ],
    languages: [
      {
        languageId: "typescript",
        displayName: "TypeScript",
        capabilities: { completion: "Available", debug: "Unavailable" },
      },
    ],
    tools: [{ id: "tsc", displayName: "TypeScript compiler", kind: "external" }],
    aiProviders: [{ id: "local-echo", displayName: "Local Echo", mode: "local", capabilities: [] }],
  },
  compatibility: { node: ">=18", platforms: ["win32", "linux"] },
};

test("capability constants cover the declared MVP set", () => {
  assert.equal(ALL_CAPABILITIES.length, 15);
  assert.equal(new Set(ALL_CAPABILITIES).size, 15);
  assert.equal(CAPABILITIES.sourceEditing, "sourceEditing");
  assert.equal(CAPABILITIES.visualNodes, "visualNodes");
  assert.ok(PERMISSION_KINDS.includes("workspace"));
});

test("a valid manifest is parsed and normalized", () => {
  const result = validatePluginManifest(validManifest);
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.value?.schemaVersion, "1");
  assert.equal(result.value?.contributions?.nodes?.[0]?.definitionId, "example.echo");
  assert.equal(result.value?.contributions?.languages?.[0]?.capabilities?.completion, "Available");
});

test("missing required fields and unknown capabilities are reported", () => {
  const result = validatePluginManifest({
    schemaVersion: "2",
    id: "Bad ID",
    hostApi: "almost-0.1",
    categories: [],
    capabilities: ["visualNodes", "teleportation"],
  });
  assert.equal(result.ok, false);
  const codes = result.diagnostics.map((entry) => entry.code);
  assert.ok(codes.includes("PLUGIN_SCHEMA_UNSUPPORTED"));
  assert.ok(codes.includes("PLUGIN_ID_INVALID"));
  assert.ok(codes.includes("PLUGIN_HOST_API_RANGE_INVALID"));
  assert.ok(codes.includes("PLUGIN_CATEGORIES_EMPTY"));
  assert.ok(codes.includes("PLUGIN_CAPABILITY_UNKNOWN"));
  assert.ok(codes.some((code) => code === "PLUGIN_INVALID_FIELD"));
});

test("malformed contributions are rejected", () => {
  const result = validatePluginManifest({
    ...validManifest,
    contributions: {
      nodes: [{ definitionId: "x", version: "1.0.0", displayName: "X", category: "misc", inputs: "nope" }],
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === "PLUGIN_INVALID_FIELD"));
});

test("duplicate capabilities produce a warning but do not fail validation", () => {
  const result = validatePluginManifest({
    ...validManifest,
    capabilities: [CAPABILITIES.visualNodes, CAPABILITIES.visualNodes],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value?.capabilities, ["visualNodes"]);
  assert.equal(result.diagnostics[0]?.code, "PLUGIN_CAPABILITY_DUPLICATE");
});
