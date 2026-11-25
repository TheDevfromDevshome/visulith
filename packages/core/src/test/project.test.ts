import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createProjectManifest,
  FileProjectStore,
  PROJECT_SCHEMA_VERSION,
  validateProjectManifest,
} from "../index.js";

test("created manifests validate and round-trip through the file store", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-project-"));
  try {
    const store = new FileProjectStore(directory);
    const created = await store.create({
      id: "demo.app",
      name: "Demo",
      modules: [{ id: "main", kind: "graph", path: "main.graph.json", sourceOfTruth: "graph", build: "generate" }],
    });
    assert.equal(created.schemaVersion, PROJECT_SCHEMA_VERSION);
    const loaded = await store.load("demo.app");
    assert.deepEqual(loaded, created);

    const onDisk = JSON.parse(readFileSync(join(directory, "demo.app", "visulith.project.json"), "utf8")) as unknown;
    assert.equal(validateProjectManifest(onDisk).ok, true);

    loaded.name = "Renamed";
    await store.save(loaded);
    assert.equal((await store.load("demo.app")).name, "Renamed");
    assert.ok(readFileSync(join(directory, "demo.app", "visulith.project.json.bak"), "utf8").includes("Demo"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid manifests are rejected with structured diagnostics", () => {
  const manifest = createProjectManifest({ id: "x", name: "X" });
  const result = validateProjectManifest({ ...manifest, schemaVersion: "9.9" });
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === "PROJECT_SCHEMA_UNSUPPORTED"));
});
