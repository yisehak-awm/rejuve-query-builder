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
  /**
   * Show the query, offer no way to change it.
   *
   * This used to hide the canvas chrome and nothing else, so a "read-only"
   * graph still let you open a node's parameters, delete it from a context
   * menu, add connections from its handles, drag it, and change or delete an
   * edge. It now reaches the nodes and the edges as well.
   */
  readonly?: boolean;
  /**
   * How far out the canvas may zoom. React Flow's own default is 0.5, and
   * `fitView` clamps to it — a graph more than twice as wide as its container
   * is cropped rather than fitted, silently. Callers drawing a query small
   * need to be able to say otherwise.
   */
  minZoom?: number;
  maxZoom?: number;
  /**
   * Whether the wheel zooms the canvas. React Flow also calls `preventDefault`
   * while it does, so a builder embedded in a scrolling page swallows the
   * page's scroll — leave both off there.
   */
  zoomOnScroll?: boolean;
  preventScrolling?: boolean;
  /**
   * Re-frame the graph whenever the container changes size.
   *
   * Off by default, and that is the important half: on a canvas someone is
   * building a query on, a resize must not move the view. Dragging a divider
   * would otherwise throw away wherever they had panned to, which is the same
   * trade a theme toggle is not allowed to make.
   *
   * On a graph nobody can touch — a preview in a card, a cell in a table —
   * there is no view to lose and the only thing a resize can do is crop it.
   * Those callers want this on.
   */
  fitOnResize?: boolean;
}

export interface Diff {
  kind: string;
  lhs: string;
  rhs: string;
  path: any[];
}

/**
 * Layer spacing is derived from what the edges have to hold, not fixed.
 *
 * The previous options pinned `nodeNodeBetweenLayers` at 300 and `nodeNode` at
 * 200 — numbers picked for a full-screen canvas, and far too generous
 * anywhere smaller. A plain three-node chain came out about 1080px wide, which
 * React Flow cannot fit into anything narrower than ~1350px: `fitView` clamps
 * at `minZoom`, so past that the graph is cropped rather than zoomed out, with
 * no scrollbar and nothing on screen to say a node is missing.
 *
 * With `baseValue` and edge labels supplied (see `edgeLabels` below), elk
 * makes each layer gap exactly as wide as the label it has to carry, plus the
 * base on either side. The same chain comes out at 789px, and a branching
 * query drops from 1161x412 to 789x232.
 *
 * `nodeNode` is deliberately larger than `baseValue` alone would give: a
 * node's parameter list overhangs the node box upwards, so rows need more
 * clearance than the reported heights suggest.
 */
const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Air either side of an edge's label, and deliberately very little of it.
  // Horizontal clearance is what `STAGGER` now buys instead, and it buys it
  // for free — see there. Every pixel here widens the whole graph, which a
  // small container pays for directly in zoom.
  "elk.layered.spacing.baseValue": 12,
  "elk.spacing.nodeNode": 48,
  "elk.spacing.edgeLabel": 6,
  // Pulls the layers in towards each other once they are placed. Worth ~10%
  // on a branching graph and nothing at all on a chain, which is the right
  // way round — a chain has nothing to compact.
  "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
  "elk.padding": "[top=8,left=8,bottom=8,right=8]",
};

/**
 * What an edge's label costs elk in horizontal room.
 *
 * Without this elk lays out as though edges were bare lines, so a gap sized
 * for nothing at all has to carry `associated_with` — which is how the labels
 * ended up overlapping the nodes they sit between.
 *
 * Estimated rather than measured: the label is a DOM overlay drawn through
 * `EdgeLabelRenderer`, so it does not exist yet when the layout runs. `text-xs`
 * in the default sans stack averages a little over 6px a character, and the
 * chrome is the dropdown chevron plus the trigger's own padding.
 */
const LABEL_CHAR_WIDTH = 6.2;
const LABEL_CHROME = 24;
const LABEL_HEIGHT = 18;

function edgeLabels(edge: ReactFlowEdge) {
  const text = (edge.data as { edgeType?: string } | undefined)?.edgeType;
  if (!text) return undefined;

  return [
    {
      text,
      width: text.length * LABEL_CHAR_WIDTH + LABEL_CHROME,
      height: LABEL_HEIGHT,
    },
  ];
}

/**
 * How far every other column drops.
 *
 * A chain laid out to the right puts every node on one line, so each edge is
 * horizontal and its label sits at the same height as the nodes either side of
 * it — right where a node's parameter list already hangs.
 *
 * Dropping alternate columns tilts every edge, and a tilted edge carries its
 * label off that line into the empty space between the rows. Which means the
 * clearance a label needs stops being horizontal: the gap between columns can
 * shrink to barely more than the label is wide, because the label is no longer
 * competing with the nodes for that space. That is why `baseValue` above is as
 * small as it is, and the two numbers only make sense together.
 *
 * Measured over six query shapes — chains of three and five, a fan, a diamond,
 * a skip edge, and one with every node filtered — 140 with a base of 12 draws
 * 10-26% larger than 80 with a base of 48 on five of the six, and turns three
 * label/parameter-list collisions into one. It loses 13% on the diamond, which
 * is the one shape already bound by height rather than width.
 */
const STAGGER = 140;

/**
 * Drop every other column.
 *
 * Columns rather than nodes, so a branching query keeps its siblings level —
 * everything elk put at the same x moves together, or this would read as a
 * layout rather than as a nudge.
 *
 * Applied after the layout rather than asked of elk, because elk has no reason
 * to offer it: a straight line is the optimal placement for a chain, and it is
 * right about that in every respect except where the labels end up.
 *
 * Unlike wrapping the graph into rows, every edge still runs left to right, so
 * the query reads in its own direction.
 */
function staggered(children: any[]) {
  const columns = Array.from(
    new Set(children.map((c) => Math.round(c.position.x)))
  ).sort((a, b) => a - b);

  return children.map((c) => {
    const column = columns.indexOf(Math.round(c.position.x));
    if (column % 2 === 0) return c;
    return { ...c, position: { ...c.position, y: c.position.y + STAGGER } };
  });
}

const fitViewOptions = { padding: "20%" } as const;

const markerEnd = {
  type: MarkerType.ArrowClosed,
  color: "var(--marker-fill)",
};

/**
 * The marching-ants dash says "this is live" — worth it on a canvas someone
 * is building a query on, and noise on a graph they cannot touch. A static
 * picture that moves asks to be looked at and then offers nothing.
 */
const edgeOptions = { animated: true, markerEnd };
const staticEdgeOptions = { animated: false, markerEnd };

function QueryBuilderContent(props: QueryBuilderProps) {
  const [nodes, setNodes] = useState<ReactFlowNode[]>([]);
  const [edges, setEdges] = useState<ReactFlowEdge[]>([]);
  const [nodesChanged, setNodesChanged] = useState(false);
  const [edgesChanged, setEdgesChanged] = useState(false);
  // Whether a template/existing graph was passed in at mount. Unsaved-changes
  // is only meaningful relative to such a baseline, not a brand-new query.
  const hadTemplate = useRef(!!props.nodes?.length || !!props.edges?.length);
  const [shouldFitView, setFitView] = useState(false);
  /**
   * Whether the first layout has come back.
   *
   * The graph starts empty and elk fills it asynchronously, so on mount there
   * is always at least one frame where `nodes` is `[]` — and the instructions
   * panel read that as "this query is empty" and drew itself over a graph
   * that was about to arrive. Harmless-looking on a full-page canvas, and a
   * visible flash anywhere several builders mount at once.
   */
  const [laidOut, setLaidOut] = useState(false);
  /** The box the graph is drawn in, watched when `fitOnResize` is set. */
  const frame = useRef<HTMLDivElement>(null);
  const { getNode, fitView, toObject, screenToFlowPosition, deleteElements } =
    useReactFlow();
  const elk = useMemo(() => new ELK(), []);
  const { edgeDefinitions } = useContext(QueryBuilderContext);

  const edgeTypes = useMemo(
    () => ({
      custom: (edgeProps: CustomEdgeProps) => (
        <Edge {...edgeProps} onReverse={onReverse} readonly={props.readonly} />
      ),
    }),
    [props.readonly]
  );

  const nodeTypes = useMemo(
    (): { [type: string]: FunctionComponent<any> } => ({
      custom: (nodeProps: CustomNodeProps) => (
        <Node
          {...nodeProps}
          onAddNode={addConnectedNode}
          onDelete={deleteNode}
          readonly={props.readonly}
        />
      ),
    }),
    [props.readonly]
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

    const isTypeInOptions = options.some((o) => o.label == edgeType);

    const id = nanoid();
    const edge: ReactFlowEdge = {
      id,
      type: "custom",
      source: sourceNode?.id,
      target: targetNode?.id,
      data: {
        edgeType: isTypeInOptions ? edgeType : options[0]?.label,
        options,
      },
    };
    setEdges((eds) => [...eds, edge]);
    return edge;
  }

  const onReverse = useCallback(
    (id: string, source: string, target: string, type: string) => {
      deleteElements({ edges: [{ id }] });
      try {
        connectNodes(target, source, type);
      } catch (e) {
        connectNodes(source, target, type);
        toast.error("Invalid connection.", {
          description:
            "It's not possible to connect those nodes in the reverse direction.",
          action: {
            label: "Okay",
            onClick: () => {},
          },
        });
      }
    },
    []
  );

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
  }

  function applyLayout(nds: ReactFlowNode[], eds: ReactFlowEdge[]) {
    const graph = {
      id: "Y",
      layoutOptions,
      edges: eds.map((e) => ({ ...e, labels: edgeLabels(e) })),
      children: nds.map((n) => ({
        ...n,
      })),
    };
    elk
      .layout(graph as any)
      .then(({ children }: any) => {
        children.forEach((n: any) => {
          n.position = { x: n.x, y: n.y };
        });
        setNodes(staggered(children));
        setEdges(eds);
        setFitView(true);
      })
      .catch(() => {
        // elk can reject outright on an option combination it cannot satisfy
        // — its own `SINGLE_EDGE` wrapping does it on most chains. A rejected
        // promise left the builder blank forever, with nothing logged and no
        // way back, so an unplaced graph is better than no graph.
        setNodes(nds);
        setEdges(eds);
        setFitView(true);
      })
      .finally(() => setLaidOut(true));
  }

  useEffect(() => {
    if (!nodes.length) return;
    if (edges.length >= nodes.length - 1) {
      applyLayout(nodes, edges);
    }
  }, [edges.length]);

  /**
   * Frame the graph once, after a layout.
   *
   * Two things here, and the order of them is the whole point.
   *
   * The flag is lowered inside the callback, not beside the request. Lowering
   * it synchronously changes this effect's own dependency, so React runs the
   * cleanup before re-running the effect — and the cleanup cancels the frame
   * that was just booked. The fit then never happens at all.
   *
   * And two frames rather than one. `measured` is written during commit by
   * each node, but React Flow recomputes its own internals from a
   * ResizeObserver, and the rendering steps deliver resize observations
   * *after* animation-frame callbacks. One frame can still land before the
   * dimensions it needs exist, which is what left a fresh canvas framed on
   * nothing until someone pressed the fit-view button.
   *
   * The padding matches the initial `fitView` prop, which it did not before —
   * so pressing the button used to reframe what was already framed.
   */
  useEffect(() => {
    if (!shouldFitView) return;

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        fitView(fitViewOptions);
        setFitView(false);
      });
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [shouldFitView]);

  useEffect(resetGraph, []);

  /**
   * Keep a read-only graph framed as its container changes size.
   *
   * React Flow tracks its own width and height, but it never re-fits: the
   * viewport transform set at layout time is kept, so a container that
   * narrows simply crops. Nothing here notices a divider moving.
   *
   * Collapsed to one frame, because a drag delivers an observation per frame
   * and each `fitView` writes the viewport. Observing also fires once
   * immediately, which costs a redundant fit on mount and saves needing a
   * separate one if the container was still settling.
   */
  useEffect(() => {
    const element = frame.current;
    if (!props.fitOnResize || !element) return;

    let queued = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => fitView(fitViewOptions));
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(queued);
    };
  }, [props.fitOnResize, fitView]);

  const unsavedChanges =
    hadTemplate.current && (nodesChanged || edgesChanged);

  return (
    <div ref={frame} className="query-builder w-full h-full">
      {laidOut && nodes.length == 0 && <Instructions />}
      <ReactFlow
        fitView
        fitViewOptions={fitViewOptions}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onDragAndConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={props.theme}
        defaultEdgeOptions={
          props.readonly ? staticEdgeOptions : edgeOptions
        }
        proOptions={{ hideAttribution: true }}
        // Moving a node and drawing an edge are both edits, so read-only
        // means they are off too — hiding the controls that start them is
        // not the same as refusing them.
        nodesDraggable={!props.readonly}
        nodesConnectable={!props.readonly}
        elementsSelectable={!props.readonly}
        // Undefined leaves React Flow on its own defaults, which is what
        // every existing caller gets.
        minZoom={props.minZoom}
        maxZoom={props.maxZoom}
        zoomOnScroll={props.zoomOnScroll}
        preventScrolling={props.preventScrolling}
      >
        {!props.readonly && <Controls />}
        <Background patternClassName="qb-bg" />
      </ReactFlow>
      {!!nodes.length && !props.readonly && (
        <div className="absolute bottom-10 right-24 z-20 flex items-center">
          {unsavedChanges && <ResetButton onClick={resetGraph} />}
          <RunButton
            busy={props.busy}
            previouslyRun={props.previouslyRun}
            hasUnsavedChanges={unsavedChanges}
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
