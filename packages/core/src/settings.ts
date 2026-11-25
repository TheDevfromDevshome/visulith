export interface Settings {
  theme: "dark" | "light";
  contrast: "normal" | "high";
  textScale: number;
  telemetry: boolean;
  aiProvider: string | undefined;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  contrast: "normal",
  textScale: 1,
  telemetry: false,
  aiProvider: undefined,
};

export function normalizeSettings(input: Partial<Settings>): Settings {
  return {
    theme: input.theme === "light" ? "light" : "dark",
    contrast: input.contrast === "high" ? "high" : "normal",
    textScale: Math.min(1.5, Math.max(0.8, input.textScale ?? 1)),
    telemetry: input.telemetry === true,
    aiProvider: input.aiProvider,
  };
}
