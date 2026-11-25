import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectPackage, tsTypeToRef } from "../index.js";

const fixtureDirectory = fileURLToPath(new URL("../../../../fixtures/templates/sample-package", import.meta.url));

test("npm declarations become best-effort node contributions", () => {
  const result = inspectPackage(fixtureDirectory);
  assert.equal(result.partial, true);
  assert.equal(result.packageName, "@example/math-tools");
  assert.equal(result.version, "1.2.0");
  assert.deepEqual(result.sourceFiles, ["types/index.d.ts"]);
  assert.equal(result.diagnostics.length, 0);

  const ids = result.nodes.map((node) => node.definitionId);
  assert.deepEqual(ids, [
    "npm.example-math-tools.add",
    "npm.example-math-tools.Calculator",
    "npm.example-math-tools.Calculator.add",
    "npm.example-math-tools.Calculator.reset",
    "npm.example-math-tools.greet",
  ]);

  const add = result.nodes.find((node) => node.definitionId === "npm.example-math-tools.add");
  assert.deepEqual(add?.inputs.map((port) => port.type.name), ["core.f64", "core.f64"]);
  assert.deepEqual(add?.outputs.map((port) => port.type.name), ["core.f64"]);
  assert.ok(add?.capabilities.includes("best-effort"));
  assert.ok(add?.capabilities.includes("partial"));
  assert.match(add?.description ?? "", /Best-effort contribution inferred from types\/index\.d\.ts/);

  const reset = result.nodes.find((node) => node.definitionId === "npm.example-math-tools.Calculator.reset");
  assert.deepEqual(reset?.outputs, []);
});

test("manual adapter overrides patch generated nodes and can exclude them", () => {
  const patched = inspectPackage(fixtureDirectory);
  const greet = patched.nodes.find((node) => node.definitionId === "npm.example-math-tools.greet");
  assert.equal(greet?.displayName, "Greeting");
  assert.equal(greet?.description, "Manually reviewed adapter override.");

  const directory = mkdtempSync(join(tmpdir(), "visulith-npm-adapter-"));
  try {
    copyFileSync(join(fixtureDirectory, "package.json"), join(directory, "package.json"));
    mkdirSync(join(directory, "types"), { recursive: true });
    copyFileSync(join(fixtureDirectory, "types", "index.d.ts"), join(directory, "types", "index.d.ts"));
    mkdirSync(join(directory, "adapters"), { recursive: true });
    writeFileSync(
      join(directory, "adapters", "nodes.json"),
      JSON.stringify({ schemaVersion: "0.1", overrides: [{ definitionId: "npm.example-math-tools.add", exclude: true }] }),
    );
    const result = inspectPackage(directory);
    assert.equal(result.nodes.some((node) => node.definitionId === "npm.example-math-tools.add"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("TypeScript type mapping is deliberately conservative", () => {
  assert.deepEqual(tsTypeToRef("string"), { kind: "primitive", name: "core.string" });
  assert.deepEqual(tsTypeToRef("Promise<number>"), { kind: "primitive", name: "core.f64" });
  assert.deepEqual(tsTypeToRef("string[]"), { kind: "array", name: "core.string" });
  assert.deepEqual(tsTypeToRef("void"), { kind: "primitive", name: "core.unit" });
  assert.deepEqual(tsTypeToRef("Map<string, number>"), { kind: "external", name: "Map<string, number>" });
});

test("unsupported signatures produce a structured diagnostic instead of being silently skipped", () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-npm-unsupported-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "complex-lib", version: "1.0.0" }));
    mkdirSync(join(directory, "dist"), { recursive: true });
    writeFileSync(
      join(directory, "dist", "index.d.ts"),
      "export declare function simple(value: string): string;\nexport declare function generic<T>(value: T): T;\n",
    );
    const result = inspectPackage(directory);
    assert.equal(result.nodes.some((node) => node.definitionId === "npm.complex-lib.simple"), true);
    assert.equal(result.nodes.some((node) => node.definitionId === "npm.complex-lib.generic"), false);
    assert.ok(result.diagnostics.some((entry) => entry.code === "NPM_SIGNATURE_PARTIAL"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an unknown package version is reported instead of silently defaulted", () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-npm-version-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "versionless-lib" }));
    mkdirSync(join(directory, "types"), { recursive: true });
    writeFileSync(join(directory, "types", "index.d.ts"), "export declare function ping(): void;\n");
    const result = inspectPackage(directory);
    assert.equal(result.version, undefined);
    assert.equal(result.nodes[0]?.version, "unknown");
    assert.ok(result.diagnostics.some((entry) => entry.code === "NPM_VERSION_MISSING"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a missing package directory is reported rather than throwing", () => {
  const result = inspectPackage(join(tmpdir(), "visulith-no-such-package"));
  assert.deepEqual(result.nodes, []);
  assert.equal(result.partial, true);
  assert.ok(result.diagnostics.some((entry) => entry.code === "NPM_PACKAGE_JSON_MISSING"));
  assert.ok(result.diagnostics.some((entry) => entry.code === "NPM_DECLARATIONS_MISSING"));
});
