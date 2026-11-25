import type { JSX } from "react";
import type { AIProvider, AppSettings } from "../lib/types";

interface SettingsPanelProps {
  settings: AppSettings;
  providers: readonly AIProvider[];
  onChange: (patch: Partial<AppSettings>) => void;
}

export function SettingsPanel({ settings, providers, onChange }: SettingsPanelProps): JSX.Element {
  return (
    <div className="inspector-content">
      <section>
        <h4>Appearance</h4>
        <label className="field">
          <span>Theme</span>
          <select value={settings.theme} onChange={(event) => onChange({ theme: event.target.value as AppSettings["theme"] })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="field">
          <span>Contrast</span>
          <select value={settings.contrast} onChange={(event) => onChange({ contrast: event.target.value as AppSettings["contrast"] })}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="max">Maximum</option>
          </select>
        </label>
        <label className="field">
          <span>Text scale</span>
          <select value={settings.textScale} onChange={(event) => onChange({ textScale: event.target.value as AppSettings["textScale"] })}>
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="xlarge">Extra large</option>
          </select>
        </label>
      </section>

      <section>
        <h4>AI provider</h4>
        <label className="field">
          <span>Preferred provider</span>
          <select
            value={settings.providerId ?? ""}
            onChange={(event) => onChange({ providerId: event.target.value.length > 0 ? event.target.value : undefined })}
          >
            <option value="">Automatic (first available)</option>
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>{provider.name} ({provider.kind})</option>
            ))}
          </select>
        </label>
        <p className="muted">Provider proposals are never applied automatically.</p>
      </section>

      <section>
        <h4>Runtime</h4>
        <p className="muted">Projects and settings are stored in localStorage in the browser build. The same bundle is loaded by the Tauri shell, where the bridge switches to IPC calls.</p>
      </section>
    </div>
  );
}
