import { useEffect, useState, type JSX } from "react";
import { X } from "lucide-react";
import { getBridge } from "../lib/bridge";
import type { TemplateDescriptor } from "../lib/types";

interface TemplatePickerProps {
  onClose: () => void;
  onCreate: (template: TemplateDescriptor) => void;
}

export function TemplatePicker({ onClose, onCreate }: TemplatePickerProps): JSX.Element {
  const [templates, setTemplates] = useState<TemplateDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getBridge()
      .listTemplates()
      .then((items) => {
        if (active) setTemplates(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not list templates.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Template picker">
        <header className="modal__header">
          <div>
            <h2>New project from a template</h2>
            <p className="muted">Templates come from the bridge (local built-ins or Tauri host).</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close template picker"><X size={16} aria-hidden="true" /></button>
        </header>
        {error !== null && <p className="inline-error">{error}</p>}
        <div className="template-grid">
          {templates.map((template) => (
            <article className="template-card" key={template.id}>
              <span className="badge badge--neutral">{template.category}</span>
              <h3>{template.name}</h3>
              <p>{template.description}</p>
              <dl className="key-value">
                <dt>Graph id</dt><dd>{template.graph.id}</dd>
                <dt>Nodes</dt><dd>{template.graph.nodes.length}</dd>
              </dl>
              <button className="button button--primary" type="button" onClick={() => onCreate(template)}>Use template</button>
            </article>
          ))}
          {templates.length === 0 && error === null && <p className="panel-empty">Loading templates…</p>}
        </div>
      </div>
    </div>
  );
}
