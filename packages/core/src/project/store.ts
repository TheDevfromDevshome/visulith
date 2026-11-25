import { copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { validateProjectManifest } from "./validate.js";
import { createProjectManifest, type CreateProjectInput, type ProjectManifest } from "./types.js";

const MANIFEST_FILE = "visulith.project.json";

/** File-backed project store with atomic saves and a backup before overwriting. */
export class FileProjectStore {
  constructor(private readonly root: string) {}

  private projectDirectory(id: string): string {
    return join(this.root, id);
  }

  private manifestPath(id: string): string {
    return join(this.projectDirectory(id), MANIFEST_FILE);
  }

  async create(input: CreateProjectInput): Promise<ProjectManifest> {
    const manifest = createProjectManifest(input);
    const result = validateProjectManifest(manifest);
    if (!result.ok) throw new Error(`Invalid generated manifest: ${result.diagnostics.map((entry) => entry.code).join(", ")}`);
    await mkdir(this.projectDirectory(manifest.id), { recursive: true });
    await this.save(manifest);
    return manifest;
  }

  async load(id: string): Promise<ProjectManifest> {
    const raw = await readFile(this.manifestPath(id), "utf8");
    const result = validateProjectManifest(JSON.parse(raw) as unknown);
    if (!result.ok || result.value === undefined) {
      throw new Error(`Invalid project manifest: ${result.diagnostics.map((entry) => entry.code).join(", ")}`);
    }
    return result.value;
  }

  async save(manifest: ProjectManifest): Promise<void> {
    const result = validateProjectManifest(manifest);
    if (!result.ok) throw new Error(`Cannot save invalid project: ${result.diagnostics.map((entry) => entry.code).join(", ")}`);
    const directory = this.projectDirectory(manifest.id);
    await mkdir(directory, { recursive: true });
    const target = this.manifestPath(manifest.id);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    try {
      await copyFile(target, `${target}.bak`);
    } catch {
      // No previous manifest exists; a backup is only needed before overwriting.
    }
    await rename(temporary, target);
  }

  async list(): Promise<ProjectManifest[]> {
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch {
      return [];
    }
    const projects: ProjectManifest[] = [];
    for (const entry of entries) {
      try {
        projects.push(await this.load(entry));
      } catch {
        // An unreadable project must not prevent other projects from opening.
      }
    }
    return projects;
  }
}
