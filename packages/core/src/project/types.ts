export const PROJECT_SCHEMA_VERSION = "0.1";

export type ModuleKind = "graph" | "source" | "external";
export type ModuleSourceOfTruth = "graph" | "source" | "external";
export type ModuleBuildBehavior = "generate" | "copy" | "external";

export interface ProjectModule {
  id: string;
  kind: ModuleKind;
  path: string;
  language?: string;
  sourceOfTruth: ModuleSourceOfTruth;
  build: ModuleBuildBehavior;
}

export interface BuildProfile {
  target: string;
  outDir: string;
  entry?: string;
}

/** Project metadata is versioned JSON. Generated output is never stored here. */
export interface ProjectManifest {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  description?: string;
  language: string;
  template?: string;
  modules: ProjectModule[];
  dependencies: Record<string, string>;
  buildProfile: BuildProfile;
  plugins: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateProjectInput {
  id: string;
  name: string;
  language?: string;
  template?: string;
  description?: string;
  modules?: ProjectModule[];
  dependencies?: Record<string, string>;
  plugins?: string[];
  outDir?: string;
}

export function createProjectManifest(input: CreateProjectInput): ProjectManifest {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    version: "0.1.0",
    language: input.language ?? "typescript",
    ...(input.description ? { description: input.description } : {}),
    ...(input.template ? { template: input.template } : {}),
    modules: input.modules ?? [],
    dependencies: input.dependencies ?? {},
    buildProfile: { target: "node", outDir: input.outDir ?? "out" },
    plugins: input.plugins ?? [],
  };
}
