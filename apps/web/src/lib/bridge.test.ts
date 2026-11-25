import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseGraphDocument } from "@visulith/engine";
import { DesktopBridge, WebBridge } from "./bridge";

interface InvokeCall {
  command: string;
  args: Record<string, unknown>;
}

function loadFixture(name: string) {
  const json = JSON.parse(readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  return loaded.value;
}

test("desktop bridge writes generated code before invoking the scoped runner", async () => {
  const calls: InvokeCall[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
    const current = { command, args: args ?? {} };
    calls.push(current);
    if (command === "write_file") return null;
    if (command === "run_program") return { exit_code: 0, stdout: "Hello, Visulith!\n", stderr: "" };
    return undefined;
  };
  Object.defineProperty(globalThis, "window", {
    value: { __TAURI__: { invoke } },
    configurable: true,
    writable: true,
  });
  try {
    const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-example.json", import.meta.url), "utf8")) as unknown;
    const loaded = parseGraphDocument(json);
    assert.ok(loaded.value);

    const result = await new DesktopBridge().runProgram({ graph: loaded.value });
    assert.equal(result.mode, "desktop");
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /Hello, Visulith!/);
    assert.deepEqual(
      calls.map((call) => call.command),
      ["write_file", "run_program"],
    );
    assert.match(String(calls[0]?.args["relative"]), /^out\/example\.hello\.ts$/);
    assert.equal(calls[1]?.args["relative"], calls[0]?.args["relative"]);
    assert.equal(calls[1]?.args["executable"], null);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test("desktop bridge falls back to a labelled preview when IPC is unavailable", async () => {
  const bridge = new DesktopBridge();
  const result = await bridge.runProgram({ graph: loadFixture("graph-example.json") });
  assert.equal(result.mode, "browser-preview");
  assert.match(result.note, /no child process/);
});

test("browser preview interprets a taken branch and its join", async () => {
  const result = await new WebBridge().runProgram({ graph: loadFixture("graph-join.json") });
  assert.equal(result.mode, "browser-preview");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output.trim().split(/\r?\n/), ["true branch", "joined"]);
});

test("browser preview interprets a repeat loop", async () => {
  const result = await new WebBridge().runProgram({ graph: loadFixture("graph-loop.json") });
  assert.equal(result.mode, "browser-preview");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.output.trim().split(/\r?\n/), ["tick", "tick", "tick", "done"]);
});
