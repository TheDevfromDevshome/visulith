export interface AcceleratorInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const CONTROL_KEYS = new Set(["r", "f", "p", "+", "-", "=", "0"]);
const DEVTOOLS_KEYS = new Set(["i", "c", "j"]);

/** Browser-only shortcuts that should never reload or inspect a packaged app. */
export function isBrowserAccelerator(event: AcceleratorInput): boolean {
  const key = event.key.toLowerCase();
  if (key === "f5" || key === "f12") return true;
  if (!event.ctrlKey && !event.metaKey) return false;
  if (event.altKey) return false;
  if (CONTROL_KEYS.has(key)) return true;
  return event.shiftKey && DEVTOOLS_KEYS.has(key);
}

/**
 * Suppress browser affordances that make a Tauri window feel like a web page.
 * The web build keeps its normal context menu so development stays usable.
 */
export function installDesktopWebviewGuards(target: EventTarget, desktop: boolean): () => void {
  if (!desktop) return () => undefined;

  const suppressContextMenu = (event: Event): void => event.preventDefault();
  const suppressAccelerator = (event: KeyboardEvent): void => {
    if (isBrowserAccelerator(event)) event.preventDefault();
  };

  // Capture before React so editor shortcuts cannot re-enable browser actions.
  const options: AddEventListenerOptions = { capture: true };
  target.addEventListener("contextmenu", suppressContextMenu, options);
  target.addEventListener("keydown", suppressAccelerator as EventListener, options);

  return () => {
    target.removeEventListener("contextmenu", suppressContextMenu, options);
    target.removeEventListener("keydown", suppressAccelerator as EventListener, options);
  };
}
