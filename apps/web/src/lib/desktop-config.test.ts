import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

interface TauriConfig {
  build: {
    beforeBuildCommand: string;
    frontendDist: string;
  };
}

const configPath = fileURLToPath(new URL("../../../desktop/src-tauri/tauri.conf.json", import.meta.url));
const expectedWebDist = fileURLToPath(new URL("../../dist", import.meta.url));

test("the Tauri frontendDist resolves to the built web app", () => {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as TauriConfig;
  assert.equal(resolve(dirname(configPath), config.build.frontendDist), expectedWebDist);
});

test("the Tauri build command builds the web workspace package", () => {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as TauriConfig;
  assert.match(config.build.beforeBuildCommand, /@visulith\/web build/);
});
