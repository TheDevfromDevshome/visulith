import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  REGISTRY_SERVICE_SCHEMA_VERSION,
  type ErrorPayload,
  type PublishRequest,
  type RegistryFile,
  type ServicePackage,
} from "./types.js";

const MAX_BODY_BYTES = 1024 * 1024;

export interface StartResult {
  server: Server;
  port: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(body));
  response.end(body);
}

function sendError(response: ServerResponse, status: number, code: string, message: string): void {
  const payload: ErrorPayload = { error: { code, message } };
  sendJson(response, status, payload);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new Error("Request body exceeds 1 MiB.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function loadRegistry(registryPath: string): RegistryFile {
  if (!existsSync(registryPath)) {
    return { schemaVersion: REGISTRY_SERVICE_SCHEMA_VERSION, packages: [] };
  }
  const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
  if (!isRecord(parsed) || parsed["schemaVersion"] !== REGISTRY_SERVICE_SCHEMA_VERSION || !Array.isArray(parsed["packages"])) {
    throw new Error("Registry file has an unsupported shape.");
  }
  const packages = parsed["packages"].filter((entry): entry is ServicePackage => isRecord(entry) && typeof entry["id"] === "string");
  return { schemaVersion: REGISTRY_SERVICE_SCHEMA_VERSION, packages };
}

function saveRegistry(registryPath: string, data: RegistryFile): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  const content = `${JSON.stringify(data, null, 2)}\n`;
  const temporary = `${registryPath}.tmp`;
  writeFileSync(temporary, content, "utf8");
  try {
    renameSync(temporary, registryPath);
  } catch {
    // Some Windows filesystems refuse rename-over-existing; fall back to a direct write.
    writeFileSync(registryPath, content, "utf8");
    rmSync(temporary, { force: true });
  }
}

function requireString(record: Record<string, unknown>, field: string, prefix: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Validate a publish payload without trusting any field. */
export function validatePublishRequest(input: unknown): { request?: PublishRequest; error?: string } {
  if (!isRecord(input)) return { error: "Body must be a JSON object." };
  const artifactPath = requireString(input, "artifactPath", "body");
  if (artifactPath === undefined) return { error: 'Body needs a non-empty "artifactPath".' };
  const metadata = input["metadata"];
  if (!isRecord(metadata)) return { error: 'Body needs a "metadata" object.' };

  const id = requireString(metadata, "id", "metadata");
  const version = requireString(metadata, "version", "metadata");
  const license = requireString(metadata, "license", "metadata");
  const artifact = requireString(metadata, "artifact", "metadata");
  if (id === undefined || version === undefined || license === undefined || artifact === undefined) {
    return { error: 'metadata needs "id", "version", "license" and "artifact" strings.' };
  }

  const checksum = metadata["checksum"];
  if (
    !isRecord(checksum) ||
    checksum["algorithm"] !== "sha256" ||
    typeof checksum["value"] !== "string" ||
    !/^[0-9a-f]{64}$/i.test(checksum["value"])
  ) {
    return { error: 'metadata.checksum must be { algorithm: "sha256", value: 64 hex characters }.' };
  }

  const publisher = metadata["publisher"];
  if (!isRecord(publisher) || requireString(publisher, "id", "publisher") === undefined || requireString(publisher, "name", "publisher") === undefined) {
    return { error: 'metadata.publisher needs "id" and "name" strings.' };
  }

  const compatibility = metadata["compatibility"];
  if (!isRecord(compatibility) || requireString(compatibility, "hostApi", "compatibility") === undefined) {
    return { error: 'metadata.compatibility needs a "hostApi" string.' };
  }

  if (!Array.isArray(metadata["permissions"])) return { error: 'metadata.permissions must be an array.' };
  if (!isRecord(metadata["provenance"])) return { error: 'metadata.provenance must be an object.' };
  if (metadata["categories"] !== undefined && !Array.isArray(metadata["categories"])) {
    return { error: 'metadata.categories must be an array when present.' };
  }

  return { request: { metadata: metadata as unknown as ServicePackage, artifactPath } };
}

function resolveArtifact(registryPath: string, artifactPath: string): string | undefined {
  if (isAbsolute(artifactPath)) return undefined;
  const root = dirname(resolve(registryPath));
  const candidate = resolve(root, artifactPath);
  const relativePath = relative(root, candidate);
  if (relativePath.startsWith("..") || relativePath === ".." || isAbsolute(relativePath) || relativePath.includes(sep)) {
    return undefined;
  }
  return candidate;
}

/** Handle one HTTP request. Dependency-free and backed by a JSON file. */
export async function handleRequest(request: IncomingMessage, response: ServerResponse, registryPath: string): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/packages") {
    sendJson(response, 200, loadRegistry(registryPath));
    return;
  }

  const packageMatch = /^\/packages\/([^/]+)$/.exec(pathname);
  if (request.method === "GET" && packageMatch !== null) {
    let id: string;
    try {
      id = decodeURIComponent(packageMatch[1] ?? "");
    } catch {
      sendError(response, 400, "PACKAGE_ID_INVALID", "Package id could not be decoded.");
      return;
    }
    const entry = loadRegistry(registryPath).packages.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      sendError(response, 404, "PACKAGE_NOT_FOUND", `Unknown package "${id}".`);
      return;
    }
    sendJson(response, 200, entry);
    return;
  }

  if (request.method === "POST" && pathname === "/packages") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(request)) as unknown;
    } catch (cause) {
      sendError(response, 400, "BODY_INVALID", `Invalid JSON body: ${cause instanceof Error ? cause.message : String(cause)}.`);
      return;
    }
    const validation = validatePublishRequest(parsed);
    if (validation.error !== undefined || validation.request === undefined) {
      sendError(response, 400, "PUBLISH_INVALID", validation.error ?? "Invalid publish payload.");
      return;
    }
    const { metadata, artifactPath } = validation.request;
    const absoluteArtifact = resolveArtifact(registryPath, artifactPath);
    if (absoluteArtifact === undefined) {
      sendError(response, 400, "ARTIFACT_PATH_INVALID", "artifactPath must be a file inside the registry data directory.");
      return;
    }
    if (!existsSync(absoluteArtifact)) {
      sendError(response, 400, "ARTIFACT_MISSING", "The referenced artifact does not exist.");
      return;
    }

    const actual = createHash("sha256").update(readFileSync(absoluteArtifact)).digest("hex");
    if (actual !== metadata.checksum.value.toLowerCase()) {
      sendError(response, 400, "CHECKSUM_MISMATCH", `Artifact checksum is ${actual}, expected ${metadata.checksum.value}.`);
      return;
    }

    const data = loadRegistry(registryPath);
    if (data.packages.some((entry) => entry.id === metadata.id && entry.version === metadata.version)) {
      sendError(response, 409, "PACKAGE_EXISTS", `${metadata.id}@${metadata.version} is already published.`);
      return;
    }
    data.packages.push(metadata);
    data.packages.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
    saveRegistry(registryPath, data);
    sendJson(response, 201, metadata);
    return;
  }

  sendError(response, 404, "ROUTE_NOT_FOUND", `No route for ${request.method ?? "GET"} ${pathname}.`);
}

export function createRegistryServer(registryPath: string): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, registryPath).catch((cause: unknown) => {
      sendError(response, 500, "INTERNAL_ERROR", cause instanceof Error ? cause.message : String(cause));
    });
  });
}

export function startServer(registryPath: string, port = 0): Promise<StartResult> {
  return new Promise((resolvePromise, reject) => {
    const server = createRegistryServer(registryPath);
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolvePromise({ server, port: actualPort });
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error === undefined ? resolvePromise() : reject(error)));
  });
}
