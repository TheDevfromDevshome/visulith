import { error, hasErrors, type Diagnostic, type ValidationResult } from "../diagnostics.js";
import { analyzeDataflow, type DataflowAnalysis } from "../graph/dataflow.js";
import { CORE_ADD, CORE_DATA_LOG, CORE_INT_LITERAL } from "../graph/dataflow-nodes.js";
import { validateGraph } from "../graph/validate.js";
import type { GraphDocument, GraphNode } from "../graph/types.js";
import { TYPES } from "../graph/types.js";
import { IR_VERSION, unitType, type IrExpression, type IrModule, type IrStatement } from "./types.js";

interface LoweringContext {
  graphId: string;
  analysis: DataflowAnalysis;
  diagnostics: Diagnostic[];
  statements: IrStatement[];
  expressions: Map<string, IrExpression>;
  counter: number;
}

function origin(context: LoweringContext, node: GraphNode): { graphId: string; nodeId: string } {
  return { graphId: context.graphId, nodeId: node.id };
}

function variableName(context: LoweringContext, node: GraphNode): string {
  const index = context.counter++;
  const suffix = node.id.replace(/[^A-Za-z0-9_$]/g, "_") || "node";
  return `__visulith_df_${index}_${suffix}`;
}

function inputNodeId(context: LoweringContext, node: GraphNode, portId: string): string | undefined {
  const connection = context.analysis.incomingByPort.get(`${node.id}:${portId}`);
  if (connection === undefined) {
    context.diagnostics.push(
      error("IR_DATAFLOW_INPUT_MISSING", `Input "${portId}" on "${node.id}" is not connected.`, origin(context, node)),
    );
    return undefined;
  }
  return connection.source.nodeId;
}

function evaluate(nodeId: string, context: LoweringContext, visiting: Set<string>): IrExpression | undefined {
  const cached = context.expressions.get(nodeId);
  if (cached !== undefined) return cached;
  if (visiting.has(nodeId)) {
    context.diagnostics.push(
      error("IR_DATAFLOW_CYCLE", `Dataflow cycle reaches node "${nodeId}".`, { graphId: context.graphId, nodeId }),
    );
    return undefined;
  }
  const node = context.analysis.nodeById.get(nodeId);
  if (node === undefined) {
    context.diagnostics.push(
      error("IR_DATAFLOW_NODE_MISSING", `Node "${nodeId}" does not exist.`, { graphId: context.graphId, nodeId }),
    );
    return undefined;
  }

  visiting.add(nodeId);
  let expression: IrExpression | undefined;
  if (node.definitionId === CORE_INT_LITERAL.definitionId) {
    const value = node.properties["value"];
    if (typeof value === "number" && Number.isInteger(value)) {
      expression = { kind: "integer", value };
    } else {
      context.diagnostics.push(
        error(
          "IR_DATAFLOW_LITERAL_INVALID",
          `Integer literal "${node.id}" must be a whole number.`,
          origin(context, node),
        ),
      );
    }
  } else if (node.definitionId === CORE_ADD.definitionId) {
    const leftId = inputNodeId(context, node, "left");
    const rightId = inputNodeId(context, node, "right");
    const left = leftId === undefined ? undefined : evaluate(leftId, context, visiting);
    const right = rightId === undefined ? undefined : evaluate(rightId, context, visiting);
    if (left !== undefined && right !== undefined) {
      const name = variableName(context, node);
      context.statements.push({
        kind: "variable",
        name,
        type: TYPES.i32,
        value: { kind: "binary", operator: "+", left, right },
        origin: origin(context, node),
      });
      expression = { kind: "variable", name };
    }
  } else {
    context.diagnostics.push(
      error(
        "IR_NODE_UNSUPPORTED",
        `Node definition "${node.definitionId}" has no dataflow lowering handler.`,
        origin(context, node),
        "Use a supported dataflow node or provide a lowering plugin.",
      ),
    );
  }
  visiting.delete(nodeId);

  if (expression !== undefined) context.expressions.set(nodeId, expression);
  return expression;
}

/** Lower a validated dataflow graph into the same versioned IR used by structured flows. */
export function lowerDataflowGraph(graph: GraphDocument): ValidationResult<IrModule> {
  const validation = validateGraph(graph);
  if (hasErrors(validation)) return { ok: false, diagnostics: validation };

  const analysis = analyzeDataflow(graph, []);
  if (analysis === undefined) {
    return { ok: false, diagnostics: validation };
  }

  const context: LoweringContext = {
    graphId: graph.id,
    analysis,
    diagnostics: [...validation],
    statements: [],
    expressions: new Map(),
    counter: 0,
  };

  for (const sink of analysis.sinks) {
    if (sink.definitionId !== CORE_DATA_LOG.definitionId) {
      context.diagnostics.push(
        error(
          "IR_NODE_UNSUPPORTED",
          `Dataflow sink "${sink.id}" (${sink.definitionId}) has no lowering handler.`,
          origin(context, sink),
        ),
      );
      continue;
    }
    const valueId = inputNodeId(context, sink, "value");
    const value = valueId === undefined ? undefined : evaluate(valueId, context, new Set());
    if (value !== undefined) {
      context.statements.push({
        kind: "call",
        target: "core.console.log",
        arguments: [value],
        origin: origin(context, sink),
      });
    }
  }

  if (hasErrors(context.diagnostics)) return { ok: false, diagnostics: context.diagnostics };

  const fallback = analysis.sinks[0];
  context.statements.push({
    kind: "return",
    origin:
      context.statements.length > 0
        ? context.statements[context.statements.length - 1]!.origin
        : { graphId: graph.id, nodeId: fallback?.id ?? graph.id },
  });

  return {
    ok: true,
    value: {
      irVersion: IR_VERSION,
      id: graph.id,
      functions: [
        {
          id: "main",
          parameters: [],
          returnType: unitType(),
          body: context.statements,
          origin: { graphId: graph.id, nodeId: fallback?.id ?? graph.id },
        },
      ],
    },
    diagnostics: context.diagnostics,
  };
}
