import type { ProjectTemplate, TemplateVariable } from "./types.js";

function commonVariables(): TemplateVariable[] {
  return [
    { name: "projectName", description: "Project name shown in package metadata.", required: true },
    { name: "version", description: "Initial project version.", default: "0.0.1" },
    { name: "description", description: "Short project description.", default: "A Visulith project." },
  ];
}

function flowGraph(graphId: string, graphName: string, message: string): string {
  const graph = {
    schemaVersion: "0.1",
    id: graphId,
    kind: "structured-flow",
    name: graphName,
    nodes: [
      { id: "start", definitionId: "visulith.core.start", definitionVersion: "0.1", properties: {} },
      {
        id: "log",
        definitionId: "visulith.core.console-log",
        definitionVersion: "0.1",
        properties: { message },
      },
    ],
    connections: [
      {
        id: "start-to-log",
        source: { nodeId: "start", portId: "exec-out" },
        target: { nodeId: "log", portId: "exec-in" },
        kind: "execution",
      },
    ],
  };
  return `${JSON.stringify(graph, null, 2)}\n`;
}

const typescriptConsole: ProjectTemplate = {
  id: "typescript-console",
  name: "TypeScript Console",
  description: "A minimal TypeScript console program with a starter structured-flow graph.",
  language: "typescript",
  tags: ["console", "cli", "script", "node"],
  recommendedPlugins: ["@visulith/language-typescript"],
  dependencies: {},
  variables: commonVariables(),
  modules: [
    {
      id: "main",
      kind: "source",
      path: "src/main.ts",
      language: "typescript",
      sourceOfTruth: "source",
      build: true,
    },
    { id: "flow", kind: "graph", path: "graphs/main.graph.json", sourceOfTruth: "graph", build: false },
  ],
  buildProfile: { target: "node", outDir: "dist", entry: "src/main.ts" },
  files: [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: "{{projectName}}",
          version: "{{version}}",
          private: true,
          type: "module",
          scripts: { build: "tsc -p tsconfig.json", start: "node dist/main.js" },
          devDependencies: { typescript: "^5.9.0" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "tsconfig.json",
      content: `${JSON.stringify(
        {
          compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist" },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "src/main.ts",
      content: "const description = \"{{description}}\";\nconsole.log(`{{projectName}}: ${description}`);\n",
    },
    { path: "graphs/main.graph.json", content: flowGraph("main", "{{projectName}} main flow", "Hello from {{projectName}}!") },
    { path: "README.md", content: "# {{projectName}}\n\n{{description}}\n\nRun `npm run build && npm start`.\n" },
  ],
};

const webApp: ProjectTemplate = {
  id: "web-app",
  name: "Web App",
  description: "A small browser application skeleton with a Vite-style entry point.",
  language: "typescript",
  tags: ["web", "frontend", "ui", "browser", "vite"],
  recommendedPlugins: ["@visulith/language-typescript"],
  dependencies: { vite: "^7.0.0" },
  variables: commonVariables(),
  modules: [
    { id: "main", kind: "source", path: "src/main.ts", language: "typescript", sourceOfTruth: "source", build: true },
    { id: "app", kind: "source", path: "src/app.ts", language: "typescript", sourceOfTruth: "source", build: true },
    { id: "ui-flow", kind: "graph", path: "graphs/ui.graph.json", sourceOfTruth: "graph", build: false },
  ],
  buildProfile: { target: "web", outDir: "dist", entry: "src/main.ts" },
  files: [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: "{{projectName}}",
          version: "{{version}}",
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "vite build" },
          devDependencies: { typescript: "^5.9.0", vite: "^7.0.0" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "index.html",
      content: "<!doctype html>\n<html lang=\"en\">\n  <head><meta charset=\"utf-8\" /><title>{{projectName}}</title></head>\n  <body><div id=\"app\"></div><script type=\"module\" src=\"/src/main.ts\"></script></body>\n</html>\n",
    },
    {
      path: "src/main.ts",
      content: "import { renderApp } from \"./app.js\";\n\nrenderApp(document.querySelector(\"#app\"));\n",
    },
    {
      path: "src/app.ts",
      content: "export function renderApp(root: Element | null): void {\n  if (root === null) return;\n  root.textContent = \"{{description}}\";\n}\n",
    },
    { path: "graphs/ui.graph.json", content: flowGraph("ui", "{{projectName}} UI flow", "UI ready") },
  ],
};

const discordBot: ProjectTemplate = {
  id: "discord-bot",
  name: "Discord Bot",
  description: "A TypeScript Discord bot skeleton with an explicit token placeholder.",
  language: "typescript",
  tags: ["discord", "bot", "chat", "node"],
  recommendedPlugins: ["@visulith/language-typescript"],
  dependencies: { "discord.js": "^14.0.0" },
  variables: commonVariables(),
  modules: [
    { id: "bot", kind: "source", path: "src/bot.ts", language: "typescript", sourceOfTruth: "source", build: true },
    { id: "bot-flow", kind: "graph", path: "graphs/bot.graph.json", sourceOfTruth: "graph", build: false },
  ],
  buildProfile: { target: "node", outDir: "dist", entry: "src/bot.ts" },
  files: [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: "{{projectName}}",
          version: "{{version}}",
          private: true,
          type: "module",
          scripts: { build: "tsc -p tsconfig.json", start: "node dist/bot.js" },
          dependencies: { "discord.js": "^14.0.0" },
          devDependencies: { typescript: "^5.9.0", "@types/node": "^24.0.0" },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "src/bot.ts",
      content: "const token = process.env[\"DISCORD_TOKEN\"];\nif (token === undefined) throw new Error(\"Set DISCORD_TOKEN before starting the bot.\");\nconsole.log(\"{{projectName}} bot token loaded.\");\n",
    },
    { path: ".env.example", content: "DISCORD_TOKEN=replace-me\n" },
    { path: "graphs/bot.graph.json", content: flowGraph("bot", "{{projectName}} bot flow", "Bot starting") },
  ],
};

const libraryNodePack: ProjectTemplate = {
  id: "library-node-pack",
  name: "Library Node Pack",
  description: "A TypeScript library laid out for best-effort npm node contributions and manual adapters.",
  language: "typescript",
  tags: ["library", "package", "nodes", "sdk", "npm"],
  recommendedPlugins: ["@visulith/language-typescript"],
  dependencies: {},
  variables: commonVariables(),
  modules: [
    { id: "library", kind: "source", path: "src/index.ts", language: "typescript", sourceOfTruth: "source", build: true },
    { id: "nodes", kind: "source", path: "src/nodes.ts", language: "typescript", sourceOfTruth: "source", build: true },
    {
      id: "adapters",
      kind: "external",
      path: "adapters/nodes.json",
      sourceOfTruth: "external",
      build: false,
    },
  ],
  buildProfile: { target: "node", outDir: "dist", entry: "src/index.ts" },
  files: [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: "{{projectName}}",
          version: "{{version}}",
          type: "module",
          main: "dist/index.js",
          types: "dist/index.d.ts",
          scripts: { build: "tsc -p tsconfig.json" },
          devDependencies: { typescript: "^5.9.0" },
        },
        null,
        2,
      )}\n`,
    },
    { path: "src/index.ts", content: "export { describeLibrary } from \"./nodes.js\";\n" },
    {
      path: "src/nodes.ts",
      content: "export function describeLibrary(): string {\n  return \"{{description}}\";\n}\n",
    },
    { path: "adapters/nodes.json", content: `${JSON.stringify({ schemaVersion: "0.1", overrides: [] }, null, 2)}\n` },
  ],
};

const blank: ProjectTemplate = {
  id: "blank",
  name: "Blank",
  description: "An empty project manifest with no modules or dependencies.",
  language: "typescript",
  tags: ["blank", "empty", "custom"],
  recommendedPlugins: [],
  dependencies: {},
  variables: commonVariables(),
  modules: [],
  buildProfile: { target: "node", outDir: "dist" },
  files: [{ path: "README.md", content: "# {{projectName}}\n\n{{description}}\n" }],
};

export const BUILTIN_TEMPLATES: readonly ProjectTemplate[] = [
  typescriptConsole,
  webApp,
  discordBot,
  libraryNodePack,
  blank,
];

/** Look up a built-in template by id. */
export function getBuiltinTemplate(id: string): ProjectTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id);
}
