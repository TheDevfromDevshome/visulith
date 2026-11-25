import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateTypeScript, hasErrors, lowerGraph, parseGraphDocument, type IrModule } from "../index.js";

function exampleIr(): IrModule {
  const json = JSON.parse(
    readFileSync(new URL("../../../../fixtures/graph-example.json", import.meta.url), "utf8"),
  ) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  const lowered = lowerGraph(loaded.value);
  assert.ok(lowered.value);
  return lowered.value;
}

test("TypeScript backend emits deterministic source", () => {
  const ir = exampleIr();
  const first = generateTypeScript(ir);
  const second = generateTypeScript(ir);
  assert.equal(first.ok, true, JSON.stringify(first.diagnostics));
  assert.equal(first.source, second.source);
  assert.ok(first.source?.includes('console.log("Hello, Visulith!");'));
  assert.ok(first.source?.includes("function main(): void {"));
  assert.ok(first.source?.includes("main();"));
});

test("source mapping points generated lines at graph nodes", () => {
  const generated = generateTypeScript(exampleIr());
  assert.ok(generated.source);
  const callMapping = generated.sourceMap.find((entry) => entry.origin.nodeId === "log-1");
  assert.ok(callMapping);
  const lines = generated.source.split("\n");
  assert.equal(lines[callMapping.generatedLine - 1]?.trim(), 'console.log("Hello, Visulith!");');
  assert.equal(callMapping.generatedColumn, 3);
});

test("unsupported IR versions produce structured diagnostics", () => {
  const ir = exampleIr();
  const result = generateTypeScript({ ...ir, irVersion: "9.9" });
  assert.equal(result.ok, false);
  assert.equal(hasErrors(result.diagnostics), true);
  assert.ok(result.diagnostics.some((entry) => entry.code === "CODEGEN_IR_VERSION_UNSUPPORTED"));
});

test("unsupported call targets are never silently emitted", () => {
  const ir = exampleIr();
  const fn = ir.functions[0]!;
  fn.body[0] = {
    kind: "call",
    target: "unknown.target",
    arguments: [],
    origin: { graphId: ir.id, nodeId: "log-1" },
  };
  const result = generateTypeScript(ir);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === "CODEGEN_UNSUPPORTED_CALL"));
  assert.equal(result.source, undefined);
});
