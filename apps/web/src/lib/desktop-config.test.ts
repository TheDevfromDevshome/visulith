import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

interface TauriWindowConfig {
  devtools: boolean;
  dragDropEnabled: boolean;
  zoomHotkeysEnabled: boolean;
  theme: string;
}

interface TauriConfig {
  build: {
    beforeBuildCommand: string;
    frontendDist: string;
  };
  app: {
    windows: TauriWindowConfig[];
  };
}

const configPath = fileURLToPath(new URL("../../../desktop/src-tauri/tauri.conf.json", import.meta.url));
const expectedWebDist = fileURLToPath(new URL("../../dist", import.meta.url));
const config = JSON.parse(readFileSync(configPath, "utf8")) as TauriConfig;

test("the Tauri frontendDist resolves to the built web app", () => {
  assert.equal(resolve(dirname(configPath), config.build.frontendDist), expectedWebDist);
});

test("the Tauri build command builds the web workspace package", () => {
  assert.match(config.build.beforeBuildCommand, /@visulith\/web build/);
});

test("the desktop window disables browser zoom, files and devtools", () => {
  const [windowConfig] = config.app.windows;
  assert.ok(windowConfig);
  assert.equal(windowConfig.zoomHotkeysEnabled, false);
  assert.equal(windowConfig.devtools, false);
  assert.equal(windowConfig.dragDropEnabled, false);
  assert.equal(windowConfig.theme, "Dark");
});
