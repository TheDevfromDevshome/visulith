import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LocalRegistryClient, sha256File } from "../index.js";
import type { RegistryIndex } from "../types.js";

const fixtureIndex = fileURLToPath(new URL("../../../../fixtures/registry/index.json", import.meta.url));
const fixtureArtifact = fileURLToPath(
  new URL("../../../../fixtures/registry/artifacts/example-node-pack.json", import.meta.url),
);

function readFixtureIndex(): RegistryIndex {
  return JSON.parse(readFileSync(fixtureIndex, "utf8")) as RegistryIndex;
}

test("the fixture index supports listing, search and checksum verification", () => {
  const client = new LocalRegistryClient();
  assert.deepEqual(
    client.listPackages().map((entry) => entry.id),
    ["demo.template-pack", "example.node-pack"],
  );
  assert.equal(client.search({ category: "nodes" })[0]?.id, "example.node-pack");
  assert.equal(client.search({ text: "template" })[0]?.id, "demo.template-pack");
  assert.equal(client.getPackage("missing"), undefined);
  assert.equal(client.verifyPackage("example.node-pack"), true);
  assert.deepEqual(client.allDiagnostics(), []);
});

test("installPackage copies a verified artifact", () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-registry-"));
  try {
    const client = new LocalRegistryClient();
    const metadata = client.getPackage("example.node-pack");
    assert.ok(metadata !== undefined);
    const result = client.installPackage("example.node-pack", join(directory, "out"));
    assert.equal(result.ok, true);
    assert.ok(result.installedPath !== undefined);
    assert.equal(sha256File(result.installedPath), metadata.checksum.value);
    assert.match(readFileSync(result.installedPath, "utf8"), /Example Node Pack/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a tampered checksum is rejected before any file is written", () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-registry-tamper-"));
  try {
    mkdirSync(join(directory, "artifacts"), { recursive: true });
    copyFileSync(fixtureArtifact, join(directory, "artifacts", "example-node-pack.json"));
    const index = readFixtureIndex();
    const first = index.packages[0];
    assert.ok(first !== undefined);
    first.checksum.value = "0".repeat(64);
    writeFileSync(join(directory, "index.json"), JSON.stringify(index));

    const client = new LocalRegistryClient({ index: join(directory, "index.json") });
    const result = client.installPackage(first.id, join(directory, "out"));
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "REGISTRY_CHECKSUM_MISMATCH");
    assert.equal(existsSync(join(directory, "out", "example-node-pack.json")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("missing artifacts and existing targets produce structured diagnostics", () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-registry-errors-"));
  try {
    const index = readFixtureIndex();
    const first = index.packages[0];
    assert.ok(first !== undefined);
    first.artifact = "artifacts/missing.json";
    writeFileSync(join(directory, "index.json"), JSON.stringify(index));
    const client = new LocalRegistryClient({ index: join(directory, "index.json") });
    const missing = client.installPackage(first.id, join(directory, "out"));
    assert.equal(missing.diagnostics[0]?.code, "REGISTRY_ARTIFACT_MISSING");

    const validClient = new LocalRegistryClient();
    const installed = validClient.installPackage("example.node-pack", directory, { fileName: "installed.json" });
    assert.equal(installed.ok, true);
    const duplicate = validClient.installPackage("example.node-pack", directory, { fileName: "installed.json" });
    assert.equal(duplicate.diagnostics[0]?.code, "REGISTRY_TARGET_EXISTS");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
