/** Versioned project manifest produced by this package. */
export const PROJECT_MANIFEST_SCHEMA_VERSION = "0.1";

export type ProjectModuleKind = "graph" | "source" | "external";
export type ProjectSourceOfTruth = "graph" | "source" | "external";

export interface ProjectModule {
  id: string;
  kind: ProjectModuleKind;
  path: string;
  language?: string;
  sourceOfTruth: ProjectSourceOfTruth;
  build: boolean;
}

export interface BuildProfile {
  target: string;
  outDir: string;
  entry?: string;
}

export interface ProjectManifest {
  schemaVersion: "0.1";
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
}

export interface StarterFile {
  path: string;
  content: string;
}

export interface TemplateVariable {
  name: string;
  description?: string;
  default?: string;
  required?: boolean;
}

/** A file template; `{{name}}` placeholders are replaced with resolved variables. */
export interface TemplateFile {
  path: string;
  content: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  tags: readonly string[];
  recommendedPlugins: readonly string[];
  dependencies: Record<string, string>;
  variables: readonly TemplateVariable[];
  files: readonly TemplateFile[];
  modules: readonly ProjectModule[];
  buildProfile: BuildProfile;
}

export interface CreateProjectOptions {
  id: string;
  name: string;
  version?: string;
  description?: string;
  language?: string;
  /** Explicit variable values override template defaults. */
  variables?: Record<string, string>;
}

export interface CreatedProject {
  manifest: ProjectManifest;
  /** Includes the generated `visulith.project.json` followed by starter files. */
  files: readonly StarterFile[];
}
