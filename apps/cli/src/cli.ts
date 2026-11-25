import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import ts from "typescript";
import {
  formatDiagnostic,
  generateTypeScript,
  hasErrors,
  lowerGraph,
  parseGraphDocument,
  validateGraph,
  type Diagnostic,
  type GraphDocument,
  type SourceMapping,
  type ValidationResult,
} from "@visulith/engine";

export interface CliResult {
  exitCode: number;
}

interface Arguments {
  command?: string;
  graphPath?: string;
  out?: string;
}

function parseArguments(argv: string[]): Arguments {
  const outIndex = argv.indexOf("--out");
  const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  const positional = outIndex >= 0 ? argv.filter((_, index) => index !== outIndex && index !== outIndex + 1) : argv;
  return { command: positional[0], graphPath: positional[1], out };
}

function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const entry of diagnostics) console.error(formatDiagnostic(entry));
}

function loadGraph(graphPath: string | undefined): ValidationResult<GraphDocument> {
  if (graphPath === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "CLI_GRAPH_PATH_MISSING",
          severity: "error",
          message: "A graph JSON file path is required.",
          remediation: "Usage: visulith <check|generate|run> <graph.json> [--out <path>]",
        },
      ],
    };
  }
  let text: string;
  try {
    text = readFileSync(graphPath, "utf8");
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        { code: "CLI_GRAPH_READ_FAILED", severity: "error", message: `Cannot read "${graphPath}": ${String(cause)}` },
      ],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return {
      ok: false,
      diagnostics: [
        { code: "CLI_GRAPH_INVALID_JSON", severity: "error", message: `Invalid JSON in "${graphPath}": ${String(cause)}` },
      ],
    };
  }
  return parseGraphDocument(parsed);
}

function writeOutput(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function safeName(graph: GraphDocument): string {
  return graph.id.replace(/[^A-Za-z0-9_.-]+/g, "_");
}

function check(graphPath: string | undefined): CliResult {
  const loaded = loadGraph(graphPath);
  if (!loaded.ok || loaded.value === undefined) {
    printDiagnostics(loaded.diagnostics);
    return { exitCode: 1 };
  }
  const diagnostics = validateGraph(loaded.value);
  printDiagnostics(diagnostics);
  if (hasErrors(diagnostics)) return { exitCode: 1 };
  console.log(
    `Graph OK: ${loaded.value.name} (${loaded.value.nodes.length} nodes, ${loaded.value.connections.length} connections)`,
  );
  return { exitCode: 0 };
}

interface Compilation {
  graph?: GraphDocument;
  source?: string;
  sourceMap: SourceMapping[];
  diagnostics: Diagnostic[];
}

function compileGraph(graphPath: string | undefined): Compilation {
  const loaded = loadGraph(graphPath);
  if (!loaded.ok || loaded.value === undefined) return { sourceMap: [], diagnostics: loaded.diagnostics };
  const lowered = lowerGraph(loaded.value);
  if (!lowered.ok || lowered.value === undefined) return { sourceMap: [], diagnostics: lowered.diagnostics };
  const generated = generateTypeScript(lowered.value);
  if (!generated.ok || generated.source === undefined) {
    return { sourceMap: generated.sourceMap, diagnostics: generated.diagnostics };
  }
  return {
    graph: loaded.value,
    source: generated.source,
    sourceMap: generated.sourceMap,
    diagnostics: [...loaded.diagnostics, ...lowered.diagnostics, ...generated.diagnostics],
  };
}

function generate(graphPath: string | undefined, outPath: string | undefined): CliResult {
  const result = compileGraph(graphPath);
  printDiagnostics(result.diagnostics);
  if (result.graph === undefined || result.source === undefined) return { exitCode: 1 };

  const out = outPath ?? `out/${safeName(result.graph)}.ts`;
  writeOutput(out, result.source);
  const mapPath = `${out}.map.json`;
  writeOutput(
    mapPath,
    `${JSON.stringify({ version: 1, backend: "typescript", mappings: result.sourceMap }, null, 2)}\n`,
  );
  console.log(`Generated: ${resolve(out)}`);
  console.log(`Source map: ${resolve(mapPath)} (${result.sourceMap.length} mappings)`);
  return { exitCode: 0 };
}

function run(graphPath: string | undefined, outDirPath: string | undefined): CliResult {
  const result = compileGraph(graphPath);
  printDiagnostics(result.diagnostics);
  if (result.graph === undefined || result.source === undefined) return { exitCode: 1 };

  const outDir = resolve(outDirPath ?? "out");
  const name = safeName(result.graph);
  const tsPath = resolve(outDir, `${name}.ts`);
  const cjsPath = resolve(outDir, `${name}.cjs`);
  writeOutput(tsPath, result.source);

  const transpiled = ts.transpileModule(result.source, {
    fileName: basename(tsPath),
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });
  const compileErrors = (transpiled.diagnostics ?? []).filter(
    (entry) => entry.category === ts.DiagnosticCategory.Error,
  );
  if (compileErrors.length > 0) {
    for (const entry of compileErrors) {
      console.error(`ERROR TS${entry.code}: ${ts.flattenDiagnosticMessageText(entry.messageText, "\n")}`);
    }
    return { exitCode: 1 };
  }
  writeOutput(cjsPath, transpiled.outputText);

  try {
    const stdout = execFileSync(process.execPath, [cjsPath], { cwd: outDir, encoding: "utf8" });
    console.log("Program output:");
    process.stdout.write(stdout);
    return { exitCode: 0 };
  } catch (cause) {
    const failure = cause as { stdout?: string; stderr?: string; status?: number | null };
    if (failure.stdout) process.stdout.write(failure.stdout);
    if (failure.stderr) process.stderr.write(failure.stderr);
    return { exitCode: failure.status ?? 1 };
  }
}

const HELP = `Visulith CLI (Phase 0 proof of concept)

Usage:
  visulith check <graph.json>
  visulith generate <graph.json> [--out <file.ts>]
  visulith run <graph.json> [--out <directory>]
`;

export function runCli(argv: string[]): CliResult {
  const { command, graphPath, out } = parseArguments(argv);
  switch (command) {
    case "check":
      return check(graphPath);
    case "generate":
      return generate(graphPath, out);
    case "run":
      return run(graphPath, out);
    case "help":
    case undefined:
      console.log(HELP);
      return { exitCode: 0 };
    default:
      console.error(`Unknown command "${command}".\n${HELP}`);
      return { exitCode: 1 };
  }
}
