import type { AppSettings } from "./types";

export const SETTINGS_KEY = "visulith.settings.v1";

export const TEXT_SCALES: Record<AppSettings["textScale"], number> = {
  small: 0.9,
  normal: 1,
  large: 1.12,
  xlarge: 1.25,
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  contrast: "normal",
  textScale: "normal",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_SETTINGS };
    const theme = parsed["theme"];
    const contrast = parsed["contrast"];
    const textScale = parsed["textScale"];
    const providerId = parsed["providerId"];
    return {
      theme: theme === "dark" || theme === "light" ? theme : DEFAULT_SETTINGS.theme,
      contrast: contrast === "normal" || contrast === "high" || contrast === "max" ? contrast : DEFAULT_SETTINGS.contrast,
      textScale:
        textScale === "small" || textScale === "normal" || textScale === "large" || textScale === "xlarge"
          ? textScale
          : DEFAULT_SETTINGS.textScale,
      ...(typeof providerId === "string" && providerId.length > 0 ? { providerId } : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be disabled (private mode, embedded webview); settings still work for this session.
  }
}
