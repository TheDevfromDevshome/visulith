/**
 * Minimal, deterministic host API range checker.
 *
 * Supported range forms (whitespace is ignored):
 *   "*"                  any host version
 *   "0.x" / "^0.x"       any 0.x.y host
 *   "0.1" / "0.1.x"      any 0.1.y host
 *   "^0.1" / "^0.1.0"    any 0.1.y host (caret on a 0.x version pins the minor)
 *   "^1.2.0"             >= 1.2.0 and < 2.0.0
 *   "0.1.0"              exactly 0.1.0
 *
 * Anything else is rejected rather than interpreted loosely.
 */

export interface HostVersion {
  major: number;
  minor: number;
  patch: number;
}

export const HOST_API_VERSION = "0.1.0";

type HostApiRange =
  | { kind: "any" }
  | { kind: "exact"; version: HostVersion }
  | { kind: "minor"; major: number; minor: number }
  | { kind: "major"; major: number; minimumMinor: number; minimumPatch: number }
  | { kind: "zeroMajor" };

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

export function parseHostVersion(value: string): HostVersion | undefined {
  const match = VERSION_PATTERN.exec(value.trim());
  if (match === null) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function parseBareRange(value: string): HostApiRange | undefined {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "X") return { kind: "any" };
  if (/^0\.[xX]$/.test(trimmed)) return { kind: "zeroMajor" };

  const patchWildcardMatch = /^(\d+)\.(\d+)\.[xX]$/.exec(trimmed);
  if (patchWildcardMatch !== null) {
    return { kind: "minor", major: Number(patchWildcardMatch[1]), minor: Number(patchWildcardMatch[2]) };
  }

  const minorMatch = /^(\d+)\.([xX]|\d+)$/.exec(trimmed);
  if (minorMatch !== null) {
    const major = Number(minorMatch[1]);
    const minorPart = minorMatch[2] ?? "";
    if (minorPart === "x" || minorPart === "X") {
      return { kind: "major", major, minimumMinor: 0, minimumPatch: 0 };
    }
    return { kind: "minor", major, minor: Number(minorPart) };
  }

  const version = parseHostVersion(trimmed);
  return version === undefined ? undefined : { kind: "exact", version };
}

export function parseHostApiRange(range: string): HostApiRange | undefined {
  const trimmed = range.trim();
  if (trimmed.startsWith("^")) {
    const bare = parseBareRange(trimmed.slice(1));
    if (bare === undefined) return undefined;
    if (bare.kind === "any" || bare.kind === "zeroMajor") return bare;
    if (bare.kind === "minor") {
      if (bare.major === 0) return { kind: "minor", major: 0, minor: bare.minor };
      return { kind: "major", major: bare.major, minimumMinor: bare.minor, minimumPatch: 0 };
    }
    if (bare.kind === "major") return bare;
    if (bare.kind === "exact") {
      if (bare.version.major === 0) {
        return { kind: "minor", major: 0, minor: bare.version.minor };
      }
      return {
        kind: "major",
        major: bare.version.major,
        minimumMinor: bare.version.minor,
        minimumPatch: bare.version.patch,
      };
    }
  }
  return parseBareRange(trimmed);
}

export function isValidHostApiRange(range: string): boolean {
  return parseHostApiRange(range) !== undefined;
}

export function satisfiesHostApiRange(range: string, hostVersion: string = HOST_API_VERSION): boolean {
  const parsedRange = parseHostApiRange(range);
  const parsedHost = parseHostVersion(hostVersion);
  if (parsedRange === undefined || parsedHost === undefined) return false;

  switch (parsedRange.kind) {
    case "any":
      return true;
    case "zeroMajor":
      return parsedHost.major === 0;
    case "minor":
      return parsedHost.major === parsedRange.major && parsedHost.minor === parsedRange.minor;
    case "major":
      return (
        parsedHost.major === parsedRange.major &&
        (parsedHost.minor > parsedRange.minimumMinor ||
          (parsedHost.minor === parsedRange.minimumMinor && parsedHost.patch >= parsedRange.minimumPatch))
      );
    case "exact":
      return (
        parsedHost.major === parsedRange.version.major &&
        parsedHost.minor === parsedRange.version.minor &&
        parsedHost.patch === parsedRange.version.patch
      );
  }
}
