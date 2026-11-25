import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** SHA-256 of a file's raw bytes, as lower-case hex. */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyFileChecksum(path: string, expectedSha256: string): boolean {
  return sha256File(path) === expectedSha256.toLowerCase();
}
