import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { GraphDocument } from "@visulith/engine";
import { getBridge, isDesktopRuntime } from "./lib/bridge";
import { createEmptyGraph, removeEntities } from "./lib/graph";
import { TEXT_SCALES, loadSettings, saveSettings } from "./lib/settings";
import type {
  AIProvider,
  AppSettings,
  Diagnostic,
  GeneratedCode,
  ProjectManifest,
  ProjectModule,
  ProjectSummary,
  RunResult,
  TemplateDescriptor,
} from "./lib/types";
import { AIPanel } from "./components/AIPanel";
import { BottomPanel } from "./components/BottomPanel";
import { CodeViewer } from "./components/CodeViewer";
import { GraphEditor } from "./components/GraphEditor";
import { Inspector } from "./components/Inspector";
import { PluginManager } from "./components/PluginManager";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { TemplatePicker } from "./components/TemplatePicker";

const bridge = getBridge();
const CODE_TAB = "__generated_code__";

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export default function App(): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>(CODE_TAB);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [generated, setGenerated] = useState<GeneratedCode | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [modal, setModal] = useState<"templates" | "plugins" | null>(null);
  const [rightTab, setRightTab] = useState<"inspector" | "settings" | "ai">("inspector");
  const [status, setStatus] = useState("Ready");

  const desktop = useMemo(() => isDesktopRuntime(), []);
  const activeModule = project?.modules.find((module) => module.id === activeTab);
  const activeGraph = activeModule?.graph ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const discoveredProviders = await bridge.listProviders();
        if (active) setProviders(discoveredProviders);
        const summaries = await bridge.listProjects();
        if (!active) return;
        setProjects(summaries);
        const first = summaries[0];
        if (first !== undefined) {
          const loaded = await bridge.openProject(first.id);
          if (!active) return;
          setProject(loaded);
          setOpenTabs(loaded.modules.slice(0, 1).map((module) => module.id));
          setActiveTab(loaded.modules[0]?.id ?? CODE_TAB);
        }
      } catch (cause: unknown) {
        if (active) setStatus(`Startup failed: ${errorMessage(cause)}`);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(14 * TEXT_SCALES[settings.textScale])}px`;
  }, [settings.textScale]);

  useEffect(() => {
    if (activeGraph === null) {
      setDiagnostics([]);
      setGenerated(null);
      return;
    }
    let active = true;
    void Promise.all([bridge.validateGraph(activeGraph), bridge.generateCode(activeGraph)])
      .then(([validation, code]) => {
        if (!active) return;
        const seen = new Set<string>();
        const merged = [...validation, ...code.diagnostics].filter((entry) => {
          const key = `${entry.code}|${entry.origin?.nodeId ?? ""}|${entry.origin?.connectionId ?? ""}|${entry.message}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setDiagnostics(merged);
        setGenerated(code);
      })
      .catch((cause: unknown) => {
        if (active) setStatus(`Analysis failed: ${errorMessage(cause)}`);
      });
    return () => {
      active = false;
    };
  }, [activeGraph]);

  const persist = useCallback(
    (next: ProjectManifest): void => {
      void bridge
        .saveProject(next)
        .then(() => setStatus("Project saved"))
        .catch((cause: unknown) => setStatus(`Save failed: ${errorMessage(cause)}`));
    },
    [],
  );

  const applyGraph = useCallback(
    (graph: GraphDocument): void => {
      if (project === null || activeModule === undefined) return;
      const next: ProjectManifest = {
        ...project,
        modules: project.modules.map((module) => (module.id === activeModule.id ? { ...module, graph } : module)),
      };
      setProject(next);
      persist(next);
    },
    [project, activeModule, persist],
  );

  const openProject = useCallback(async (id: string): Promise<void> => {
    try {
      const loaded = await bridge.openProject(id);
      setProject(loaded);
      setOpenTabs(loaded.modules.slice(0, 1).map((module) => module.id));
      setActiveTab(loaded.modules[0]?.id ?? CODE_TAB);
      setSelectedNodeId(null);
      setStatus(`Opened ${loaded.name}`);
    } catch (cause: unknown) {
      setStatus(`Open failed: ${errorMessage(cause)}`);
    }
  }, []);

  const openModule = useCallback((id: string): void => {
    setActiveTab(id);
    setSelectedNodeId(null);
  }, []);

  const addModule = useCallback((): void => {
    if (project === null) return;
    const id = `graph-${Date.now().toString(36)}`;
    const module: ProjectModule = { id, kind: "graph", name: `${id}.graph`, graph: createEmptyGraph(id, id) };
    const next: ProjectManifest = { ...project, modules: [...project.modules, module] };
    setProject(next);
    setOpenTabs((previous) => [...previous, id]);
    setActiveTab(id);
    persist(next);
  }, [project, persist]);

  const removeModule = useCallback(
    (id: string): void => {
      if (project === null) return;
      const next: ProjectManifest = { ...project, modules: project.modules.filter((module) => module.id !== id) };
      const nextTabs = openTabs.filter((tab) => tab !== id);
      setProject(next);
      setOpenTabs(nextTabs);
      if (activeTab === id) setActiveTab(nextTabs[0] ?? CODE_TAB);
      setSelectedNodeId(null);
      persist(next);
    },
    [project, openTabs, activeTab, persist],
  );

  const createFromTemplate = useCallback(
    (template: TemplateDescriptor): void => {
      let id = template.graph.id || "new-project";
      let suffix = 2;
      while (projects.some((entry) => entry.id === id)) id = `${template.graph.id}-${suffix++}`;
      const manifest: ProjectManifest = {
        schemaVersion: "0.1",
        id,
        name: template.name,
        modules: [{ id: "main", kind: "graph", name: "main.graph", graph: { ...template.graph, id } }],
      };
      void bridge
        .saveProject(manifest)
        .then(async () => {
          setProjects(await bridge.listProjects());
          setProject(manifest);
          setOpenTabs(["main"]);
          setActiveTab("main");
          setSelectedNodeId(null);
          setModal(null);
          setStatus(`Created project ${manifest.name}`);
        })
        .catch((cause: unknown) => setStatus(`Template failed: ${errorMessage(cause)}`));
    },
    [projects],
  );

  const selectNode = useCallback((nodeId: string | null): void => {
    setSelectedNodeId(nodeId);
    if (nodeId !== null) setRightTab("inspector");
  }, []);

  const updateProperties = useCallback(
    (nodeId: string, properties: Record<string, unknown>): void => {
      if (activeGraph === null) return;
      applyGraph({
        ...activeGraph,
        nodes: activeGraph.nodes.map((node) => (node.id === nodeId ? { ...node, properties } : node)),
      });
    },
    [activeGraph, applyGraph],
  );

  const deleteNode = useCallback(
    (nodeId: string): void => {
      if (activeGraph === null) return;
      applyGraph(removeEntities(activeGraph, [nodeId], []));
      setSelectedNodeId(null);
    },
    [activeGraph, applyGraph],
  );

  const run = useCallback(async (): Promise<void> => {
    if (activeGraph === null) return;
    setRunning(true);
    try {
      const result = await bridge.runProgram({ graph: activeGraph, providerId: settings.providerId });
      setRunResult(result);
      setStatus(result.mode === "desktop" ? "Program executed on the Tauri host." : "Browser preview finished.");
    } catch (cause: unknown) {
      setRunResult({
        mode: desktop ? "desktop" : "browser-preview",
        output: "",
        diagnostics: [],
        exitCode: 1,
        note: `Run failed: ${errorMessage(cause)}`,
      });
      setStatus(`Run failed: ${errorMessage(cause)}`);
    } finally {
      setRunning(false);
    }
  }, [activeGraph, settings.providerId, desktop]);

  const updateSettings = useCallback((patch: Partial<AppSettings>): void => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const visibleTabs = project?.modules.filter((module) => openTabs.includes(module.id)) ?? [];

  return (
    <div className="app" data-theme={settings.theme} data-contrast={settings.contrast}>
      <header className="app-header">
        <div className="app-header__title">
          <strong>Visulith Studio</strong>
          {project !== null && <span className="muted">/ {project.name}</span>}
        </div>
        <div className="app-header__right">
          <span className={`badge ${desktop ? "badge--desktop" : "badge--browser"}`}>
            {desktop ? "Tauri desktop" : "Browser build"}
          </span>
          <span className="status">{status}</span>
        </div>
      </header>

      <div className="app-body">
        <Sidebar
          projects={projects}
          activeProjectId={project?.id ?? null}
          modules={project?.modules ?? []}
          activeModuleId={activeModule?.id ?? null}
          onOpenProject={(id) => void openProject(id)}
          onOpenModule={openModule}
          onAddModule={addModule}
          onRemoveModule={removeModule}
          onOpenTemplates={() => setModal("templates")}
          onOpenPlugins={() => setModal("plugins")}
          onOpenAi={() => setRightTab("ai")}
        />

        <main className="main-area">
          <nav className="tab-bar" role="tablist" aria-label="Open modules">
            {visibleTabs.map((module) => (
              <button
                type="button"
                role="tab"
                aria-selected={module.id === activeTab}
                className={module.id === activeTab ? "is-active" : ""}
                key={module.id}
                onClick={() => openModule(module.id)}
              >
                ◇ {module.name}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === CODE_TAB}
              className={activeTab === CODE_TAB ? "is-active" : ""}
              onClick={() => setActiveTab(CODE_TAB)}
            >
              &lt;/&gt; Generated code
            </button>
          </nav>

          <div className="main-content">
            {activeTab === CODE_TAB ? (
              <CodeViewer generated={generated} />
            ) : activeGraph !== null ? (
              <GraphEditor
                graph={activeGraph}
                diagnostics={diagnostics}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectNode}
                onChange={applyGraph}
              />
            ) : (
              <p className="panel-empty">Open or create a graph module to start editing.</p>
            )}
          </div>

          <BottomPanel
            diagnostics={diagnostics}
            generated={generated}
            runResult={runResult}
            running={running}
            desktop={desktop}
            onRun={() => void run()}
            onSelectNode={selectNode}
          />
        </main>

        <aside className="inspector" aria-label="Inspector">
          <nav className="inspector__tabs" role="tablist" aria-label="Inspector views">
            <button type="button" role="tab" aria-selected={rightTab === "inspector"} className={rightTab === "inspector" ? "is-active" : ""} onClick={() => setRightTab("inspector")}>Inspector</button>
            <button type="button" role="tab" aria-selected={rightTab === "settings"} className={rightTab === "settings" ? "is-active" : ""} onClick={() => setRightTab("settings")}>Settings</button>
            <button type="button" role="tab" aria-selected={rightTab === "ai"} className={rightTab === "ai" ? "is-active" : ""} onClick={() => setRightTab("ai")}>AI</button>
          </nav>
          {rightTab === "inspector" && (
            <Inspector
              graph={activeGraph}
              nodeId={selectedNodeId}
              diagnostics={diagnostics}
              onChangeProperties={updateProperties}
              onDeleteNode={deleteNode}
            />
          )}
          {rightTab === "settings" && <SettingsPanel settings={settings} providers={providers} onChange={updateSettings} />}
          {rightTab === "ai" && (
            <AIPanel graph={activeGraph} providers={providers} providerId={settings.providerId} onApply={applyGraph} />
          )}
        </aside>
      </div>

      {modal === "templates" && <TemplatePicker onClose={() => setModal(null)} onCreate={createFromTemplate} />}
      {modal === "plugins" && <PluginManager onClose={() => setModal(null)} />}
    </div>
  );
}
