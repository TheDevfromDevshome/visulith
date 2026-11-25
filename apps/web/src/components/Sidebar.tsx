import type { JSX } from "react";
import { FolderOpen, Layers, Plus, Puzzle, Sparkles, Trash2 } from "lucide-react";
import type { ProjectModule, ProjectSummary } from "../lib/types";

interface SidebarProps {
  projects: readonly ProjectSummary[];
  activeProjectId: string | null;
  modules: readonly ProjectModule[];
  activeModuleId: string | null;
  onOpenProject: (id: string) => void;
  onOpenModule: (id: string) => void;
  onAddModule: () => void;
  onRemoveModule: (id: string) => void;
  onOpenTemplates: () => void;
  onOpenPlugins: () => void;
  onOpenAi: () => void;
}

export function Sidebar({
  projects,
  activeProjectId,
  modules,
  activeModuleId,
  onOpenProject,
  onOpenModule,
  onAddModule,
  onRemoveModule,
  onOpenTemplates,
  onOpenPlugins,
  onOpenAi,
}: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar" aria-label="Project explorer">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">◈</span>
        <div>
          <strong>Visulith</strong>
          <small>Studio</small>
        </div>
      </div>

      <section className="sidebar__section">
        <h2><FolderOpen size={13} aria-hidden="true" /> Projects</h2>
        {projects.length === 0 && <p className="muted">No projects found.</p>}
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={`project-row${project.id === activeProjectId ? " is-active" : ""}`}
                onClick={() => onOpenProject(project.id)}
              >
                <span>{project.name}</span>
                <small>{project.moduleCount} module{project.moduleCount === 1 ? "" : "s"}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sidebar__section sidebar__section--grow">
        <h2>
          <Layers size={13} aria-hidden="true" /> Modules
          <button className="icon-button" type="button" onClick={onAddModule} title="Add graph module" aria-label="Add graph module">
            <Plus size={14} aria-hidden="true" />
          </button>
        </h2>
        {modules.length === 0 && <p className="muted">No modules in this project.</p>}
        <ul className="module-list">
          {modules.map((module) => (
            <li key={module.id} className={module.id === activeModuleId ? "is-active" : ""}>
              <button type="button" className="module-row" onClick={() => onOpenModule(module.id)}>
                <span>{module.kind === "graph" ? "◇" : "⌗"}</span>
                <span className="module-row__name">{module.name}</span>
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={() => onRemoveModule(module.id)}
                title={`Remove ${module.name}`}
                aria-label={`Remove ${module.name}`}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sidebar__section sidebar__nav">
        <button type="button" onClick={onOpenTemplates}><Layers size={14} aria-hidden="true" /> Templates</button>
        <button type="button" onClick={onOpenPlugins}><Puzzle size={14} aria-hidden="true" /> Plugins</button>
        <button type="button" onClick={onOpenAi}><Sparkles size={14} aria-hidden="true" /> AI assistant</button>
      </section>
    </aside>
  );
}
