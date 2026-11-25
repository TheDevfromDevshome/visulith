import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import type { ProjectManifest } from "@visulith/core";
import { generateTypeScript, lowerGraph, type Diagnostic, type GraphDocument, type SourceMapping } from "@visulith/engine";
import { runProcess } from "./process.js";
import type { ProcessResult } from "./process.js";

export interface BuildRequest {
  projectRoot: string;
  manifest: ProjectManifest;
  graph: GraphDocument;
  run?: boolean;
  signal?: AbortSignal;
}

export interface BuildResult {
  ok: boolean;
  outputDir: string;
  files: string[];
  source?: string;
  sourceMap: SourceMapping[];
  diagnostics: Diagnostic[];
  process?: ProcessResult;
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_");
}

/** Build a graph-authored module with the native TypeScript compiler API and Node runtime. */
export async function buildProject(request: BuildRequest): Promise<BuildResult> {
  const diagnostics: Diagnostic[] = [];
  const outputDir = join(request.projectRoot, request.manifest.buildProfile.outDir);
  const empty: BuildResult = { ok: false, outputDir, files: [], sourceMap: [], diagnostics };

  const lowered = lowerGraph(request.graph);
  diagnostics.push(...lowered.diagnostics);
  if (!lowered.ok || lowered.value === undefined) return empty;

  const generated = generateTypeScript(lowered.value);
  diagnostics.push(...generated.diagnostics);
  if (!generated.ok || generated.source === undefined) return { ...empty, sourceMap: generated.sourceMap };

  await mkdir(outputDir, { recursive: true });
  const name = safeName(request.manifest.modules.find((module) => module.build === "generate")?.id ?? request.graph.id);
  const tsPath = join(outputDir, `${name}.ts`);
  const cjsPath = join(outputDir, `${name}.cjs`);
  const mapPath = `${tsPath}.map.json`;

  await writeFile(tsPath, generated.source, "utf8");
  await writeFile(mapPath, `${JSON.stringify({ version: 1, backend: "typescript", mappings: generated.sourceMap }, null, 2)}\n`, "utf8");

  const transpiled = ts.transpileModule(generated.source, {
    fileName: `${name}.ts`,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  for (const entry of transpiled.diagnostics ?? []) {
    diagnostics.push({
      code: `TS${entry.code}`,
      severity: entry.category === ts.DiagnosticCategory.Error ? "error" : "warning",
      message: ts.flattenDiagnosticMessageText(entry.messageText, "\n"),
      origin: { graphId: request.graph.id },
    });
  }
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { ...empty, source: generated.source, sourceMap: generated.sourceMap, files: [tsPath, mapPath] };
  }

  await writeFile(cjsPath, transpiled.outputText, "utf8");
  const files = [tsPath, mapPath, cjsPath];
  const result: BuildResult = {
    ok: true,
    outputDir,
    files,
    source: generated.source,
    sourceMap: generated.sourceMap,
    diagnostics,
  };
  if (request.run === true) {
    result.process = await runProcess({ executable: process.execPath, args: [cjsPath], cwd: outputDir }, request.signal);
    result.ok = result.process.exitCode === 0 && result.process.diagnostics.length === 0;
    result.diagnostics.push(...result.process.diagnostics);
  }
  return result;
}
