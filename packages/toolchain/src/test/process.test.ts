import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTool, runProcess } from "../index.js";

test("runProcess reports a structured timeout diagnostic", async () => {
  const result = await runProcess({
    executable: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    cwd: process.cwd(),
    timeoutMs: 100,
  });
  assert.equal(result.exitCode, 124);
  assert.equal(result.cancelled, true);
  assert.ok(result.diagnostics.some((entry) => entry.code === "PROCESS_TIMEOUT"));
});

test("runProcess honours an abort signal", async () => {
  const controller = new AbortController();
  const pending = runProcess(
    {
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: process.cwd(),
    },
    controller.signal,
  );
  controller.abort();
  const result = await pending;
  assert.equal(result.exitCode, 130);
  assert.equal(result.cancelled, true);
  assert.ok(result.diagnostics.some((entry) => entry.code === "PROCESS_CANCELLED"));
});

test("tool detection reports missing tools without throwing", () => {
  const missing = detectTool("does-not-exist", "visulith-nonexistent-executable");
  assert.equal(missing.available, false);
  assert.ok(missing.diagnostics.some((entry) => entry.code === "TOOLCHAIN_TOOL_MISSING"));
});
