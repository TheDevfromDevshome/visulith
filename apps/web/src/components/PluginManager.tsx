import { useEffect, useState, type JSX } from "react";
import { X } from "lucide-react";
import { getBridge } from "../lib/bridge";
import type { PluginManifest } from "../lib/types";

interface PluginManagerProps {
  onClose: () => void;
}

export function PluginManager({ onClose }: PluginManagerProps): JSX.Element {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getBridge()
      .listPlugins()
      .then((items) => {
        if (!active) return;
        setPlugins(items);
        setDisabled(new Set(items.filter((item) => !item.enabled).map((item) => item.id)));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not list plugins.");
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = (id: string): void => {
    setDisabled((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Plugin manager">
        <header className="modal__header">
          <div>
            <h2>Plugin manager</h2>
            <p className="muted">Discovered manifests. Toggles are local UI state for this session.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close plugin manager"><X size={16} aria-hidden="true" /></button>
        </header>
        {error !== null && <p className="inline-error">{error}</p>}
        <div className="plugin-list">
          {plugins.map((plugin) => {
            const enabled = !disabled.has(plugin.id);
            return (
              <article className="plugin-card" key={plugin.id}>
                <div className="plugin-card__head">
                  <div>
                    <h3>{plugin.name} <small>v{plugin.version}</small></h3>
                    <p>{plugin.description}</p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={enabled} onChange={() => toggle(plugin.id)} aria-label={`Enable ${plugin.name}`} />
                    <span>{enabled ? "Enabled" : "Disabled"}</span>
                  </label>
                </div>
                <div className="chip-row">
                  {plugin.categories.map((category) => <span className="chip" key={`cat-${category}`}>category: {category}</span>)}
                  {plugin.capabilities.map((capability) => <span className="chip chip--accent" key={`cap-${capability}`}>{capability}</span>)}
                  {plugin.permissions.map((permission) => <span className="chip chip--warning" key={`perm-${permission}`}>{permission}</span>)}
                </div>
                <code className="plugin-card__id">{plugin.id}</code>
              </article>
            );
          })}
          {plugins.length === 0 && error === null && <p className="panel-empty">Loading plugins…</p>}
        </div>
      </div>
    </div>
  );
}
