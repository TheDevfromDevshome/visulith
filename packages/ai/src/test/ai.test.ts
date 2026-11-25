import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIService,
  CONSOLE_LOG_DEFINITION_ID,
  LOCAL_ECHO_PROVIDER_ID,
  LocalEchoProvider,
  type AiProposalRequest,
  type GraphDocumentLike,
} from "../index.js";

function sampleGraph(): GraphDocumentLike {
  return {
    schemaVersion: "0.1",
    id: "main",
    name: "Main",
    nodes: [
      { id: "start", definitionId: "visulith.core.start", definitionVersion: "0.1", properties: {} },
    ],
    connections: [],
  };
}

function request(prompt = "add a console log saying hello"): AiProposalRequest {
  return { prompt, graph: sampleGraph() };
}

function serviceWithProvider(): AIService {
  const service = new AIService();
  service.registerProvider(new LocalEchoProvider());
  return service;
}

test("provider registration and listing are deterministic", () => {
  const service = serviceWithProvider();
  assert.deepEqual(service.listProviders().map((provider) => provider.id), [LOCAL_ECHO_PROVIDER_ID]);
  assert.equal(service.getProvider(LOCAL_ECHO_PROVIDER_ID)?.displayName, "Local Echo Provider");
  assert.throws(() => service.registerProvider(new LocalEchoProvider()), /already registered/);
  assert.throws(() => service.requestProposal("missing", request()), /Unknown AI provider/);
});

test("LocalEchoProvider describes an additive graph mutation and a readable diff", () => {
  const service = serviceWithProvider();
  const proposal = service.requestProposal(LOCAL_ECHO_PROVIDER_ID, request());
  assert.equal(proposal.requiresApproval, true);
  assert.equal(proposal.mutations.length, 1);
  assert.deepEqual(proposal.mutations[0], {
    kind: "addNode",
    graphId: "main",
    nodeId: "console-log",
    definitionId: CONSOLE_LOG_DEFINITION_ID,
    definitionVersion: "0.1",
    properties: { message: "add a console log saying hello" },
  });
  assert.match(proposal.diffPreview, /--- graph\/main/);
  assert.match(proposal.diffPreview, /\+ addNode console-log/);
  assert.match(proposal.summary, /Propose adding/);
});

test("no mutation occurs without explicit approval", async () => {
  const service = serviceWithProvider();
  const graph = sampleGraph();
  const proposalRequest: AiProposalRequest = { prompt: "print hello", graph };
  const proposal = service.requestProposal(LOCAL_ECHO_PROVIDER_ID, proposalRequest);

  const rejected = await service.applyProposal(proposal, proposalRequest, () => false);
  assert.equal(rejected.applied, false);
  assert.equal(rejected.graph, graph);
  assert.deepEqual(rejected.appliedMutations, []);
  assert.match(rejected.reason ?? "", /not approved/);
  assert.equal(graph.nodes.length, 1);

  const declined = await service.applyProposal(proposal, proposalRequest, () => ({
    approved: false,
    reason: "user declined",
  }));
  assert.equal(declined.applied, false);
  assert.equal(declined.reason, "user declined");
  assert.equal(graph.nodes.length, 1);
});

test("approval applies mutations to a copy and leaves the input untouched", async () => {
  const service = serviceWithProvider();
  const graph = sampleGraph();
  const proposalRequest: AiProposalRequest = {
    prompt: "log something",
    graph,
    options: { message: "approved message" },
  };
  const proposal = service.requestProposal(LOCAL_ECHO_PROVIDER_ID, proposalRequest);
  const result = await service.applyProposal(proposal, proposalRequest, async () => true);

  assert.equal(result.applied, true);
  assert.notEqual(result.graph, graph);
  assert.equal(graph.nodes.length, 1);
  assert.equal(result.graph.nodes.length, 2);
  assert.deepEqual(result.graph.nodes[1], {
    id: "console-log",
    definitionId: CONSOLE_LOG_DEFINITION_ID,
    definitionVersion: "0.1",
    properties: { message: "approved message" },
  });
});

test("update proposals target an existing console log node", async () => {
  const service = serviceWithProvider();
  const graph = sampleGraph();
  graph.nodes.push({
    id: "existing-log",
    definitionId: CONSOLE_LOG_DEFINITION_ID,
    definitionVersion: "0.1",
    properties: { message: "old" },
  });
  const proposalRequest: AiProposalRequest = {
    prompt: "update the console log",
    graph,
    options: { message: "new" },
  };
  const proposal = service.requestProposal(LOCAL_ECHO_PROVIDER_ID, proposalRequest);
  assert.equal(proposal.mutations[0]?.kind, "updateNode");
  assert.equal(proposal.mutations[0]?.nodeId, "existing-log");

  const result = await service.applyProposal(proposal, proposalRequest, () => true);
  assert.equal(result.applied, true);
  assert.equal(result.graph.nodes[1]?.properties["message"], "new");
  assert.equal(graph.nodes[1]?.properties["message"], "old");
});
