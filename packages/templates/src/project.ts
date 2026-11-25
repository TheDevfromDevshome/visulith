import { getBuiltinTemplate } from "./builtin.js";
import {
  PROJECT_MANIFEST_SCHEMA_VERSION,
  type CreatedProject,
  type CreateProjectOptions,
  type ProjectManifest,
  type ProjectModule,
  type StarterFile,
  type TemplateVariable,
} from "./types.js";

export class UnknownTemplateError extends Error {
  readonly code = "TEMPLATE_UNKNOWN";

  constructor(public readonly templateId: string) {
    super(`Unknown template "${templateId}".`);
    this.name = "UnknownTemplateError";
  }
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

function render(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER_PATTERN, (_match, key: string) => values[key] ?? "");
}

function resolveVariables(
  variables: readonly TemplateVariable[],
  options: CreateProjectOptions,
  description: string,
  language: string,
  templateId: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const variable of variables) {
    if (variable.default !== undefined) values[variable.name] = variable.default;
  }
  values["projectName"] = options.name;
  values["id"] = options.id;
  values["version"] = options.version ?? values["version"] ?? "0.0.1";
  values["description"] = options.description ?? values["description"] ?? description;
  values["language"] = options.language ?? language;
  values["template"] = templateId;
  for (const [key, value] of Object.entries(options.variables ?? {})) values[key] = value;
  return values;
}

function renderModules(modules: readonly ProjectModule[], values: Readonly<Record<string, string>>): ProjectModule[] {
  return modules.map((module) => ({
    id: render(module.id, values),
    kind: module.kind,
    path: render(module.path, values),
    ...(module.language === undefined ? {} : { language: render(module.language, values) }),
    sourceOfTruth: module.sourceOfTruth,
    build: module.build,
  }));
}

/**
 * Create a deterministic project manifest v0.1 and starter files from a built-in
 * template. Nothing is written to disk by this function.
 */
export function createProjectFiles(templateId: string, options: CreateProjectOptions): CreatedProject {
  const template = getBuiltinTemplate(templateId);
  if (template === undefined) throw new UnknownTemplateError(templateId);

  const values = resolveVariables(
    template.variables,
    options,
    template.description,
    template.language,
    template.id,
  );

  const dependencies: Record<string, string> = {};
  for (const key of Object.keys(template.dependencies).sort()) {
    dependencies[key] = template.dependencies[key] ?? "";
  }

  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
    id: render(options.id, values),
    name: render(options.name, values),
    version: render(values["version"] ?? "0.0.1", values),
    ...(options.description === undefined && values["description"] === template.description
      ? {}
      : { description: render(values["description"] ?? "", values) }),
    language: render(values["language"] ?? template.language, values),
    template: template.id,
    modules: renderModules(template.modules, values),
    dependencies,
    buildProfile: {
      target: template.buildProfile.target,
      outDir: template.buildProfile.outDir,
      ...(template.buildProfile.entry === undefined ? {} : { entry: render(template.buildProfile.entry, values) }),
    },
    plugins: [...template.recommendedPlugins],
  };

  const files: StarterFile[] = [
    {
      path: "visulith.project.json",
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
  ];
  for (const file of template.files) {
    files.push({ path: render(file.path, values), content: render(file.content, values) });
  }
  return { manifest, files };
}
