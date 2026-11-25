import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateTypeScript,
  IR_VERSION,
  TYPES,
  unitType,
  type IrExpression,
  type IrModule,
} from "../index.js";

function moduleWithValue(value: IrExpression, type = TYPES.i32): IrModule {
  return {
    irVersion: IR_VERSION,
    id: "test.dataflow",
    functions: [
      {
        id: "main",
        parameters: [],
        returnType: unitType(),
        body: [
          { kind: "variable", name: "value", type, value, origin: { nodeId: "sum" } },
          { kind: "call", target: "core.console.log", arguments: [{ kind: "variable", name: "value" }], origin: {} },
        ],
        origin: {},
      },
    ],
  };
}

test("typed integer variables are emitted as numbers", () => {
  const generated = generateTypeScript(
    moduleWithValue({ kind: "binary", operator: "+", left: { kind: "integer", value: 2 }, right: { kind: "integer", value: 3 } }),
  );
  assert.ok(generated.source);
  assert.match(generated.source, /const value: number = 2 \+ 3;/);
  assert.match(generated.source, /console\.log\(value\);/);
  assert.deepEqual(generated.diagnostics, []);
});

test("legacy variable declarations infer string types from literals", () => {
  const ir = moduleWithValue({ kind: "string", value: "hello" });
  delete (ir.functions[0]!.body[0] as { type?: unknown }).type;
  const generated = generateTypeScript(ir);
  assert.ok(generated.source);
  assert.match(generated.source, /const value: string = "hello";/);
});

test("variables with no supported TypeScript type produce a diagnostic", () => {
  const generated = generateTypeScript(moduleWithValue({ kind: "string", value: "x" }, { kind: "external", name: "core.foo" }));
  assert.equal(generated.ok, false);
  assert.equal(generated.source, undefined);
  assert.ok(generated.diagnostics.some((entry) => entry.code === "CODEGEN_UNSUPPORTED_VARIABLE_TYPE"));
});

test("unknown binary operators are rejected instead of emitted", () => {
  const value = {
    kind: "binary",
    operator: "???",
    left: { kind: "integer", value: 1 },
    right: { kind: "integer", value: 2 },
  } as unknown as IrExpression;
  const generated = generateTypeScript(moduleWithValue(value));
  assert.equal(generated.ok, false);
  assert.ok(generated.diagnostics.some((entry) => entry.code === "CODEGEN_UNSUPPORTED_EXPRESSION"));
});

test("comparison operators keep their existing generation", () => {
  const generated = generateTypeScript(
    moduleWithValue(
      { kind: "binary", operator: "!==", left: { kind: "string", value: "a" }, right: { kind: "string", value: "b" } },
      TYPES.bool,
    ),
  );
  assert.ok(generated.source);
  assert.match(generated.source, /const value: boolean = "a" !== "b";/);
});
