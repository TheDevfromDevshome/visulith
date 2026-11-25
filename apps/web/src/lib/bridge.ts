import {
  CORE_CONSOLE_LOG,
  CORE_START,
  formatDiagnostic,
  generateTypeScript,
  lowerGraph,
  parseGraphDocument,
  validateGraph as validateGraphDocument,
} from "@visulith/engine";
import type { Diagnostic, GraphDocument, IrExpression, IrStatement } from "@visulith/engine";
import { addConnection, addNodeToGraph, createEmptyGraph, updateNodeProperties } from "./graph";
import { describeGraphChange } from "./diff";
import type {
  AIProvider,
  Bridge,
  ChangeProposal,
  ChangeProposalRequest,
  GeneratedCode,
  PluginManifest,
  ProjectManifest,
  ProjectModule,
  ProjectSummary,
  RunRequest,
  RunResult,
  TauriInvoke,
  TemplateDescriptor,
} from "./types";

export type { Bridge } from "./types";

const PROJECTS_KEY = "visulith.projects.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isProjectModule(value: unknown): value is ProjectModule {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["name"] === "string" &&
    (value["kind"] === "graph" || value["kind"] === "source")
  );
}

function isProjectManifest(value: unknown): value is ProjectManifest {
  return (
    isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["name"] === "string" &&
    Array.isArray(value["modules"]) &&
    value["modules"].every(isProjectModule)
  );
}

function exampleGraph(): GraphDocument {
  return {
    schemaVersion: "0.1",
    id: "example.hello",
    kind: "structured-flow",
    name: "Hello Visulith",
    nodes: [
      {
        id: "start-1",
        definitionId: CORE_START.definitionId,
        definitionVersion: CORE_START.version,
        position: { x: 100, y: 100 },
        properties: {},
      },
      {
        id: "log-1",
        definitionId: CORE_CONSOLE_LOG.definitionId,
        definitionVersion: CORE_CONSOLE_LOG.version,
        position: { x: 100, y: 260 },
        properties: { message: "Hello, Visulith!" },
      },
    ],
    connections: [
      {
        id: "edge-1",
        source: { nodeId: "start-1", portId: "exec-out" },
        target: { nodeId: "log-1", portId: "exec-in" },
        kind: "execution",
      },
    ],
  };
}

function seedProject(): ProjectManifest {
  return {
    schemaVersion: "0.1",
    id: "example-project",
    name: "Example project",
    modules: [{ id: "main", kind: "graph", name: "main.graph", graph: exampleGraph() }],
  };
}

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readProjects(): ProjectManifest[] {
  const store = storage();
  if (store === undefined) return [seedProject()];
  try {
    const raw = store.getItem(PROJECTS_KEY);
    if (raw === null) return [seedProject()];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [seedProject()];
    const projects = parsed.filter(isProjectManifest);
    return projects.length > 0 ? projects : [seedProject()];
  } catch {
    return [seedProject()];
  }
}

function writeProjects(projects: readonly ProjectManifest[]): void {
  storage()?.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function generated(diagnostics: Diagnostic[]): GeneratedCode {
  return {
    code: "",
    sourceMap: [],
    diagnostics,
    diagnosticText: diagnostics.map((entry) => formatDiagnostic(entry)),
  };
}

type PreviewValue = string | number | boolean;

interface PreviewState {
  variables: Map<string, PreviewValue>;
  lines: string[];
  steps: number;
  limitReached: boolean;
}

const PREVIEW_STEP_LIMIT = 10_000;

function previewValue(expression: IrExpression, variables: ReadonlyMap<string, PreviewValue>): PreviewValue | undefined {
  switch (expression.kind) {
    case "string":
      return expression.value;
    case "integer":
    case "float":
      return expression.value;
    case "boolean":
      return expression.value;
    case "variable":
      return variables.get(expression.name);
    case "binary": {
      const left = previewValue(expression.left, variables);
      const right = previewValue(expression.right, variables);
      if (left === undefined || right === undefined) return undefined;
      if (expression.operator === "+") {
        return typeof left === "number" && typeof right === "number" ? left + right : undefined;
      }
      return expression.operator === "===" ? left === right : left !== right;
    }
    default:
      return undefined;
  }
}

/** Interpret the engine IR in-process. No compiler and no child process are started. */
function previewStatements(statements: readonly IrStatement[], state: PreviewState): void {
  for (const statement of statements) {
    state.steps += 1;
    if (state.steps > PREVIEW_STEP_LIMIT) {
      state.limitReached = true;
      return;
    }
    if (statement.kind === "call") {
      if (statement.target === "core.console.log") {
        const value = previewValue(statement.arguments[0] ?? { kind: "string", value: "" }, state.variables);
        state.lines.push(String(value ?? ""));
      }
      continue;
    }
    if (statement.kind === "variable") {
      const value = previewValue(statement.value, state.variables);
      if (value !== undefined) state.variables.set(statement.name, value);
      continue;
    }
    if (statement.kind === "conditional") {
      const branch = previewValue(statement.condition, state.variables) === true ? statement.thenBody : statement.elseBody;
      previewStatements(branch, state);
      continue;
    }
    if (statement.kind === "loop") {
      const count = previewValue(statement.count, state.variables);
      if (typeof count === "number" && Number.isInteger(count) && count > 0) {
        for (let iteration = 0; iteration < count; iteration += 1) {
          previewStatements(statement.body, state);
          if (state.limitReached) return;
        }
      }
      continue;
    }
    if (statement.kind === "return") return;
  }
}

function previewExecution(graph: GraphDocument): { output: string; diagnostics: Diagnostic[] } {
  const lowered = lowerGraph(graph);
  if (lowered.value === undefined) return { output: "", diagnostics: lowered.diagnostics };
  const state: PreviewState = { variables: new Map(), lines: [], steps: 0, limitReached: false };
  previewStatements(lowered.value.functions[0]?.body ?? [], state);
  const output = `${state.lines.map((line) => `${line}\n`).join("")}${state.limitReached ? `[preview stopped after ${PREVIEW_STEP_LIMIT} steps]\n` : ""}`;
  return { output, diagnostics: lowered.diagnostics };
}

function templates(): TemplateDescriptor[] {
  const hello = exampleGraph();
  const twoStep = addNodeToGraph(
    clone(hello),
    CORE_CONSOLE_LOG.definitionId,
    { x: 100, y: 420 },
    "log-2",
  );
  const twoStepConnected = addConnection(
    updateNodeProperties(twoStep, "log-2", { message: "Second step complete" }),
    { source: "log-1", target: "log-2", sourceHandle: "exec-out", targetHandle: "exec-in" },
    "execution",
  );
  return [
    {
      id: "hello-console",
      name: "Hello Console",
      description: "Start node connected to a single console-log node.",
      category: "starter",
      graph: hello,
    },
    {
      id: "two-step-console",
      name: "Two-step Console",
      description: "Two console-log nodes chained on the execution port.",
      category: "starter",
      graph: twoStepConnected,
    },
    {
      id: "blank-flow",
      name: "Blank Flow",
      description: "Only a start node; build the graph yourself.",
      category: "blank",
      graph: createEmptyGraph("blank.flow", "Blank flow"),
    },
  ];
}

function plugins(): PluginManifest[] {
  return [
    {
      id: "visulith.core.flow",
      name: "Core flow definitions",
      version: "0.1",
      description: "Built-in start and console-log node definitions.",
      categories: ["core", "nodes"],
      capabilities: ["graph.validate", "ir.lower", "codegen.typescript"],
      permissions: [],
      enabled: true,
    },
    {
      id: "visulith.local.projects",
      name: "Local projects",
      version: "0.1",
      description: "Reads and writes project manifests through the bridge.",
      categories: ["storage"],
      capabilities: ["project.read", "project.write", "template.list"],
      permissions: ["fs.read:project", "fs.write:project"],
      enabled: true,
    },
    {
      id: "visulith.ai.local",
      name: "Local AI heuristic",
      version: "0.1",
      description: "Proposes conservative graph edits without network access.",
      categories: ["ai"],
      capabilities: ["ai.propose"],
      permissions: [],
      enabled: true,
    },
  ];
}

function providers(): AIProvider[] {
  return [
    { id: "local-heuristic", name: "Local heuristic", kind: "local", description: "Deterministic, offline suggestions." },
    { id: "ollama", name: "Ollama (local server)", kind: "local", description: "Requires a running local model server." },
    { id: "example-cloud", name: "Example cloud", kind: "remote", description: "Requires credentials; graph data leaves the machine." },
  ];
}

export class WebBridge implements Bridge {
  async listProjects(): Promise<ProjectSummary[]> {
    return readProjects().map((project) => ({
      id: project.id,
      name: project.name,
      moduleCount: project.modules.length,
    }));
  }

  async openProject(id: string): Promise<ProjectManifest> {
    const project = readProjects().find((entry) => entry.id === id);
    if (project === undefined) throw new Error(`Project "${id}" was not found.`);
    return clone(project);
  }

  async saveProject(project: ProjectManifest): Promise<void> {
    const projects = readProjects();
    const index = projects.findIndex((entry) => entry.id === project.id);
    if (index >= 0) projects[index] = clone(project);
    else projects.push(clone(project));
    writeProjects(projects);
  }

  async validateGraph(graph: GraphDocument): Promise<Diagnostic[]> {
    return validateGraphDocument(graph);
  }

  async generateCode(graph: GraphDocument): Promise<GeneratedCode> {
    const parsed = parseGraphDocument(graph);
    const diagnostics: Diagnostic[] = [...parsed.diagnostics];
    if (!parsed.ok || parsed.value === undefined) return generated(diagnostics);

    const lowered = lowerGraph(parsed.value);
    diagnostics.push(...lowered.diagnostics);
    if (!lowered.ok || lowered.value === undefined) return generated(diagnostics);

    const result = generateTypeScript(lowered.value);
    diagnostics.push(...result.diagnostics);
    return {
      code: result.source ?? "",
      sourceMap: result.sourceMap,
      diagnostics,
      diagnosticText: diagnostics.map((entry) => formatDiagnostic(entry)),
    };
  }

  async runProgram(request: RunRequest): Promise<RunResult> {
    const diagnostics = validateGraphDocument(request.graph);
    if (diagnostics.some((entry) => entry.severity === "error")) {
      return {
        mode: "browser-preview",
        output: "",
        diagnostics,
        exitCode: 1,
        note: "Browser preview: validation failed, so no program was executed and no child process was started.",
      };
    }
    const preview = previewExecution(request.graph);
    const combined = [...diagnostics, ...preview.diagnostics];
    return {
      mode: "browser-preview",
      output: preview.output,
      diagnostics: combined,
      exitCode: combined.some((entry) => entry.severity === "error") ? 1 : 0,
      note: "Browser preview: the graph was interpreted in the UI; no child process or compiler was started.",
    };
  }

  async listTemplates(): Promise<TemplateDescriptor[]> {
    return clone(templates());
  }

  async listPlugins(): Promise<PluginManifest[]> {
    return clone(plugins());
  }

  async listProviders(): Promise<AIProvider[]> {
    return clone(providers());
  }

  async proposeChange(request: ChangeProposalRequest): Promise<ChangeProposal> {
    const before = request.graph;
    const providerId = request.providerId ?? providers()[0]?.id ?? "local-heuristic";
    const instruction = request.instruction?.trim() ?? "";
    const logNodes = before.nodes.filter((node) => node.definitionId === CORE_CONSOLE_LOG.definitionId);
    let after: GraphDocument;
    let summary: string;

    const lastLog = logNodes.at(-1);
    if (lastLog !== undefined) {
      const current = typeof lastLog.properties["message"] === "string" ? lastLog.properties["message"] : "";
      const message = instruction.length > 0 ? `${current} ${instruction}`.trim() : `${current} (AI suggested edit)`;
      after = updateNodeProperties(before, lastLog.id, { ...lastLog.properties, message });
      summary = `Update console-log "${lastLog.id}" message.`;
    } else {
      const start = before.nodes.find((node) => node.definitionId === CORE_START.definitionId) ?? before.nodes[0];
      let next = addNodeToGraph(before, CORE_CONSOLE_LOG.definitionId, {
        x: (start?.position?.x ?? 120) + 40,
        y: (start?.position?.y ?? 120) + 180,
      }, "log-ai-1");
      if (start !== undefined) {
        next = addConnection(
          next,
          { source: start.id, target: "log-ai-1", sourceHandle: "exec-out", targetHandle: "exec-in" },
          "execution",
        );
      }
      after = next;
      summary = 'Add "log-ai-1" console-log node after the start node.';
    }

    return {
      id: `proposal-${Date.now().toString(36)}`,
      providerId,
      summary,
      diff: describeGraphChange(before, after),
      graph: after,
      rationale: "Conservative local proposal; review the preview before applying it to the graph.",
    };
  }
}

function getInvoke(): TauriInvoke | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__TAURI__?.invoke ?? window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
}

export function isDesktopRuntime(): boolean {
  return getInvoke() !== undefined;
}

function stringArray(value: unknown, fallback: readonly string[] = []): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [...fallback];
}

function isDiagnostic(value: unknown): value is Diagnostic {
  return (
    isRecord(value) &&
    typeof value["code"] === "string" &&
    typeof value["message"] === "string" &&
    (value["severity"] === "error" || value["severity"] === "warning" || value["severity"] === "info")
  );
}

function parseProjectSummaries(raw: unknown): ProjectSummary[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const summaries: ProjectSummary[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry["id"] !== "string" || typeof entry["name"] !== "string") return undefined;
    summaries.push({
      id: entry["id"],
      name: entry["name"],
      moduleCount: typeof entry["moduleCount"] === "number" ? entry["moduleCount"] : 0,
    });
  }
  return summaries;
}

function parseTemplates(raw: unknown): TemplateDescriptor[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: TemplateDescriptor[] = [];
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      typeof entry["id"] !== "string" ||
      typeof entry["name"] !== "string" ||
      typeof entry["description"] !== "string" ||
      typeof entry["category"] !== "string"
    ) {
      return undefined;
    }
    const parsedGraph = parseGraphDocument(entry["graph"]);
    if (!parsedGraph.ok || parsedGraph.value === undefined) return undefined;
    result.push({
      id: entry["id"],
      name: entry["name"],
      description: entry["description"],
      category: entry["category"],
      graph: parsedGraph.value,
    });
  }
  return result;
}

function parsePlugins(raw: unknown): PluginManifest[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: PluginManifest[] = [];
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      typeof entry["id"] !== "string" ||
      typeof entry["name"] !== "string" ||
      typeof entry["version"] !== "string"
    ) {
      return undefined;
    }
    result.push({
      id: entry["id"],
      name: entry["name"],
      version: entry["version"],
      description: typeof entry["description"] === "string" ? entry["description"] : "",
      categories: stringArray(entry["categories"]),
      capabilities: stringArray(entry["capabilities"]),
      permissions: stringArray(entry["permissions"]),
      enabled: entry["enabled"] !== false,
    });
  }
  return result;
}

function parseProviders(raw: unknown): AIProvider[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: AIProvider[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry["id"] !== "string" || typeof entry["name"] !== "string") return undefined;
    result.push({
      id: entry["id"],
      name: entry["name"],
      kind: entry["kind"] === "local" ? "local" : "remote",
      description: typeof entry["description"] === "string" ? entry["description"] : "",
    });
  }
  return result;
}

function parseRunResult(raw: unknown): RunResult | undefined {
  if (!isRecord(raw)) return undefined;
  const output =
    typeof raw["output"] === "string"
      ? raw["output"]
      : typeof raw["stdout"] === "string"
        ? raw["stdout"]
        : "";
  return {
    mode: "desktop",
    output,
    diagnostics: Array.isArray(raw["diagnostics"]) ? raw["diagnostics"].filter(isDiagnostic) : [],
    exitCode:
      typeof raw["exitCode"] === "number"
        ? raw["exitCode"]
        : typeof raw["exit_code"] === "number"
          ? raw["exit_code"]
          : 0,
    note: typeof raw["note"] === "string" ? raw["note"] : "Executed by the Tauri host.",
  };
}

function parseProposal(raw: unknown, original: ChangeProposalRequest): ChangeProposal | undefined {
  if (
    !isRecord(raw) ||
    typeof raw["summary"] !== "string" ||
    typeof raw["diff"] !== "string" ||
    !isRecord(raw["graph"])
  ) {
    return undefined;
  }
  const parsedGraph = parseGraphDocument(raw["graph"]);
  if (!parsedGraph.ok || parsedGraph.value === undefined) return undefined;
  return {
    id: typeof raw["id"] === "string" ? raw["id"] : `proposal-${Date.now().toString(36)}`,
    providerId: typeof raw["providerId"] === "string" ? raw["providerId"] : original.providerId ?? "desktop-provider",
    summary: raw["summary"],
    diff: raw["diff"],
    graph: parsedGraph.value,
    rationale: typeof raw["rationale"] === "string" ? raw["rationale"] : "Review the proposed graph change before applying.",
  };
}

/** Uses Tauri IPC when present; every method falls back to the browser implementation. */
export class DesktopBridge extends WebBridge implements Bridge {
  private async invokeOr<T>(
    command: string,
    args: Record<string, unknown>,
    fallback: () => Promise<T>,
    parse: (raw: unknown) => T | undefined,
  ): Promise<T> {
    const invoke = getInvoke();
    if (invoke === undefined) return fallback();
    try {
      const parsed = parse(await invoke(command, args));
      return parsed ?? fallback();
    } catch {
      return fallback();
    }
  }

  private async invokeVoid(command: string, args: Record<string, unknown>): Promise<boolean> {
    const invoke = getInvoke();
    if (invoke === undefined) return false;
    try {
      await invoke(command, args);
      return true;
    } catch {
      return false;
    }
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.invokeOr("list_projects", {}, () => super.listProjects(), parseProjectSummaries);
  }

  openProject(id: string): Promise<ProjectManifest> {
    return this.invokeOr("open_project", { id }, () => super.openProject(id), (raw) =>
      isProjectManifest(raw) ? raw : undefined,
    );
  }

  async saveProject(project: ProjectManifest): Promise<void> {
    if (!(await this.invokeVoid("save_project", { project }))) await super.saveProject(project);
  }

  validateGraph(graph: GraphDocument): Promise<Diagnostic[]> {
    return super.validateGraph(graph);
  }

  generateCode(graph: GraphDocument): Promise<GeneratedCode> {
    return super.generateCode(graph);
  }

  async runProgram(request: RunRequest): Promise<RunResult> {
    const invoke = getInvoke();
    if (invoke === undefined) return super.runProgram(request);

    const generated = await super.generateCode(request.graph);
    const hasErrors = generated.diagnostics.some((entry) => entry.severity === "error");
    if (hasErrors || generated.code.length === 0) {
      return {
        mode: "desktop",
        output: "",
        diagnostics: generated.diagnostics,
        exitCode: 1,
        note: "The Tauri host did not run the graph because generation reported errors.",
      };
    }

    const relative = `out/${request.graph.id.replace(/[^A-Za-z0-9_.-]+/g, "_")}.ts`;
    try {
      await invoke("write_file", { relative, contents: generated.code });
      const raw = await invoke("run_program", { relative, executable: null });
      const parsed = parseRunResult(raw);
      if (parsed !== undefined) {
        return {
          ...parsed,
          diagnostics: generated.diagnostics,
          note: "Executed by the Tauri host with the selected Node runtime.",
        };
      }
    } catch {
      // Fall through to the clearly labelled browser preview.
    }
    return super.runProgram(request);
  }

  listTemplates(): Promise<TemplateDescriptor[]> {
    return this.invokeOr("list_templates", {}, () => super.listTemplates(), parseTemplates);
  }

  listPlugins(): Promise<PluginManifest[]> {
    return this.invokeOr("list_plugins", {}, () => super.listPlugins(), parsePlugins);
  }

  listProviders(): Promise<AIProvider[]> {
    return this.invokeOr("list_providers", {}, () => super.listProviders(), parseProviders);
  }

  proposeChange(request: ChangeProposalRequest): Promise<ChangeProposal> {
    return this.invokeOr(
      "propose_change",
      { graph: request.graph, providerId: request.providerId ?? null, instruction: request.instruction ?? "" },
      () => super.proposeChange(request),
      (raw) => parseProposal(raw, request),
    );
  }
}

let sharedBridge: Bridge | undefined;

export function getBridge(): Bridge {
  sharedBridge ??= isDesktopRuntime() ? new DesktopBridge() : new WebBridge();
  return sharedBridge;
}
