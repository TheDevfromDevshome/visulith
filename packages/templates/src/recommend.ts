import { BUILTIN_TEMPLATES } from "./builtin.js";
import type { ProjectTemplate } from "./types.js";

export interface RecommendationRequest {
  intent?: string;
  language?: string;
  dependencies?: readonly string[];
}

export interface TemplateScore {
  template: ProjectTemplate;
  score: number;
  reasons: string[];
}

const INTENT_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  "typescript-console": ["console", "cli", "command line", "script"],
  "web-app": ["web", "website", "frontend", "ui", "browser", "vite"],
  "discord-bot": ["discord", "bot", "chat"],
  "library-node-pack": ["library", "node pack", "package", "sdk", "npm"],
  blank: ["blank", "empty", "custom"],
};

const DEPENDENCY_HINTS: Readonly<Record<string, readonly string[]>> = {
  "discord.js": ["discord-bot"],
  vite: ["web-app"],
  react: ["web-app"],
  vue: ["web-app"],
};

/** Deterministic scoring; ties are broken by template id. */
export function rankTemplates(request: RecommendationRequest): TemplateScore[] {
  const intent = (request.intent ?? "").toLowerCase();
  const language = (request.language ?? "").toLowerCase() === "ts" ? "typescript" : (request.language ?? "").toLowerCase();
  const dependencies = (request.dependencies ?? []).map((value) => value.toLowerCase());

  const scores: TemplateScore[] = BUILTIN_TEMPLATES.map((template) => {
    const score: TemplateScore = { template, score: 0, reasons: [] };

    // A stable default keeps recommendations deterministic with no signal.
    if (template.id === "typescript-console") {
      score.score += 1;
      score.reasons.push("default starter template");
    }

    for (const keyword of INTENT_KEYWORDS[template.id] ?? []) {
      if (intent.includes(keyword)) {
        score.score += 3;
        score.reasons.push(`intent mentions "${keyword}"`);
      }
    }

    if (language.length > 0 && template.language === language) {
      score.score += 2;
      score.reasons.push(`language is ${template.language}`);
    }

    for (const dependency of dependencies) {
      for (const target of DEPENDENCY_HINTS[dependency] ?? []) {
        if (target === template.id) {
          score.score += 6;
          score.reasons.push(`dependency ${dependency}`);
        }
      }
      if (dependency === "typescript" && template.language === "typescript") {
        score.score += 1;
        score.reasons.push("dependency typescript");
      }
    }

    return score;
  });

  return scores.sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id));
}

/** Recommend one built-in template. Always returns a deterministic result. */
export function recommendTemplate(request: RecommendationRequest): ProjectTemplate {
  const best = rankTemplates(request)[0];
  // BUILTIN_TEMPLATES is non-empty and rankTemplates returns one entry per template.
  return best === undefined ? BUILTIN_TEMPLATES[0]! : best.template;
}
