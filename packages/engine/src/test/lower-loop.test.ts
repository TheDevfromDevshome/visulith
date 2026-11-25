import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  generateTypeScript,
  lowerGraph,
  parseGraphDocument,
  type GraphDocument,
  type IrCallStatement,
  type IrLoop,
} from "../index.js";

function loadLoopGraph(): GraphDocument {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-loop.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return JSON.parse(JSON.stringify(loaded.value)) as GraphDocument;
}

test("lowering emits a loop statement with a body and provenance", () => {
  const result = lowerGraph(loadLoopGraph());
  assert.ok(result.value);
  const body = result.value.functions[0]?.body ?? [];
  assert.deepEqual(body.map((statement) => statement.kind), ["loop", "call", "return"]);

  const loop = body[0] as IrLoop;
  assert.deepEqual(loop.count, { kind: "integer", value: 3 });
  assert.deepEqual(loop.origin, { graphId: "example.loop", nodeId: "repeat-1" });
  assert.equal(loop.body.length, 1);
  assert.equal((loop.body[0] as IrCallStatement).origin.nodeId, "log-body");
  assert.equal((body[1] as IrCallStatement).origin.nodeId, "log-done");
});

test("source mappings order the loop header before its body and continuation", () => {
  const lowered = lowerGraph(loadLoopGraph());
  assert.ok(lowered.value);
  const generated = generateTypeScript(lowered.value);
  assert.ok(generated.source);
  const line = (nodeId: string): number | undefined =>
    generated.sourceMap.find((entry) => entry.origin.nodeId === nodeId)?.generatedLine;
  const header = line("repeat-1");
  const body = line("log-body");
  const done = line("log-done");
  assert.ok(header !== undefined && body !== undefined && done !== undefined);
  assert.ok(header < body && body < done);
  assert.match(generated.source, /for \(let __visulith_loop_0 = 0; __visulith_loop_0 < 3; __visulith_loop_0\+\+\)/);
});

test("counts that are not positive integers produce diagnostics instead of IR", () => {
  for (const count of [0, -2, 1.5]) {
    const graph = loadLoopGraph();
    const repeat = graph.nodes.find((node) => node.id === "repeat-1");
    assert.ok(repeat);
    repeat.properties["count"] = count;
    const result = lowerGraph(graph);
    assert.equal(result.ok, false, `count ${count} must be rejected`);
    assert.equal(result.value, undefined);
    assert.ok(result.diagnostics.some((entry) => entry.code === "IR_LOOP_COUNT_INVALID"));
  }
});
