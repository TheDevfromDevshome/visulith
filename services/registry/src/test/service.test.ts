import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { closeServer, startServer, type RegistryFile, type ServicePackage } from "../index.js";

interface Response {
  status: number;
  json: Record<string, unknown>;
}

function httpRequest(port: number, method: string, path: string, body?: unknown): Promise<Response> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers:
          payload === undefined
            ? {}
            : { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 500,
              json: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
            });
          } catch (cause) {
            reject(cause);
          }
        });
      },
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

function metadata(checksum: string): ServicePackage {
  return {
    id: "example.node-pack",
    version: "0.1.0",
    name: "Example Node Pack",
    categories: ["nodes"],
    artifact: "artifact.json",
    checksum: { algorithm: "sha256", value: checksum },
    publisher: { id: "fixtures", name: "Fixtures" },
    license: "MIT",
    compatibility: { hostApi: "^0.1" },
    permissions: [],
    provenance: { repository: "local-fixture" },
  };
}

test("registry HTTP service publishes verified packages and rejects tampered checksums", async () => {
  const directory = mkdtempSync(join(tmpdir(), "visulith-registry-service-"));
  const registryPath = join(directory, "registry.json");
  const artifactPath = join(directory, "artifact.json");
  const artifactContent = '{"kind":"declarative-node-pack"}\n';
  writeFileSync(registryPath, `${JSON.stringify({ schemaVersion: "0.1", packages: [] }, null, 2)}\n`);
  writeFileSync(artifactPath, artifactContent, "utf8");
  const checksum = createHash("sha256").update(artifactContent, "utf8").digest("hex");

  let server: Server | undefined;
  try {
    const started = await startServer(registryPath, 0);
    server = started.server;
    assert.ok(started.port > 0);

    const initial = await httpRequest(started.port, "GET", "/packages");
    assert.equal(initial.status, 200);
    assert.deepEqual((initial.json as unknown as RegistryFile).packages, []);

    const published = await httpRequest(started.port, "POST", "/packages", {
      metadata: metadata(checksum),
      artifactPath: "artifact.json",
    });
    assert.equal(published.status, 201);
    assert.equal((published.json as unknown as ServicePackage).id, "example.node-pack");

    const listed = await httpRequest(started.port, "GET", "/packages");
    assert.equal((listed.json as unknown as RegistryFile).packages.length, 1);
    const fetched = await httpRequest(started.port, "GET", "/packages/example.node-pack");
    assert.equal(fetched.status, 200);
    assert.equal((fetched.json as unknown as ServicePackage).version, "0.1.0");
    const missing = await httpRequest(started.port, "GET", "/packages/nope");
    assert.equal(missing.status, 404);
    assert.equal((missing.json as { error: { code: string } }).error.code, "PACKAGE_NOT_FOUND");

    const tampered = await httpRequest(started.port, "POST", "/packages", {
      metadata: { ...metadata("0".repeat(64)), id: "example.tampered" },
      artifactPath: "artifact.json",
    });
    assert.equal(tampered.status, 400);
    assert.equal((tampered.json as { error: { code: string } }).error.code, "CHECKSUM_MISMATCH");

    const stored = JSON.parse(readFileSync(registryPath, "utf8")) as RegistryFile;
    assert.equal(stored.packages.length, 1);
    assert.equal(stored.packages[0]?.id, "example.node-pack");
  } finally {
    if (server !== undefined) await closeServer(server);
    rmSync(directory, { recursive: true, force: true });
  }
});
