import {
  AI_PROPOSAL_SCHEMA_VERSION,
  type AiCapability,
  type AiProposal,
  type AiProposalRequest,
  type AiProvider,
  type GraphMutation,
} from "./types.js";

export const LOCAL_ECHO_PROVIDER_ID = "local-echo";
export const CONSOLE_LOG_DEFINITION_ID = "visulith.core.console-log";
export const CONSOLE_LOG_DEFINITION_VERSION = "0.1";

function messageFromRequest(request: AiProposalRequest): string {
  if (request.options?.message !== undefined && request.options.message.trim().length > 0) {
    return request.options.message.trim();
  }
  const prompt = request.prompt.trim().replace(/\s+/g, " ");
  if (prompt.length === 0) return "Hello from Visulith";
  return prompt.length > 120 ? `${prompt.slice(0, 117)}...` : prompt;
}

function uniqueNodeId(graph: AiProposalRequest["graph"], base: string): string {
  const used = new Set(graph.nodes.map((node) => node.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/**
 * Deterministic rule-based provider. It never calls a model, network, file
 * system, or plugin code; it only describes a graph mutation for review.
 */
export class LocalEchoProvider implements AiProvider {
  readonly id = LOCAL_ECHO_PROVIDER_ID;
  readonly displayName = "Local Echo Provider";
  readonly capabilities: readonly AiCapability[] = ["graphEdit"];

  propose(request: AiProposalRequest): AiProposal {
    const message = messageFromRequest(request);
    const explicitNode = request.options?.nodeId === undefined
      ? undefined
      : request.graph.nodes.find((node) => node.id === request.options?.nodeId);
    const wantsUpdate = /\b(update|change|edit|replace)\b/i.test(request.prompt);
    const existingLog =
      explicitNode?.definitionId === CONSOLE_LOG_DEFINITION_ID
        ? explicitNode
        : wantsUpdate
          ? request.graph.nodes.find((node) => node.definitionId === CONSOLE_LOG_DEFINITION_ID)
          : undefined;

    const mutation: GraphMutation = existingLog === undefined
      ? {
          kind: "addNode",
          graphId: request.graph.id,
          nodeId: uniqueNodeId(request.graph, "console-log"),
          definitionId: CONSOLE_LOG_DEFINITION_ID,
          definitionVersion: CONSOLE_LOG_DEFINITION_VERSION,
          properties: { message },
        }
      : {
          kind: "updateNode",
          graphId: request.graph.id,
          nodeId: existingLog.id,
          definitionId: CONSOLE_LOG_DEFINITION_ID,
          definitionVersion: CONSOLE_LOG_DEFINITION_VERSION,
          properties: { message },
        };

    const marker = mutation.kind === "addNode" ? "+" : "~";
    const diffPreview = [
      `--- graph/${request.graph.id}`,
      `+++ graph/${request.graph.id}`,
      `@@ proposed by ${this.id} @@`,
      `${marker} ${mutation.kind} ${mutation.nodeId} (${mutation.definitionId}@${mutation.definitionVersion})`,
      `  properties.message = ${JSON.stringify(message)}`,
    ].join("\n");

    return {
      schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
      providerId: this.id,
      summary:
        mutation.kind === "addNode"
          ? `Propose adding a Console Log node to graph "${request.graph.id}".`
          : `Propose updating node "${mutation.nodeId}" in graph "${request.graph.id}".`,
      diffPreview,
      mutations: [mutation],
      requiresApproval: true,
      diagnostics: ["LocalEchoProvider is rule-based; no model was called and no files were written."],
    };
  }
}
