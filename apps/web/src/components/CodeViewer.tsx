import { useCallback, useState, type JSX } from "react";
import { Check, Copy } from "lucide-react";
import { Editor } from "../lib/monaco";
import type { GeneratedCode } from "../lib/types";

interface CodeViewerProps {
  generated: GeneratedCode | null;
}

export function CodeViewer({ generated }: CodeViewerProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const code = generated?.code ?? "";

  const copyCode = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <section className="code-viewer" aria-label="Generated TypeScript">
      <header className="code-viewer__header">
        <div>
          <h2>Generated TypeScript</h2>
          <p>Derived output. Edit the graph, not this file.</p>
        </div>
        <button className="button button--ghost" type="button" onClick={() => void copyCode()} disabled={code.length === 0}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </header>
      <div className="code-viewer__editor">
        <Editor
          height="100%"
          path="generated.ts"
          language="typescript"
          theme="vs-dark"
          value={code}
          loading={<div className="panel-empty">Loading editor…</div>}
          options={{
            readOnly: true,
            domReadOnly: true,
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            renderLineHighlight: "line",
            wordWrap: "on",
          }}
        />
      </div>
      <div className="code-viewer__mappings">
        <h3>Source map mappings</h3>
        {generated === null || generated.sourceMap.length === 0 ? (
          <p className="muted">No mappings yet. Add a valid node chain to generate code.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Generated line</th>
                <th>Column</th>
                <th>Graph</th>
                <th>Node</th>
                <th>Port</th>
              </tr>
            </thead>
            <tbody>
              {generated.sourceMap.map((mapping, index) => (
                <tr key={`${mapping.generatedLine}-${mapping.generatedColumn}-${index}`}>
                  <td>{mapping.generatedLine}</td>
                  <td>{mapping.generatedColumn}</td>
                  <td>{mapping.origin.graphId ?? "—"}</td>
                  <td>{mapping.origin.nodeId ?? "—"}</td>
                  <td>{mapping.origin.portId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
