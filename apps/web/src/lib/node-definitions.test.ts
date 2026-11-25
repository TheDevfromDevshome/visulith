import assert from "node:assert/strict";
import { test } from "node:test";
import { arePortsCompatible, getNodeDefinition, getPortDefinition, PALETTE_DEFINITIONS } from "./node-definitions";

test("palette exposes every supported core node", () => {
  const ids = PALETTE_DEFINITIONS.map((definition) => definition.definitionId);
  assert.deepEqual(ids, [
    "visulith.core.start",
    "visulith.core.console-log",
    "visulith.core.set-variable",
    "visulith.core.if",
    "visulith.core.repeat",
  ]);
});

test("branch output ports can connect to execution inputs", () => {
  const truePort = getPortDefinition("visulith.core.if", "output", "exec-true");
  const execIn = getPortDefinition("visulith.core.console-log", "input", "exec-in");
  assert.ok(truePort);
  assert.ok(execIn);
  assert.equal(arePortsCompatible(truePort, execIn), true);
});

test("data and execution ports are not compatible", () => {
  const dataPort = getPortDefinition("visulith.core.console-log", "input", "message");
  const execOut = getPortDefinition("visulith.core.start", "output", "exec-out");
  assert.ok(dataPort);
  assert.ok(execOut);
  assert.equal(arePortsCompatible(execOut, dataPort), false);
});

test("repeat body and back-edge ports follow execution semantics", () => {
  const body = getPortDefinition("visulith.core.repeat", "output", "exec-body");
  const back = getPortDefinition("visulith.core.repeat", "input", "exec-back");
  const execIn = getPortDefinition("visulith.core.console-log", "input", "exec-in");
  assert.ok(body);
  assert.ok(back);
  assert.ok(execIn);
  assert.equal(arePortsCompatible(body, execIn), true);
  assert.equal(arePortsCompatible(body, back), true);
});

test("unknown definitions and ports resolve to undefined", () => {
  assert.equal(getNodeDefinition("unknown.node"), undefined);
  assert.equal(getPortDefinition("visulith.core.if", "output", "missing"), undefined);
});
