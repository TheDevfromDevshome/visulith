import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createProjectManifest } from "@visulith/core";
import { parseGraphDocument } from "@visulith/engine";
import { buildProject, detectTool, runProcess } from "../index.js";

const graph = JSON.parse(
  readFileSync(new URL("../../../../fixtures/graph-example.json", import.meta.url), "utf8"),
) as unknown;

test("buildProject generates, compiles and runs the example graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-build-"));
  try {
    const manifest = createProjectManifest({
      id: "example.app",
      name: "Example",
      modules: [{ id: "main", kind: "graph", path: "main.graph.json", sourceOfTruth: "graph", build: "generate" }],
    });
    const loaded = parseGraphDocument(graph);
    assert.ok(loaded.value);
    const result = await buildProject({ projectRoot: directory, manifest, graph: loaded.value, run: true });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.files.length, 3);
    assert.match(result.process?.stdout ?? "", /Hello, Visulith!/);
    assert.ok(result.sourceMap.length > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runProcess returns structured output and exit codes", async () => {
  const result = await runProcess({ executable: process.execPath, args: ["-e", "process.stdout.write('ok')"], cwd: process.cwd() });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "ok");
});

test("tool detection reports availability without throwing", () => {
  const node = detectTool("node", "node");
  assert.equal(node.available, true);
  assert.ok(node.version);
});
