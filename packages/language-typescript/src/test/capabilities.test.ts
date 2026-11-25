import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALL_TYPESCRIPT_CAPABILITIES,
  DISABLED_CAPABILITIES,
  ENABLED_CAPABILITIES,
  TYPESCRIPT_CAPABILITIES,
  TOOLCHAIN_HINTS,
  capabilityStatus,
  detectToolchain,
  type CapabilityStatus,
} from "../index.js";

const manifestPath = fileURLToPath(new URL("../../plugin.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  capabilities: string[];
  contributions?: {
    languages?: Array<{ capabilities?: Record<string, CapabilityStatus> }>;
  };
};

test("capability flags are honest", () => {
  for (const key of ["sourceEditing", "completion", "diagnostics", "formatting", "build", "run", "irExport", "visualNodes"] as const) {
    assert.equal(TYPESCRIPT_CAPABILITIES[key].enabled, true, `${key} should be enabled`);
  }
  for (const key of ["debug", "irImport", "dependencyManagement"] as const) {
    assert.equal(TYPESCRIPT_CAPABILITIES[key].enabled, false, `${key} should be disabled`);
  }
  assert.equal(capabilityStatus("debug"), "Unavailable");
  assert.equal(capabilityStatus("irImport"), "Unavailable");
  assert.equal(capabilityStatus("dependencyManagement"), "RequiresExternalTool");
  assert.equal(capabilityStatus("refactoring"), "Partial");
  assert.equal(capabilityStatus("irExport"), "Experimental");
  assert.equal(capabilityStatus("visualNodes"), "Experimental");
});

test("all five statuses are represented", () => {
  const statuses = new Set(ALL_TYPESCRIPT_CAPABILITIES.map((key) => TYPESCRIPT_CAPABILITIES[key].status));
  assert.deepEqual([...statuses].sort(), [
    "Available",
    "Experimental",
    "Partial",
    "RequiresExternalTool",
    "Unavailable",
  ]);
});

test("the declarative manifest agrees with the TS capability module", () => {
  assert.deepEqual(manifest.capabilities, [...ENABLED_CAPABILITIES]);
  assert.deepEqual(DISABLED_CAPABILITIES, ["dependencyManagement", "debug", "irImport"]);
  const declaredStatuses = manifest.contributions?.languages?.[0]?.capabilities ?? {};
  for (const key of ALL_TYPESCRIPT_CAPABILITIES) {
    assert.equal(declaredStatuses[key], capabilityStatus(key), `status mismatch for ${key}`);
  }
});

test("toolchain detection hints are declarative and deterministic", () => {
  assert.deepEqual(TOOLCHAIN_HINTS.map((hint) => hint.id), ["node", "tsc", "npm"]);
  assert.deepEqual(detectToolchain(["node", "npm"]).map((tool) => [tool.id, tool.present]), [
    ["node", true],
    ["npm", true],
    ["tsc", false],
  ]);
  assert.match(detectToolchain(["node"])[2]?.hint ?? "", /not detected/);
});
