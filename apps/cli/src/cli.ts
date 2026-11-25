import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import ts from "typescript";
import {
  createProjectManifest,
  FileProjectStore,
  type ProjectManifest,
} from "@visulith/core";
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
import { buildProject, detectNodeToolchain } from "@visulith/toolchain";

export interface CliResult {
  exitCode: number;
}

interface ParsedArguments {
  positionals: string[];
  options: Record<string, string>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const positionals: string[] = [];
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!;
    if (value.startsWith("--")) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[value.slice(2)] = next;
        index += 1;
      } else {
        options[value.slice(2)] = "true";
      }
    } else {
      positionals.push(value);
    }
  }
  return { positionals, options };
}

function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const entry of diagnostics) console.error(formatDiagnostic(entry));
}

function failure(code: string, message: string, remediation?: string): ValidationResult<GraphDocument> {
  return {
    ok: false,
    diagnostics: [{ code, severity: "error", message, ...(remediation ? { remediation } : {}) }],
  };
}

function loadGraph(graphPath: string | undefined): ValidationResult<GraphDocument> {
  if (graphPath === undefined) {
    return failure("CLI_GRAPH_PATH_MISSING", "A graph JSON file path is required.", "Usage: visulith check <graph.json>");
  }
  let text: string;
  try {
    text = readFileSync(graphPath, "utf8");
  } catch (cause) {
    return failure("CLI_GRAPH_READ_FAILED", `Cannot read "${graphPath}": ${String(cause)}`);
  }
  try {
    return parseGraphDocument(JSON.parse(text) as unknown);
  } catch (cause) {
    return failure("CLI_GRAPH_INVALID_JSON", `Invalid JSON in "${graphPath}": ${String(cause)}`);
  }
}

function writeOutput(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_");
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

function check(graphPath: string | undefined): CliResult {
  const loaded = loadGraph(graphPath);
  if (!loaded.ok || loaded.value === undefined) {
    printDiagnostics(loaded.diagnostics);
    return { exitCode: 1 };
  }
  const diagnostics = validateGraph(loaded.value);
  printDiagnostics(diagnostics);
  if (hasErrors(diagnostics)) return { exitCode: 1 };
  console.log(`Graph OK: ${loaded.value.name} (${loaded.value.nodes.length} nodes, ${loaded.value.connections.length} connections)`);
  return { exitCode: 0 };
}

function generate(graphPath: string | undefined, outPath: string | undefined): CliResult {
  const result = compileGraph(graphPath);
  printDiagnostics(result.diagnostics);
  if (result.graph === undefined || result.source === undefined) return { exitCode: 1 };

  const out = outPath ?? `out/${safeName(result.graph.id)}.ts`;
  writeOutput(out, result.source);
  const mapPath = `${out}.map.json`;
  writeOutput(mapPath, `${JSON.stringify({ version: 1, backend: "typescript", mappings: result.sourceMap }, null, 2)}\n`);
  console.log(`Generated: ${resolve(out)}`);
  console.log(`Source map: ${resolve(mapPath)} (${result.sourceMap.length} mappings)`);
  return { exitCode: 0 };
}

function run(graphPath: string | undefined, outDirPath: string | undefined): CliResult {
  const result = compileGraph(graphPath);
  printDiagnostics(result.diagnostics);
  if (result.graph === undefined || result.source === undefined) return { exitCode: 1 };

  const outDir = resolve(outDirPath ?? "out");
  const name = safeName(result.graph.id);
  const tsPath = resolve(outDir, `${name}.ts`);
  const cjsPath = resolve(outDir, `${name}.cjs`);
  writeOutput(tsPath, result.source);

  const transpiled = ts.transpileModule(result.source, {
    fileName: basename(tsPath),
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const compileErrors = (transpiled.diagnostics ?? []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
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
    const failureResult = cause as { stdout?: string; stderr?: string; status?: number | null };
    if (failureResult.stdout) process.stdout.write(failureResult.stdout);
    if (failureResult.stderr) process.stderr.write(failureResult.stderr);
    return { exitCode: failureResult.status ?? 1 };
  }
}

function projectStore(options: Record<string, string>): FileProjectStore {
  return new FileProjectStore(resolve(options.root ?? ".", "projects"));
}

async function projectCommand(args: string[], options: Record<string, string>): Promise<CliResult> {
  const [action, id] = args;
  const store = projectStore(options);
  if (action === "create") {
    if (id === undefined) {
      printDiagnostics(failure("CLI_PROJECT_ID_MISSING", "project create needs an id.").diagnostics);
      return { exitCode: 1 };
    }
    try {
      const manifest: ProjectManifest = await store.create({
        id,
        name: options.name ?? id,
        ...(options.template ? { template: options.template } : {}),
        modules: [
          { id: "main", kind: "graph", path: "main.graph.json", sourceOfTruth: "graph", build: "generate" },
        ],
      });
      console.log(`Created project ${manifest.id} (schema ${manifest.schemaVersion})`);
      return { exitCode: 0 };
    } catch (cause) {
      printDiagnostics(failure("CLI_PROJECT_CREATE_FAILED", String(cause)).diagnostics);
      return { exitCode: 1 };
    }
  }
  if (action === "list") {
    const projects = await store.list();
    for (const entry of projects) console.log(`${entry.id}\t${entry.name}\t${entry.language}`);
    return { exitCode: 0 };
  }
  if (action === "open" && id !== undefined) {
    try {
      const manifest = await store.load(id);
      console.log(JSON.stringify(manifest, null, 2));
      return { exitCode: 0 };
    } catch (cause) {
      printDiagnostics(failure("CLI_PROJECT_OPEN_FAILED", String(cause)).diagnostics);
      return { exitCode: 1 };
    }
  }
  printDiagnostics(failure("CLI_PROJECT_COMMAND_INVALID", "Usage: visulith project <create|list|open> [id]").diagnostics);
  return { exitCode: 1 };
}

async function buildCommand(graphPath: string | undefined, options: Record<string, string>): Promise<CliResult> {
  const loaded = loadGraph(graphPath);
  if (!loaded.ok || loaded.value === undefined) {
    printDiagnostics(loaded.diagnostics);
    return { exitCode: 1 };
  }
  const manifest = createProjectManifest({
    id: loaded.value.id,
    name: loaded.value.name,
    modules: [{ id: "main", kind: "graph", path: graphPath ?? "main.graph.json", sourceOfTruth: "graph", build: "generate" }],
    ...(options.out ? { outDir: options.out } : {}),
  });
  const result = await buildProject({
    projectRoot: resolve(options.root ?? "."),
    manifest,
    graph: loaded.value,
    run: options.run === "true",
  });
  printDiagnostics(result.diagnostics);
  if (result.process?.stdout) process.stdout.write(result.process.stdout);
  if (result.process?.stderr) process.stderr.write(result.process.stderr);
  console.log(result.ok ? `Build OK: ${result.outputDir}` : "Build failed");
  return { exitCode: result.ok ? 0 : 1 };
}

function toolsCommand(): CliResult {
  for (const tool of detectNodeToolchain()) {
    console.log(`${tool.id}\t${tool.available ? tool.version : "unavailable"}\t${tool.executable}`);
  }
  return { exitCode: 0 };
}

const HELP = `Visulith CLI

Usage:
  visulith check <graph.json>
  visulith generate <graph.json> [--out <file.ts>]
  visulith run <graph.json> [--out <directory>]
  visulith build <graph.json> [--root <dir>] [--out <dir>] [--run true]
  visulith project <create|list|open> [id] [--root <dir>] [--name <name>]
  visulith tools
  visulith help
`;

export async function runCli(argv: string[]): Promise<CliResult> {
  const { positionals, options } = parseArguments(argv);
  const [command, ...args] = positionals;
  switch (command) {
    case "check":
      return check(args[0]);
    case "generate":
      return generate(args[0], options.out);
    case "run":
      return run(args[0], options.out);
    case "build":
      return buildCommand(args[0], options);
    case "project":
      return projectCommand(args, options);
    case "tools":
      return toolsCommand();
    case "help":
    case undefined:
      console.log(HELP);
      return { exitCode: 0 };
    default:
      console.error(`Unknown command "${command}".\n${HELP}`);
      return { exitCode: 1 };
  }
}
