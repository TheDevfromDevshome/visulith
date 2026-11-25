import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUILTIN_TEMPLATES,
  PROJECT_MANIFEST_SCHEMA_VERSION,
  UnknownTemplateError,
  createProjectFiles,
  getBuiltinTemplate,
  rankTemplates,
  recommendTemplate,
} from "../index.js";

test("recommendation responds to intent, language and dependencies", () => {
  assert.equal(recommendTemplate({ intent: "a console script" }).id, "typescript-console");
  assert.equal(recommendTemplate({ intent: "discord bot" }).id, "discord-bot");
  assert.equal(recommendTemplate({ intent: "web ui", dependencies: ["vite"] }).id, "web-app");
  assert.equal(recommendTemplate({ intent: "npm library" }).id, "library-node-pack");
  assert.equal(recommendTemplate({ intent: "blank project" }).id, "blank");
  assert.equal(recommendTemplate({ dependencies: ["discord.js"] }).id, "discord-bot");
  assert.equal(recommendTemplate({ language: "ts" }).id, "typescript-console");
  assert.equal(recommendTemplate({}).id, "typescript-console");
});

test("ranking covers every built-in template deterministically", () => {
  const ranked = rankTemplates({ intent: "console" });
  assert.equal(ranked.length, BUILTIN_TEMPLATES.length);
  assert.deepEqual(
    ranked.map((entry) => entry.template.id),
    ["typescript-console", "blank", "discord-bot", "library-node-pack", "web-app"],
  );
  assert.ok(ranked[0]?.reasons.some((reason) => reason.includes("intent")));
  assert.deepEqual(getBuiltinTemplate("web-app")?.id, "web-app");
});

test("createProjectFiles produces a deterministic manifest and rendered files", () => {
  const options = { id: "demo-app", name: "Demo App", description: "A demo." };
  const first = createProjectFiles("typescript-console", options);
  const second = createProjectFiles("typescript-console", options);
  assert.deepEqual(first, second);

  assert.equal(first.manifest.schemaVersion, PROJECT_MANIFEST_SCHEMA_VERSION);
  assert.equal(first.manifest.id, "demo-app");
  assert.equal(first.manifest.name, "Demo App");
  assert.equal(first.manifest.description, "A demo.");
  assert.equal(first.manifest.language, "typescript");
  assert.equal(first.manifest.template, "typescript-console");
  assert.deepEqual(first.manifest.plugins, ["@visulith/language-typescript"]);
  assert.deepEqual(first.manifest.modules.map((module) => module.kind), ["source", "graph"]);
  assert.equal(first.manifest.buildProfile.entry, "src/main.ts");
  assert.equal(first.files[0]?.path, "visulith.project.json");
  assert.deepEqual(JSON.parse(first.files[0]?.content ?? "{}"), first.manifest);

  for (const file of first.files) {
    assert.equal(file.content.includes("{{"), false, `unresolved placeholder in ${file.path}`);
  }
  const graphFile = first.files.find((file) => file.path === "graphs/main.graph.json");
  assert.ok(graphFile !== undefined);
  assert.match(graphFile.content, /Hello from Demo App!/);
});

test("library-node-pack includes an external adapter module", () => {
  const project = createProjectFiles("library-node-pack", { id: "my-lib", name: "My Lib" });
  assert.equal(project.manifest.buildProfile.target, "node");
  assert.deepEqual(project.manifest.modules.map((module) => module.kind), ["source", "source", "external"]);
  assert.ok(project.files.some((file) => file.path === "adapters/nodes.json"));
});

test("unknown templates throw a structured error", () => {
  assert.throws(
    () => createProjectFiles("does-not-exist", { id: "x", name: "X" }),
    (error: unknown) => error instanceof UnknownTemplateError && error.code === "TEMPLATE_UNKNOWN",
  );
});
