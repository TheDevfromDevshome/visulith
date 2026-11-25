// Creates minimal placeholder icons so Tauri can build before branding exists.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../apps/desktop/src-tauri/icons/", import.meta.url));
mkdirSync(directory, { recursive: true });

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
for (const name of ["32x32.png", "128x128.png", "128x128@2x.png"]) {
  writeFileSync(join(directory, name), png);
}
// Windows ICO container with a PNG payload (supported by the resource compiler).
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(1, 6);
header.writeUInt8(1, 7);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);
writeFileSync(join(directory, "icon.ico"), Buffer.concat([header, png]));
console.log("placeholder icons written");
