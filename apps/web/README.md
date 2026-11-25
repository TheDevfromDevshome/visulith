# @visulith/web

Vite + React 19 + TypeScript UI for Visulith. It is a plain browser app and is also the frontend bundle used by the future Tauri desktop shell: the same components run in both, and only `src/lib/bridge.ts` changes behaviour when `window.__TAURI__` is present.

## Development

From the repository root:

```powershell
pnpm --filter @visulith/web dev
```

Other scripts:

```powershell
pnpm --filter @visulith/web build     # tsc --noEmit + vite build
pnpm --filter @visulith/web preview   # serve the production build
pnpm --filter @visulith/web test      # node:test via tsx
```

The app imports `@visulith/engine`, so build the engine first (`pnpm --filter @visulith/engine build`) on a clean checkout.

## Layout

- `src/lib/bridge.ts` — `WebBridge` (localStorage + in-engine validation/codegen) and `DesktopBridge` (Tauri `invoke` with fallback to the web bridge).
- `src/lib/types.ts` — project, plugin, provider, proposal and settings types plus the `Bridge` interface.
- `src/components/GraphEditor.tsx` — React Flow canvas, typed ports, palette and drag/drop.
- `src/components/CodeViewer.tsx` — read-only Monaco view with source-map mappings and copy button.
- `src/components/BottomPanel.tsx` — diagnostics, run output and the Run button.
- `src/components/` — inspector, settings, AI approval panel, template picker and plugin manager.

## Runtime behaviour

In a browser, Run is explicitly labelled **Browser preview**: the supported graph subset is interpreted in-process and no child process or compiler is started. When Tauri is available, `DesktopBridge` calls `invoke('run_program', { graph, providerId })`, plus `list_projects`, `open_project`, `save_project`, `list_templates`, `list_plugins`, `list_providers` and `propose_change`. Validation and TypeScript generation always use the local engine package.
