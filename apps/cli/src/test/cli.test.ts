import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../cli.js";

const examplePath = fileURLToPath(new URL("../../../../fixtures/graph-example.json", import.meta.url));
const branchingPath = fileURLToPath(new URL("../../../../fixtures/graph-branching.json", import.meta.url));
const joinPath = fileURLToPath(new URL("../../../../fixtures/graph-join.json", import.meta.url));
const loopPath = fileURLToPath(new URL("../../../../fixtures/graph-loop.json", import.meta.url));
const dataflowPath = fileURLToPath(new URL("../../../../fixtures/graph-dataflow.json", import.meta.url));

test("CLI check accepts the example graph", async () => {
  assert.equal((await runCli(["check", examplePath])).exitCode, 0);
});

test("CLI generates source and a source map", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-"));
  try {
    const out = join(directory, "hello.ts");
    assert.equal((await runCli(["generate", examplePath, "--out", out])).exitCode, 0);
    assert.match(readFileSync(out, "utf8"), /Hello, Visulith!/);
    const map = JSON.parse(readFileSync(`${out}.map.json`, "utf8")) as { mappings: unknown[] };
    assert.ok(map.mappings.length > 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI run executes the generated program", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-run-"));
  try {
    assert.equal((await runCli(["run", examplePath, "--out", directory])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI generates and runs the branching graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-branching-"));
  try {
    const out = join(directory, "branching.ts");
    assert.equal((await runCli(["generate", branchingPath, "--out", out])).exitCode, 0);
    const source = readFileSync(out, "utf8");
    assert.match(source, /const status: string = "yes";/);
    assert.match(source, /if \(status === "yes"\)/);
    assert.equal((await runCli(["run", branchingPath, "--out", directory])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI generates and runs the reconverging graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-join-"));
  try {
    const out = join(directory, "join.ts");
    assert.equal((await runCli(["generate", joinPath, "--out", out])).exitCode, 0);
    const source = readFileSync(out, "utf8");
    assert.match(source, /console\.log\("joined"\);/);
    assert.equal(source.indexOf('console.log("joined");'), source.lastIndexOf('console.log("joined");'));
    assert.equal((await runCli(["run", joinPath, "--out", directory])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI generates and runs the repeat graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-loop-"));
  try {
    const out = join(directory, "loop.ts");
    assert.equal((await runCli(["generate", loopPath, "--out", out])).exitCode, 0);
    assert.match(readFileSync(out, "utf8"), /__visulith_loop_0 < 3/);
    assert.equal((await runCli(["run", loopPath, "--out", directory])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI generates and runs the dataflow graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-dataflow-"));
  try {
    assert.equal((await runCli(["check", dataflowPath])).exitCode, 0);
    const out = join(directory, "dataflow.ts");
    assert.equal((await runCli(["generate", dataflowPath, "--out", out])).exitCode, 0);
    assert.match(readFileSync(out, "utf8"), /const __visulith_df_0_sum: number = 2 \+ 3;/);
    assert.equal((await runCli(["run", dataflowPath, "--out", directory])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI project create and list work in an isolated root", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-project-"));
  try {
    assert.equal((await runCli(["project", "create", "demo", "--root", directory, "--name", "Demo"])).exitCode, 0);
    assert.equal((await runCli(["project", "list", "--root", directory])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI build compiles and runs the example graph", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-cli-build-"));
  try {
    assert.equal((await runCli(["build", examplePath, "--root", directory, "--run", "true"])).exitCode, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
