import type { Diagnostic, GraphDocument, SourceMapping } from "@visulith/engine";

export type { Diagnostic, GraphDocument, SourceMapping };

export interface ProjectModule {
  id: string;
  kind: "graph" | "source";
  name: string;
  /** Present for graph-authored modules. Source modules may only have a path. */
  graph?: GraphDocument;
  path?: string;
}

export interface ProjectManifest {
  schemaVersion: "0.1";
  id: string;
  name: string;
  modules: ProjectModule[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  moduleCount: number;
}

export interface GeneratedCode {
  code: string;
  sourceMap: SourceMapping[];
  diagnostics: Diagnostic[];
  /** formatDiagnostic() output, convenient for logs and non-structured views. */
  diagnosticText: string[];
}

export interface RunRequest {
  graph: GraphDocument;
  providerId?: string;
}

export type RunMode = "browser-preview" | "desktop";

export interface RunResult {
  mode: RunMode;
  output: string;
  diagnostics: Diagnostic[];
  exitCode: number;
  note: string;
}

export interface TemplateDescriptor {
  id: string;
  name: string;
  description: string;
  category: string;
  graph: GraphDocument;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  categories: string[];
  capabilities: string[];
  permissions: string[];
  enabled: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  kind: "local" | "remote";
  description: string;
}

export interface ChangeProposalRequest {
  graph: GraphDocument;
  providerId?: string;
  instruction?: string;
}

export interface ChangeProposal {
  id: string;
  providerId: string;
  summary: string;
  /** Human-readable unified-style preview. Never applied without explicit approval. */
  diff: string;
  graph: GraphDocument;
  rationale: string;
}

export interface AppSettings {
  theme: "dark" | "light";
  contrast: "normal" | "high" | "max";
  textScale: "small" | "normal" | "large" | "xlarge";
  providerId?: string;
}

export type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: TauriInvoke;
      core?: { invoke?: TauriInvoke };
    };
    __TAURI_INTERNALS__?: {
      invoke?: TauriInvoke;
    };
  }
}

/** The single seam between UI state and local storage / Tauri IPC. */
export interface Bridge {
  listProjects(): Promise<ProjectSummary[]>;
  openProject(id: string): Promise<ProjectManifest>;
  saveProject(project: ProjectManifest): Promise<void>;
  validateGraph(graph: GraphDocument): Promise<Diagnostic[]>;
  generateCode(graph: GraphDocument): Promise<GeneratedCode>;
  runProgram(request: RunRequest): Promise<RunResult>;
  listTemplates(): Promise<TemplateDescriptor[]>;
  listPlugins(): Promise<PluginManifest[]>;
  listProviders(): Promise<AIProvider[]>;
  proposeChange(request: ChangeProposalRequest): Promise<ChangeProposal>;
}
