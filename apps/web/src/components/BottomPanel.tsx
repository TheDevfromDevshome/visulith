import { useState, type JSX } from "react";
import { AlertCircle, AlertTriangle, Info, Play } from "lucide-react";
import type { Diagnostic } from "@visulith/engine";
import type { GeneratedCode, RunResult } from "../lib/types";

interface BottomPanelProps {
  diagnostics: readonly Diagnostic[];
  generated: GeneratedCode | null;
  runResult: RunResult | null;
  running: boolean;
  desktop: boolean;
  onRun: () => void;
  onSelectNode: (nodeId: string) => void;
}

function SeverityIcon({ severity }: { severity: Diagnostic["severity"] }): JSX.Element {
  if (severity === "error") return <AlertCircle size={13} aria-hidden="true" />;
  if (severity === "warning") return <AlertTriangle size={13} aria-hidden="true" />;
  return <Info size={13} aria-hidden="true" />;
}

export function BottomPanel({
  diagnostics,
  generated,
  runResult,
  running,
  desktop,
  onRun,
  onSelectNode,
}: BottomPanelProps): JSX.Element {
  const [view, setView] = useState<"diagnostics" | "output">("diagnostics");
  const errors = diagnostics.filter((entry) => entry.severity === "error").length;
  const warnings = diagnostics.filter((entry) => entry.severity === "warning").length;

  return (
    <section className="bottom-panel" aria-label="Build and run panel">
      <header className="bottom-panel__header">
        <div className="bottom-panel__tabs" role="tablist" aria-label="Build output views">
          <button type="button" role="tab" aria-selected={view === "diagnostics"} className={view === "diagnostics" ? "is-active" : ""} onClick={() => setView("diagnostics")}>
            Diagnostics <span className="pill">{diagnostics.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={view === "output"} className={view === "output" ? "is-active" : ""} onClick={() => setView("output")}>
            Output
          </button>
        </div>
        <div className="bottom-panel__actions">
          <span className="muted">
            {errors} error{errors === 1 ? "" : "s"} · {warnings} warning{warnings === 1 ? "" : "s"}
          </span>
          <button className="button button--primary" type="button" onClick={onRun} disabled={running}>
            <Play size={14} aria-hidden="true" /> {running ? "Running…" : "Run"}
          </button>
        </div>
      </header>

      {view === "diagnostics" ? (
        <div className="bottom-panel__body" role="tabpanel">
          {diagnostics.length === 0 ? (
            <p className="panel-empty">No diagnostics. The graph is valid.</p>
          ) : (
            <ul className="diagnostic-list">
              {diagnostics.map((entry, index) => {
                const nodeId = entry.origin?.nodeId;
                return (
                  <li key={`${entry.code}-${index}`} className={`diagnostic diagnostic--${entry.severity}`}>
                    <SeverityIcon severity={entry.severity} />
                    <div>
                      <div className="diagnostic__title">
                        <strong>{entry.code}</strong>
                        {nodeId !== undefined && (
                          <button type="button" className="link-button" onClick={() => onSelectNode(nodeId)}>
                            {nodeId}
                          </button>
                        )}
                      </div>
                      <span>{entry.message}</span>
                      {entry.remediation !== undefined && <small>{entry.remediation}</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="bottom-panel__body bottom-panel__body--output" role="tabpanel">
          <div className="run-banner">
            <span className={`badge ${runResult?.mode === "desktop" || desktop ? "badge--desktop" : "badge--browser"}`}>
              {runResult?.mode === "desktop" || desktop ? "Tauri desktop runtime" : "Browser preview"}
            </span>
            <span className="muted">
              {runResult?.note ??
                (desktop
                  ? "Run calls invoke('run_program', …) on the Tauri host."
                  : "No child process is started in the browser; the supported graph subset is interpreted in the UI.")}
            </span>
          </div>
          <div className="output-grid">
            <div>
              <h4>Program output</h4>
              <pre className="output-block">{runResult === null ? "(not run yet)" : runResult.output || "(no output)"}</pre>
            </div>
            <div>
              <h4>Generated output</h4>
              <pre className="output-block">{generated?.code ?? "(no generated code)"}</pre>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
