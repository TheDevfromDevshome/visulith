import type { GraphDocument } from "@visulith/engine";

function display(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** Small deterministic, human-readable change description used for AI approval previews. */
export function describeGraphChange(before: GraphDocument, after: GraphDocument): string {
  const lines: string[] = [];

  if (before.name !== after.name) lines.push(`~ graph.name: ${display(before.name)} -> ${display(after.name)}`);

  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node] as const));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node] as const));

  for (const node of after.nodes) {
    if (!beforeNodes.has(node.id)) lines.push(`+ node ${node.id}: ${node.definitionId}@${node.definitionVersion}`);
  }
  for (const node of before.nodes) {
    if (!afterNodes.has(node.id)) lines.push(`- node ${node.id}: ${node.definitionId}@${node.definitionVersion}`);
  }
  for (const node of after.nodes) {
    const previous = beforeNodes.get(node.id);
    if (previous === undefined) continue;
    if (display(previous.properties) !== display(node.properties)) {
      lines.push(`~ node ${node.id}.properties: ${display(previous.properties)} -> ${display(node.properties)}`);
    }
  }

  const beforeEdges = new Set(before.connections.map((edge) => edge.id));
  const afterEdges = new Set(after.connections.map((edge) => edge.id));
  for (const edge of after.connections) {
    if (!beforeEdges.has(edge.id)) {
      lines.push(
        `+ connection ${edge.id}: ${edge.source.nodeId}.${edge.source.portId} -> ${edge.target.nodeId}.${edge.target.portId} (${edge.kind})`,
      );
    }
  }
  for (const edge of before.connections) {
    if (!afterEdges.has(edge.id)) lines.push(`- connection ${edge.id}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No structural changes detected.";
}
