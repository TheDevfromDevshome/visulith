import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { generateTypeScript, lowerGraph, parseGraphDocument } from "../index.js";

test("the branching graph compiles and executes the true branch under Node", () => {
  const json = JSON.parse(readFileSync(new URL("../../../../fixtures/graph-branching.json", import.meta.url), "utf8")) as unknown;
  const loaded = parseGraphDocument(json);
  assert.ok(loaded.value);
  const lowered = lowerGraph(loaded.value);
  assert.ok(lowered.value);
  const generated = generateTypeScript(lowered.value);
  assert.ok(generated.source);

  const directory = mkdtempSync(join(tmpdir(), "visulith-branching-"));
  try {
    const tsPath = join(directory, "main.ts");
    const cjsPath = join(directory, "main.cjs");
    writeFileSync(tsPath, generated.source, "utf8");
    const transpiled = ts.transpileModule(generated.source, {
      fileName: "main.ts",
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    assert.equal((transpiled.diagnostics ?? []).filter((entry) => entry.category === ts.DiagnosticCategory.Error).length, 0);
    writeFileSync(cjsPath, transpiled.outputText, "utf8");

    const stdout = execFileSync(process.execPath, [cjsPath], { cwd: directory, encoding: "utf8" });
    assert.match(stdout, /true branch/);
    assert.doesNotMatch(stdout, /false branch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
