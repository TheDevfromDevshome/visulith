import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandBus, createProjectManifest, normalizeSettings, WorkspaceService } from "../index.js";

test("workspace tracks open projects, active project and tabs", () => {
  const workspace = new WorkspaceService();
  const project = createProjectManifest({ id: "a", name: "A" });
  workspace.open(project);
  assert.equal(workspace.getActive()?.id, "a");
  workspace.openTab("a", { id: "main", kind: "graph", title: "Main" });
  workspace.openTab("a", { id: "main", kind: "graph", title: "Main" });
  assert.equal(workspace.listTabs("a").length, 1);
  workspace.closeTab("a", "main");
  assert.equal(workspace.listTabs("a").length, 0);
  workspace.close("a");
  assert.equal(workspace.getActive(), undefined);
});

test("command bus returns correlation ids and structured failures", async () => {
  const bus = new CommandBus();
  bus.register({ id: "echo", handler: (input: string) => input.toUpperCase() });
  const success = await bus.execute<string, string>("echo", "hello", "fixed-id");
  assert.equal(success.correlationId, "fixed-id");
  assert.equal(success.output, "HELLO");

  const unknown = await bus.execute("missing", undefined);
  assert.equal(unknown.diagnostics[0]?.code, "COMMAND_UNKNOWN");

  bus.register({
    id: "fail",
    handler: () => {
      throw new Error("boom");
    },
  });
  const failure = await bus.execute("fail", undefined);
  assert.equal(failure.diagnostics[0]?.code, "COMMAND_FAILED");
});

test("settings are clamped to supported values", () => {
  assert.equal(normalizeSettings({ textScale: 9 }).textScale, 1.5);
  assert.equal(normalizeSettings({ theme: "light", contrast: "high" }).contrast, "high");
});
