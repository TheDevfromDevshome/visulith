import { error, isRecord, type Diagnostic, type ValidationResult } from "@visulith/engine";
import { PROJECT_SCHEMA_VERSION, type ProjectManifest } from "./types.js";

const MODULE_KINDS = ["graph", "source", "external"];
const SOURCE_OF_TRUTH = ["graph", "source", "external"];
const BUILD_BEHAVIORS = ["generate", "copy", "external"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Validate untrusted project metadata before any path is resolved. */
export function validateProjectManifest(input: unknown): ValidationResult<ProjectManifest> {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    return { ok: false, diagnostics: [error("PROJECT_INVALID_DOCUMENT", "Project manifest must be a JSON object.")] };
  }
  if (input["schemaVersion"] !== PROJECT_SCHEMA_VERSION) {
    diagnostics.push(
      error(
        "PROJECT_SCHEMA_UNSUPPORTED",
        `Project schemaVersion ${String(input["schemaVersion"])} is not supported (expected ${PROJECT_SCHEMA_VERSION}).`,
      ),
    );
  }
  for (const field of ["id", "name", "version", "language"] as const) {
    if (!isNonEmptyString(input[field])) {
      diagnostics.push(error("PROJECT_FIELD_MISSING", `Project field "${field}" must be a non-empty string.`));
    }
  }
  if (!Array.isArray(input["modules"])) {
    diagnostics.push(error("PROJECT_MODULES_INVALID", "Project modules must be an array."));
  } else {
    const seen = new Set<string>();
    input["modules"].forEach((raw, index) => {
      if (!isRecord(raw)) {
        diagnostics.push(error("PROJECT_MODULE_INVALID", `Module at index ${index} must be an object.`));
        return;
      }
      const id = raw["id"];
      if (!isNonEmptyString(id) || seen.has(id)) {
        diagnostics.push(error("PROJECT_MODULE_ID_INVALID", `Module at index ${index} needs a unique string id.`));
      } else {
        seen.add(id);
      }
      if (!isNonEmptyString(raw["path"])) {
        diagnostics.push(error("PROJECT_MODULE_PATH_INVALID", `Module ${String(id)} needs a path.`));
      }
      if (!MODULE_KINDS.includes(String(raw["kind"]))) {
        diagnostics.push(error("PROJECT_MODULE_KIND_INVALID", `Module ${String(id)} has an unsupported kind.`));
      }
      if (!SOURCE_OF_TRUTH.includes(String(raw["sourceOfTruth"]))) {
        diagnostics.push(error("PROJECT_MODULE_SOURCE_INVALID", `Module ${String(id)} has an invalid sourceOfTruth.`));
      }
      if (!BUILD_BEHAVIORS.includes(String(raw["build"]))) {
        diagnostics.push(error("PROJECT_MODULE_BUILD_INVALID", `Module ${String(id)} has an invalid build behavior.`));
      }
    });
  }
  if (!isRecord(input["dependencies"])) {
    diagnostics.push(error("PROJECT_DEPENDENCIES_INVALID", "Project dependencies must be an object."));
  }
  if (!isRecord(input["buildProfile"])) {
    diagnostics.push(error("PROJECT_BUILD_PROFILE_INVALID", "Project buildProfile must be an object."));
  } else {
    if (!isNonEmptyString(input["buildProfile"]["target"])) {
      diagnostics.push(error("PROJECT_BUILD_TARGET_INVALID", "buildProfile.target must be a non-empty string."));
    }
    if (!isNonEmptyString(input["buildProfile"]["outDir"])) {
      diagnostics.push(error("PROJECT_BUILD_OUTDIR_INVALID", "buildProfile.outDir must be a non-empty string."));
    }
  }
  if (!Array.isArray(input["plugins"]) || input["plugins"].some((entry) => !isNonEmptyString(entry))) {
    diagnostics.push(error("PROJECT_PLUGINS_INVALID", "Project plugins must be an array of plugin ids."));
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return { ok: true, value: input as unknown as ProjectManifest, diagnostics };
}
