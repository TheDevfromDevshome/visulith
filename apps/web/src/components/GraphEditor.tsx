import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import type { Diagnostic, GraphDocument } from "@visulith/engine";
import {
  addConnection,
  addNodeToGraph,
  graphToFlowEdges,
  graphToFlowNodes,
  indexDiagnostics,
  removeEntities,
  updateNodePosition,
  type FlowEdge,
  type FlowNode,
} from "../lib/graph";
import { PALETTE_DEFINITIONS, arePortsCompatible, getNodeDefinition, getPortDefinition } from "../lib/node-definitions";

interface GraphEditorProps {
  graph: GraphDocument;
  diagnostics: readonly Diagnostic[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onChange: (graph: GraphDocument) => void;
}

function GraphNodeCard({ data, selected }: NodeProps<FlowNode>): JSX.Element {
  const definition = getNodeDefinition(data.definitionId);
  const inputs = definition?.inputs ?? [];
  const outputs = definition?.outputs ?? [];
  const message = data.properties["message"];

  return (
    <div
      className={`graph-node${selected ? " graph-node--selected" : ""}${data.errorCount > 0 ? " graph-node--error" : ""}`}
    >
      <div className="graph-node__header">
        <span className="graph-node__icon" aria-hidden="true">
          {definition?.category === "io" ? "▤" : "▶"}
        </span>
        <strong>{definition?.displayName ?? data.definitionId}</strong>
        {data.errorCount > 0 && <span className="count-badge count-badge--error">{data.errorCount}</span>}
        {data.errorCount === 0 && data.warningCount > 0 && (
          <span className="count-badge count-badge--warning">{data.warningCount}</span>
        )}
      </div>
      <div className="graph-node__definition">{data.definitionId}@{data.definitionVersion}</div>
      <div className="graph-node__ports">
        <div className="graph-node__port-column">
          {inputs.length === 0 && <span className="muted">no inputs</span>}
          {inputs.map((port) => (
            <div className="port-label" key={port.id} title={port.description ?? port.id}>
              <span>{port.id}</span>
              <small>{port.kind}:{port.type.name}</small>
            </div>
          ))}
        </div>
        <div className="graph-node__port-column graph-node__port-column--right">
          {outputs.map((port) => (
            <div className="port-label" key={port.id} title={port.description ?? port.id}>
              <span>{port.id}</span>
              <small>{port.kind}:{port.type.name}</small>
            </div>
          ))}
        </div>
      </div>
      {typeof message === "string" && message.length > 0 && <div className="graph-node__preview">{message}</div>}
      {inputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          className={`port-handle port-handle--${port.kind}`}
          style={{ top: `${56 + index * 30}px` }}
          title={`${port.id} (${port.kind} ${port.type.name})`}
        />
      ))}
      {outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          className={`port-handle port-handle--${port.kind}`}
          style={{ top: `${56 + index * 30}px` }}
          title={`${port.id} (${port.kind} ${port.type.name})`}
        />
      ))}
    </div>
  );
}

const NODE_TYPES = { visulith: GraphNodeCard };
const DRAG_MIME = "application/visulith-node";

function GraphCanvas({ graph, diagnostics, selectedNodeId, onSelectNode, onChange }: GraphEditorProps): JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    const flowNodes = graphToFlowNodes(graph, indexDiagnostics(diagnostics)).map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
    }));
    setNodes(flowNodes);
    setEdges(graphToFlowEdges(graph));
  }, [graph, diagnostics, selectedNodeId, setNodes, setEdges]);

  const isValidConnection = useCallback(
    (connection: Connection | FlowEdge): boolean => {
      if (connection.source === null || connection.target === null || connection.source === connection.target) return false;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (sourceNode === undefined || targetNode === undefined) return false;
      const sourcePort = getPortDefinition(sourceNode.data.definitionId, "output", connection.sourceHandle);
      const targetPort = getPortDefinition(targetNode.data.definitionId, "input", connection.targetHandle);
      return sourcePort !== undefined && targetPort !== undefined && arePortsCompatible(sourcePort, targetPort);
    },
    [nodes],
  );

  const handleConnect = useCallback(
    (connection: Connection): void => {
      if (!isValidConnection(connection)) return;
      const sourceNode = nodes.find((node) => node.id === connection.source);
      if (sourceNode === undefined) return;
      const port = getPortDefinition(sourceNode.data.definitionId, "output", connection.sourceHandle);
      if (port === undefined) return;
      onChange(addConnection(graph, connection, port.kind));
    },
    [graph, nodes, isValidConnection, onChange],
  );

  const handleNodeDragStop = useCallback(
    (_event: globalThis.MouseEvent | TouchEvent, node: FlowNode): void => {
      onChange(updateNodePosition(graph, node.id, node.position));
    },
    [graph, onChange],
  );

  const deleteSelection = useCallback((): void => {
    if (selectedNodeId !== null) {
      onChange(removeEntities(graph, [selectedNodeId], []));
      onSelectNode(null);
      return;
    }
    if (selectedEdgeId !== null) {
      onChange(removeEntities(graph, [], [selectedEdgeId]));
      setSelectedEdgeId(null);
    }
  }, [graph, selectedNodeId, selectedEdgeId, onChange, onSelectNode]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      deleteSelection();
    },
    [deleteSelection],
  );

  const addFromPalette = useCallback(
    (definitionId: string): void => {
      const bounds = containerRef.current?.getBoundingClientRect();
      const position =
        bounds === undefined
          ? { x: 160, y: 160 }
          : screenToFlowPosition({ x: bounds.left + bounds.width * 0.55, y: bounds.top + bounds.height * 0.4 });
      onChange(addNodeToGraph(graph, definitionId, position));
    },
    [graph, onChange, screenToFlowPosition],
  );

  const handleDragStart = useCallback((event: DragEvent<HTMLButtonElement>, definitionId: string): void => {
    event.dataTransfer.setData(DRAG_MIME, definitionId);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      const definitionId = event.dataTransfer.getData(DRAG_MIME);
      if (definitionId.length === 0 || getNodeDefinition(definitionId) === undefined) return;
      onChange(addNodeToGraph(graph, definitionId, screenToFlowPosition({ x: event.clientX, y: event.clientY })));
    },
    [graph, onChange, screenToFlowPosition],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const nodeCountLabel = useMemo(() => `${graph.nodes.length} nodes · ${graph.connections.length} connections`, [graph]);

  return (
    <div
      className="graph-editor"
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Graph editor"
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <aside className="node-palette" aria-label="Node palette">
        <h2>Node palette</h2>
        {PALETTE_DEFINITIONS.map((definition) => (
          <button
            className="palette-item"
            type="button"
            key={definition.definitionId}
            draggable
            onDragStart={(event) => handleDragStart(event, definition.definitionId)}
            onClick={() => addFromPalette(definition.definitionId)}
            title={`Drag onto the canvas or click to add ${definition.displayName}`}
          >
            <span className="palette-item__name">{definition.displayName}</span>
            <span className="palette-item__id">{definition.definitionId}</span>
            <Plus size={14} aria-hidden="true" />
          </button>
        ))}
        <p className="palette-hint">Drag a node onto the canvas or click to add. Select a node or edge and press Delete to remove it.</p>
      </aside>
      <div className="graph-editor__canvas">
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          isValidConnection={isValidConnection}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={(_event, node) => {
            onSelectNode(node.id);
            setSelectedEdgeId(null);
          }}
          onEdgeClick={(_event, edge) => {
            setSelectedEdgeId(edge.id);
            onSelectNode(null);
          }}
          onPaneClick={() => {
            onSelectNode(null);
            setSelectedEdgeId(null);
          }}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={22} size={1} color="#2b3142" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <div className="graph-editor__status">{nodeCountLabel}</div>
    </div>
  );
}

export function GraphEditor(props: GraphEditorProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
