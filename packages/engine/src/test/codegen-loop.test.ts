import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateTypeScript,
  IR_VERSION,
  unitType,
  type IrExpression,
  type IrLoop,
  type IrModule,
} from "../index.js";

function moduleWithLoop(count: IrExpression): IrModule {
  const loop: IrLoop = { kind: "loop", count, body: [], origin: { nodeId: "repeat-1" } };
  return {
    irVersion: IR_VERSION,
    id: "test.loop",
    functions: [
      { id: "main", parameters: [], returnType: unitType(), body: [loop], origin: {} },
    ],
  };
}

test("nested loops receive distinct generated counter names", () => {
  const inner: IrLoop = { kind: "loop", count: { kind: "integer", value: 2 }, body: [], origin: {} };
  const outer: IrLoop = { kind: "loop", count: { kind: "integer", value: 3 }, body: [inner], origin: {} };
  const ir: IrModule = {
    irVersion: IR_VERSION,
    id: "test.nested-loop",
    functions: [{ id: "main", parameters: [], returnType: unitType(), body: [outer], origin: {} }],
  };
  const generated = generateTypeScript(ir);
  assert.ok(generated.source);
  assert.match(generated.source, /__visulith_loop_0 < 3/);
  assert.match(generated.source, /__visulith_loop_1 < 2/);
  assert.deepEqual(generated.diagnostics, []);
});

test("an unsupported loop count produces a diagnostic instead of source", () => {
  const ir = moduleWithLoop({ kind: "unsupported" } as unknown as IrExpression);
  const generated = generateTypeScript(ir);
  assert.equal(generated.ok, false);
  assert.equal(generated.source, undefined);
  assert.ok(generated.diagnostics.some((entry) => entry.code === "CODEGEN_UNSUPPORTED_LOOP_COUNT"));
});
