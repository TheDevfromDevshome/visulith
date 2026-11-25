/** Provider-independent AI proposal types. No provider, network or file I/O is implied. */

export const AI_PROPOSAL_SCHEMA_VERSION = "0.1";

export interface GraphNodeLike {
  id: string;
  definitionId: string;
  definitionVersion: string;
  properties: Record<string, unknown>;
  position?: { x: number; y: number };
}

/** Structurally compatible with the engine's GraphDocument; no runtime dependency. */
export interface GraphDocumentLike {
  schemaVersion: string;
  id: string;
  name: string;
  nodes: GraphNodeLike[];
  connections?: readonly unknown[];
}

export type AiCapability = "graphEdit" | "diagnosticsExplanation" | "codeExplanation" | "projectAdvice";

export interface AiProposalRequest {
  prompt: string;
  graph: GraphDocumentLike;
  options?: {
    nodeId?: string;
    message?: string;
  };
}

export type GraphMutationKind = "addNode" | "updateNode" | "removeNode";

/** A concrete, reviewable description of a graph change. Never applied implicitly. */
export interface GraphMutation {
  kind: GraphMutationKind;
  graphId: string;
  nodeId: string;
  definitionId?: string;
  definitionVersion?: string;
  /** Full replacement property bag for add/update mutations. */
  properties?: Record<string, unknown>;
}

export interface AiProposal {
  schemaVersion: "0.1";
  providerId: string;
  summary: string;
  /** Human-readable unified-diff-like preview; never executed. */
  diffPreview: string;
  mutations: readonly GraphMutation[];
  /** Always true: the service refuses to apply a proposal without an explicit approval. */
  requiresApproval: true;
  diagnostics: readonly string[];
}

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly AiCapability[];
  propose(request: AiProposalRequest): AiProposal;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
}

export type ApprovalResult = boolean | ApprovalDecision;

export type ApprovalCallback = (proposal: AiProposal, request: AiProposalRequest) => ApprovalResult | Promise<ApprovalResult>;

export interface ApplyResult {
  applied: boolean;
  /** The original graph object when rejected; a copy when applied. Never mutates the input. */
  graph: GraphDocumentLike;
  proposal: AiProposal;
  appliedMutations: readonly GraphMutation[];
  reason?: string;
}
