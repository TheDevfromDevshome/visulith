import type {
  AiProposal,
  AiProposalRequest,
  AiProvider,
  ApplyResult,
  ApprovalCallback,
  ApprovalResult,
  GraphDocumentLike,
  GraphMutation,
  GraphNodeLike,
} from "./types.js";

function normalizeDecision(result: ApprovalResult): { approved: boolean; reason?: string } {
  if (typeof result === "boolean") return { approved: result };
  return { approved: result.approved, ...(result.reason === undefined ? {} : { reason: result.reason }) };
}

function cloneGraph(graph: GraphDocumentLike): GraphDocumentLike {
  const nodes: GraphNodeLike[] = graph.nodes.map((node) => ({
    id: node.id,
    definitionId: node.definitionId,
    definitionVersion: node.definitionVersion,
    properties: { ...node.properties },
    ...(node.position === undefined ? {} : { position: { ...node.position } }),
  }));
  return {
    schemaVersion: graph.schemaVersion,
    id: graph.id,
    name: graph.name,
    nodes,
    ...(graph.connections === undefined ? {} : { connections: [...graph.connections] }),
  };
}

function applyMutation(graph: GraphDocumentLike, mutation: GraphMutation): string | undefined {
  if (graph.id !== mutation.graphId) return `Proposal targets graph "${mutation.graphId}", received "${graph.id}".`;

  if (mutation.kind === "addNode") {
    if (graph.nodes.some((node) => node.id === mutation.nodeId)) {
      return `Node "${mutation.nodeId}" already exists.`;
    }
    if (mutation.definitionId === undefined || mutation.definitionVersion === undefined) {
      return 'addNode requires "definitionId" and "definitionVersion".';
    }
    graph.nodes.push({
      id: mutation.nodeId,
      definitionId: mutation.definitionId,
      definitionVersion: mutation.definitionVersion,
      properties: { ...(mutation.properties ?? {}) },
    });
    return undefined;
  }

  if (mutation.kind === "updateNode") {
    const index = graph.nodes.findIndex((node) => node.id === mutation.nodeId);
    if (index < 0) return `Node "${mutation.nodeId}" does not exist.`;
    const existing = graph.nodes[index]!;
    graph.nodes[index] = {
      ...existing,
      ...(mutation.definitionId === undefined ? {} : { definitionId: mutation.definitionId }),
      ...(mutation.definitionVersion === undefined ? {} : { definitionVersion: mutation.definitionVersion }),
      ...(mutation.properties === undefined ? {} : { properties: { ...mutation.properties } }),
    };
    return undefined;
  }

  const index = graph.nodes.findIndex((node) => node.id === mutation.nodeId);
  if (index < 0) return `Node "${mutation.nodeId}" does not exist.`;
  graph.nodes.splice(index, 1);
  return undefined;
}

/**
 * Provider registry and explicit approval gate.
 *
 * AI proposals are data only. This service never writes files, executes code,
 * or changes a graph unless the supplied approval callback approves the exact
 * proposal. Even then, the caller receives a copy; the input graph is untouched.
 */
export class AIService {
  private readonly providers = new Map<string, AiProvider>();

  registerProvider(provider: AiProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`AI provider "${provider.id}" is already registered.`);
    }
    this.providers.set(provider.id, provider);
  }

  listProviders(): readonly AiProvider[] {
    return [...this.providers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getProvider(id: string): AiProvider | undefined {
    return this.providers.get(id);
  }

  requestProposal(providerId: string, request: AiProposalRequest): AiProposal {
    const provider = this.providers.get(providerId);
    if (provider === undefined) throw new Error(`Unknown AI provider "${providerId}".`);
    return provider.propose(request);
  }

  async applyProposal(
    proposal: AiProposal,
    request: AiProposalRequest,
    approve: ApprovalCallback,
  ): Promise<ApplyResult> {
    const decision = normalizeDecision(await approve(proposal, request));
    if (!decision.approved) {
      return {
        applied: false,
        graph: request.graph,
        proposal,
        appliedMutations: [],
        reason: decision.reason ?? "Proposal was not approved.",
      };
    }

    if (proposal.requiresApproval !== true) {
      return {
        applied: false,
        graph: request.graph,
        proposal,
        appliedMutations: [],
        reason: "Proposal did not explicitly require approval; refusing to apply.",
      };
    }

    const graph = cloneGraph(request.graph);
    const appliedMutations: GraphMutation[] = [];
    for (const mutation of proposal.mutations) {
      const failure = applyMutation(graph, mutation);
      if (failure !== undefined) {
        return {
          applied: false,
          graph: request.graph,
          proposal,
          appliedMutations: [],
          reason: failure,
        };
      }
      appliedMutations.push(mutation);
    }

    return { applied: true, graph, proposal, appliedMutations };
  }
}
