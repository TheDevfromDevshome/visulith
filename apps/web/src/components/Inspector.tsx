import type { JSX } from "react";
import { Trash2 } from "lucide-react";
import type { Diagnostic, GraphDocument } from "@visulith/engine";
import { getNodeDefinition } from "../lib/node-definitions";
import { indexDiagnostics } from "../lib/graph";

interface InspectorProps {
  graph: GraphDocument | null;
  nodeId: string | null;
  diagnostics: readonly Diagnostic[];
  onChangeProperties: (nodeId: string, properties: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function Inspector({ graph, nodeId, diagnostics, onChangeProperties, onDeleteNode }: InspectorProps): JSX.Element {
  const node = graph?.nodes.find((entry) => entry.id === nodeId);
  if (graph === null || node === undefined) {
    return (
      <div className="inspector-content">
        <p className="panel-empty">Select a node on the canvas to inspect its ports and properties.</p>
      </div>
    );
  }

  const definition = getNodeDefinition(node.definitionId);
  const nodeDiagnostics = indexDiagnostics(diagnostics).get(node.id) ?? [];

  return (
    <div className="inspector-content">
      <header className="inspector-content__header">
        <div>
          <h3>{definition?.displayName ?? node.definitionId}</h3>
          <p className="muted">{node.id}</p>
        </div>
        <button className="icon-button icon-button--danger" type="button" onClick={() => onDeleteNode(node.id)} title="Delete node" aria-label="Delete node">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </header>

      <section>
        <h4>Definition</h4>
        <dl className="key-value">
          <dt>Definition</dt><dd>{node.definitionId}</dd>
          <dt>Version</dt><dd>{node.definitionVersion}</dd>
          <dt>Category</dt><dd>{definition?.category ?? "unknown"}</dd>
          <dt>Position</dt><dd>{node.position?.x ?? 0}, {node.position?.y ?? 0}</dd>
        </dl>
      </section>

      <section>
        <h4>Properties</h4>
        {definition?.properties.length === 0 && <p className="muted">This node has no editable properties.</p>}
        {definition?.properties.map((property) => {
          const current = node.properties[property.key];
          if (property.enumValues !== undefined) {
            return (
              <label className="field" key={property.key}>
                <span>{property.key} <small>(enum)</small></span>
                <select
                  value={typeof current === "string" ? current : property.enumValues[0]}
                  onChange={(event) => onChangeProperties(node.id, { ...node.properties, [property.key]: event.target.value })}
                >
                  {property.enumValues.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            );
          }
          if (property.type.name !== "core.string") {
            return (
              <label className="field" key={property.key}>
                <span>{property.key} <small>({property.type.name})</small></span>
                <code>{JSON.stringify(current ?? null)}</code>
              </label>
            );
          }
          return (
            <label className="field" key={property.key}>
              <span>{property.key} <small>({property.type.name})</small></span>
              <textarea
                rows={3}
                value={typeof current === "string" ? current : ""}
                onChange={(event) => onChangeProperties(node.id, { ...node.properties, [property.key]: event.target.value })}
              />
            </label>
          );
        })}
      </section>

      <section>
        <h4>Ports</h4>
        <table className="port-table">
          <thead>
            <tr><th>Direction</th><th>Port</th><th>Kind</th><th>Type</th><th>Required</th></tr>
          </thead>
          <tbody>
            {[...(definition?.inputs ?? []), ...(definition?.outputs ?? [])].map((port) => (
              <tr key={`${port.direction}-${port.id}`}>
                <td>{port.direction}</td>
                <td>{port.id}</td>
                <td>{port.kind}</td>
                <td>{port.type.name}</td>
                <td>{port.required === true ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4>Diagnostics ({nodeDiagnostics.length})</h4>
        {nodeDiagnostics.length === 0 && <p className="muted">No diagnostics for this node.</p>}
        <ul className="diagnostic-list">
          {nodeDiagnostics.map((entry, index) => (
            <li key={`${entry.code}-${index}`} className={`diagnostic diagnostic--${entry.severity}`}>
              <strong>{entry.code}</strong>
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
