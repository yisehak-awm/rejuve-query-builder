import {
  Background,
  Connection,
  Controls,
  Edge as ReactFlowEdge,
  Node as ReactFlowNode,
  ReactFlow,
  MarkerType,
  ColorMode,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  useReactFlow,
  ReactFlowJsonObject,
  ReactFlowProvider,
} from "@xyflow/react";
import React, {
  FunctionComponent,
  MouseEventHandler,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import Node, { AvailableConnection, CustomNodeProps, Icon } from "./node";
import { AlertCircle, Play, Plus } from "lucide-react";
import { Toaster } from "../components/ui/sonner";
import { Button } from "../components/ui/button";
import Edge, { CustomEdgeProps } from "./edge";
import deepDiff from "deep-diff";
import add from "./add.svg";

import ELK from "elkjs";
import { QueryBuilderContext } from "./context";
import groupBy from "object.groupby";
import { customAlphabet } from "nanoid";
import { toast } from "sonner";

const nanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  10
);

export interface NodeDefinition {
  id: string;
  name: string;
  category: string;
}

export interface EdgeDefinition {
  id: string;
  source: string;
  target: string;
  label: string;
}
export interface QueryBuilderProps {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  onSubmit: (json: ReactFlowJsonObject) => any;
  previouslyRun?: boolean;
  theme?: ColorMode;
  busy?: boolean;
  readonly?: boolean;
}

export interface Diff {
  kind: string;
  lhs: string;
  rhs: string;
  path: any[];
}

const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": 300,
  "elk.spacing.nodeNode": 200,
};

const defaultEdgeOptions = {
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "var(--marker-fill)",
  },
};

function QueryBuilderContent(props: QueryBuilderProps) {
  const [nodes, setNodes] = useState<ReactFlowNode[]>([]);
  const [edges, setEdges] = useState<ReactFlowEdge[]>([]);
  const [nodesChanged, setNodesChanged] = useState(false);
  const [edgesChanged, setEdgesChanged] = useState(false);
  const [shouldFitView, setFitView] = useState(false);
  const { getNode, fitView, toObject, screenToFlowPosition } = useReactFlow();
  const elk = useMemo(() => new ELK(), []);
  const { edgeDefinitions } = useContext(QueryBuilderContext);

  const edgeTypes = useMemo(
    () => ({
      custom: (props: CustomEdgeProps) => <Edge {...props} />,
    }),
    []
  );

  const nodeTypes = useMemo(
    (): { [type: string]: FunctionComponent<any> } => ({
      custom: (props: CustomNodeProps) => (
        <Node {...props} onAddNode={addConnectedNode} onDelete={deleteNode} />
      ),
    }),
    []
  );

  const onDragAndConnect = useCallback(
    (params: Connection) => {
      let nodesAreConnected;
      try {
        nodesAreConnected = connectNodes(params.source, params.target);
      } catch (e) {
        nodesAreConnected = false;
      }

      if (nodesAreConnected) return;

      try {
        connectNodes(params.target, params.source);
      } catch (e) {
        toast.error("Invalid connection.", {
          description: "There are no valid connections between those nodes.",
          action: {
            label: "Okay",
            onClick: () => {},
          },
        });
      }
    },
    [connectNodes]
  );

  function addNode(type: string): ReactFlowNode {
    const node: ReactFlowNode = {
      id: nanoid(),
      type: "custom",
      data: { qb_node_type: type, animate: true },
      position: screenToFlowPosition({
        x: document.body.clientWidth / 2,
        y: 0,
      }),
      measured: { width: 100, height: 100 },
    };
    setNodes((nds) => [...nds, node]);
    setFitView(true);
    return node;
  }

  function getAllEdgesForNodesTypes(
    sourceNodeType: string,
    targetNodeType: string
  ) {
    const edgeOptions = edgeDefinitions.filter(
      (e) => e.source === sourceNodeType && e.target === targetNodeType
    );
    return edgeOptions;
  }

  function connectNodes(
    source: ReactFlowNode | string,
    target: ReactFlowNode | string,
    edgeType?: string
  ): ReactFlowEdge {
    const sourceNode = typeof source == "string" ? getNode(source) : source;
    const targetNode = typeof target == "string" ? getNode(target) : target;

    if (!sourceNode || !targetNode) throw "Not possible to connect nodes";

    const options = getAllEdgesForNodesTypes(
      sourceNode?.data.qb_node_type as string,
      targetNode?.data.qb_node_type as string
    );

    if (!options.length) throw "Not possible to connect nodes";

    const id = nanoid();
    const edge: ReactFlowEdge = {
      id,
      type: "custom",
      source: sourceNode?.id,
      target: targetNode?.id,
      data: {
        edgeType: edgeType || options[0]?.label,
        options,
      },
    };
    setEdges((eds) => [...eds, edge]);
    return edge;
  }

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => {
        const newNodes = applyNodeChanges(changes, nds);
        const unsaved = hasUnsavedChanges(
          changes,
          newNodes,
          props.nodes,
          nodesChanged
        );
        setNodesChanged(unsaved);
        return newNodes;
      }),

    [setNodes, nodesChanged, nodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => {
        const newEdges = applyEdgeChanges(changes, eds);
        const unsaved = hasUnsavedChanges(
          changes,
          newEdges,
          props.edges,
          edgesChanged
        );
        setEdgesChanged(unsaved);
        return newEdges;
      }),
    [setEdges, edgesChanged]
  );

  function hasUnsavedChanges(
    changes: { type: string }[],
    oldArr: { data?: any }[],
    newArr: { data?: any }[],
    previousValue: boolean
  ): boolean {
    if (!oldArr || !newArr) return false;
    if (oldArr?.length != newArr?.length) return true;
    const relevantChanges = ["dimensions", "replace", "remove", "add"];
    const shouldCheckForChanges = changes.some((c) =>
      relevantChanges.includes(c.type)
    );
    if (!shouldCheckForChanges) return previousValue;
    const diff = deepDiff.diff(
      newArr.map((n) => n.data),
      oldArr.map((n) => n.data)
    );
    if (!diff) return false;
    // we disable animation when loading a previously run query or a template. that should
    // not be considered as unsaved change
    if (diff.every((d) => d.kind == "E" && d.path?.includes("animate")))
      return false;
    return !diff.every((d) => d.kind == "N" && d.rhs == "");
  }

  function addConnectedNode(nodeId: string, c: AvailableConnection) {
    const newNode = addNode(c.type);
    const [source, target] = c.isSource ? [newNode, nodeId] : [nodeId, newNode];
    connectNodes(source, target, c.label);
  }

  function deleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }

  function resetGraph() {
    applyLayout(props.nodes, props.edges);
  }

  function applyLayout(nds: ReactFlowNode[], eds: ReactFlowEdge[]) {
    const graph = {
      id: "Y",
      layoutOptions,
      edges: eds,
      children: nds.map((n) => ({
        ...n,
      })),
    };
    elk.layout(graph as any).then(({ children }: any) => {
      children.forEach((n: any) => {
        n.position = { x: n.x, y: n.y };
      });
      setNodes(children);
      setEdges(eds);
      setFitView(true);
    });
  }

  useEffect(() => {
    if (!nodes.length) return;
    if (edges.length >= nodes.length - 1) {
      applyLayout(nodes, edges);
    }
  }, [edges]);

  useEffect(() => {
    if (shouldFitView) {
      fitView();
      setFitView(false);
    }
  }, [shouldFitView]);

  useEffect(() => {
    const initialNodes =
      props.nodes?.map((n) => ({
        ...n,
        width: n.measured?.width || 100,
        height: n.measured?.height || 100,
        data: { ...n.data, animate: false },
      })) || [];
    const initialEdges =
      props.edges?.map((e) => {
        const edge = e;
        const source = initialNodes.find((n) => n.id == e.source);
        const target = initialNodes.find((n) => n.id == e.target);
        const options = getAllEdgesForNodesTypes(
          (source?.data as any).qb_node_type as string,
          (target?.data as any).qb_node_type as string
        );
        edge.data = { ...edge.data, options };
        return edge;
      }) || [];
    applyLayout(initialNodes, initialEdges);
  }, []);

  return (
    <div className="query-builder w-full h-full">
      {nodes.length == 0 && <Instructions />}
      <ReactFlow
        fitView
        fitViewOptions={{ padding: `20%` }}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onDragAndConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={props.theme}
        defaultEdgeOptions={defaultEdgeOptions}
        proOptions={{ hideAttribution: true }}
      >
        {!props.readonly && <Controls />}
        <Background patternClassName="qb-bg" />
      </ReactFlow>
      {!!nodes.length && !props.readonly && (
        <div className="absolute bottom-10 right-24 z-20 flex items-center">
          {(nodesChanged || edgesChanged) && (
            <ResetButton onClick={resetGraph} />
          )}
          <RunButton
            busy={props.busy}
            previouslyRun={props.previouslyRun}
            hasUnsavedChanges={nodesChanged || edgesChanged}
            onClick={() => props.onSubmit(toObject())}
          />
        </div>
      )}
      {!props.readonly && (
        <div className="absolute bottom-10 left-24 z-20">
          <NodeSelector onSelect={addNode} hasInsertedNodes={!!nodes.length} />
        </div>
      )}
    </div>
  );
}

export function QueryBuilder(props: QueryBuilderProps) {
  return (
    <ReactFlowProvider>
      <QueryBuilderContent {...props} />
    </ReactFlowProvider>
  );
}

function Instructions() {
  return (
    <div className="absolute z-10 flex h-full w-full items-center justify-center">
      <div className="flex w-1/3 flex-col items-center text-center">
        <img src={add as any} className="h-72 w-72 dark:invert-[0.95]" />
        <h2 className="mb-4 text-xl font-bold text-foreground/70">
          Start by adding a node
        </h2>
        <p className="mb-8 text-center text-foreground/50">
          Click on the "Add node" button below to select from all node types
          available in the bio-atomspace. Click / drag the handles on the sides
          of nodes to add connections.
        </p>
      </div>
    </div>
  );
}

function RunButton(props: {
  busy?: boolean;
  previouslyRun?: boolean;
  hasUnsavedChanges: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  let label = "Run query";
  if (props.previouslyRun) label = "Re-run query";
  if (props.previouslyRun && props.hasUnsavedChanges)
    label = "Save and re-run query";

  return (
    <Button busy={props.busy} className="ms-4" onClick={props.onClick}>
      {props.busy || <Play className="mr-2" />} {label}
    </Button>
  );
}

function ResetButton(props: { onClick: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <div>
      <p className="me-4 inline text-orange-500">
        <AlertCircle size={16} className="me-2 inline" /> You have unsaved
        changes.
      </p>
      <Button variant="outline" onClick={props.onClick}>
        Reset
      </Button>
    </div>
  );
}

function NodeSelector(props: {
  hasInsertedNodes: boolean;
  onSelect: (type: string) => void;
}) {
  const { nodeDefinitions } = useContext(QueryBuilderContext);
  const cssClass = "mb-1 flex items-center hover:cursor-pointer";
  const groups = groupBy(nodeDefinitions, (a) => a.category);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={props.hasInsertedNodes ? "outline" : "default"}>
          <Plus className="me-2 inline" /> Add node
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="p-0 shadow-2xl">
        <h4 className="p-4 font-bold shadow">Select a node type </h4>
        <div className="max-h-[70vh] overflow-y-auto">
          <Accordion type="single" defaultValue={Object.keys(groups)[0]}>
            {Object.keys(groups).map((p) => (
              <AccordionItem key={p} value={p} className="px-4">
                <AccordionTrigger>
                  {p == "undefined" ? "Uncategorized" : p}
                </AccordionTrigger>
                <AccordionContent className="px-2">
                  <ul>
                    {groups[p]?.map((n) => (
                      <li
                        key={n.id}
                        className={cssClass}
                        onClick={() => props.onSelect(n.id)}
                      >
                        <Icon type={n.id} size="small" />
                        <p className="ms-2">{n.name}</p>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </PopoverContent>
    </Popover>
  );
}
