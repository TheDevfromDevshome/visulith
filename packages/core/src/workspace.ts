import type { ProjectManifest } from "./project/types.js";

export interface EditorTab {
  id: string;
  kind: "graph" | "source";
  title: string;
}

/** UI-facing workspace state. Project semantics stay in the project model. */
export class WorkspaceService {
  private readonly projects = new Map<string, ProjectManifest>();
  private readonly tabs = new Map<string, EditorTab[]>();
  private activeProjectId: string | undefined;

  open(manifest: ProjectManifest): void {
    this.projects.set(manifest.id, manifest);
    if (!this.tabs.has(manifest.id)) this.tabs.set(manifest.id, []);
    this.activeProjectId = manifest.id;
  }

  close(id: string): void {
    this.projects.delete(id);
    this.tabs.delete(id);
    if (this.activeProjectId === id) this.activeProjectId = undefined;
  }

  setActive(id: string): void {
    if (!this.projects.has(id)) throw new Error(`Project "${id}" is not open.`);
    this.activeProjectId = id;
  }

  getActive(): ProjectManifest | undefined {
    return this.activeProjectId === undefined ? undefined : this.projects.get(this.activeProjectId);
  }

  list(): ProjectManifest[] {
    return [...this.projects.values()];
  }

  openTab(projectId: string, tab: EditorTab): void {
    const tabs = this.tabs.get(projectId) ?? [];
    if (!tabs.some((entry) => entry.id === tab.id)) {
      tabs.push(tab);
      this.tabs.set(projectId, tabs);
    }
  }

  closeTab(projectId: string, tabId: string): void {
    const tabs = this.tabs.get(projectId) ?? [];
    this.tabs.set(
      projectId,
      tabs.filter((tab) => tab.id !== tabId),
    );
  }

  listTabs(projectId: string): EditorTab[] {
    return [...(this.tabs.get(projectId) ?? [])];
  }
}
