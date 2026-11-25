import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateTypeScript, lowerGraph, parseGraphDocument, unitType, type IrModule, type IrStatement } from "../index.js";

function loadGeneratedSource(): { source: string; module: IrModule } {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-branching.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  const lowered = lowerGraph(loaded.value);
  assert.ok(lowered.value);
  const generated = generateTypeScript(lowered.value);
  assert.ok(generated.source);
  return { source: generated.source, module: lowered.value };
}

test("TypeScript backend emits a typed variable and an if/else statement", () => {
  const { source } = loadGeneratedSource();
  assert.match(source, /const status: string = "yes";/);
  assert.match(source, /if \(status === "yes"\) \{/);
  assert.match(source, /console\.log\("true branch"\);/);
  assert.match(source, /console\.log\("false branch"\);/);
  assert.match(source, /\} else \{/);
});

test("source mappings include both branch nodes", () => {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-branching.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  const lowered = lowerGraph(loaded.value);
  assert.ok(lowered.value);
  const generated = generateTypeScript(lowered.value);
  const nodeIds = generated.sourceMap.map((entry) => entry.origin.nodeId);
  assert.ok(nodeIds.includes("log-true"));
  assert.ok(nodeIds.includes("log-false"));
});

test("invalid variable identifiers produce a diagnostic instead of invalid source", () => {
  const { module } = loadGeneratedSource();
  const invalid = structuredClone(module);
  const variable: IrStatement = { kind: "variable", name: "not valid", value: { kind: "string", value: "x" }, origin: module.functions[0]!.origin };
  invalid.functions[0]!.body = [variable];
  const result = generateTypeScript(invalid);
  assert.equal(result.ok, false);
  assert.equal(result.source, undefined);
  assert.ok(result.diagnostics.some((entry) => entry.code === "CODEGEN_INVALID_IDENTIFIER"));
});

test("unsupported function signatures are rejected", () => {
  const { module } = loadGeneratedSource();
  const invalid = structuredClone(module);
  invalid.functions[0]!.parameters = [{ id: "x", type: unitType() }];
  const result = generateTypeScript(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === "CODEGEN_UNSUPPORTED_SIGNATURE"));
});
