import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasErrors, lowerGraph, parseGraphDocument } from "../index.js";

function example(): ReturnType<typeof parseGraphDocument> {
  const json = JSON.parse(
    readFileSync(new URL("../../../../fixtures/graph-example.json", import.meta.url), "utf8"),
  ) as unknown;
  return parseGraphDocument(json);
}

test("lowering example graph produces minimal IR with provenance", () => {
  const loaded = example();
  assert.ok(loaded.value);
  const result = lowerGraph(loaded.value);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.value);
  assert.equal(result.value.irVersion, "0.1");
  assert.equal(result.value.id, "example.hello");
  assert.equal(result.value.functions.length, 1);

  const fn = result.value.functions[0]!;
  assert.equal(fn.id, "main");
  assert.equal(fn.returnType.name, "core.unit");
  assert.equal(fn.origin.nodeId, "start-1");
  assert.equal(fn.body[0]?.kind, "call");
  assert.deepEqual(fn.body[0]?.origin, { graphId: "example.hello", nodeId: "log-1" });
  if (fn.body[0]?.kind === "call") {
    assert.equal(fn.body[0].target, "core.console.log");
    assert.deepEqual(fn.body[0].arguments, [{ kind: "string", value: "Hello, Visulith!" }]);
  }
  assert.equal(fn.body[1]?.kind, "return");
});

test("lowering is deterministic", () => {
  const loaded = example();
  assert.ok(loaded.value);
  const first = lowerGraph(loaded.value);
  const second = lowerGraph(loaded.value);
  assert.equal(JSON.stringify(first.value), JSON.stringify(second.value));
});

test("invalid graphs do not produce IR", () => {
  const loaded = example();
  assert.ok(loaded.value);
  loaded.value.nodes.push({
    id: "orphan",
    definitionId: "visulith.core.console-log",
    definitionVersion: "0.1",
    properties: { message: "orphan" },
  });
  const result = lowerGraph(loaded.value);
  assert.equal(result.ok, false);
  assert.equal(result.value, undefined);
  assert.equal(hasErrors(result.diagnostics), true);
});
