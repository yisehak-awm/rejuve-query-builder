import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ArrowLeftRight, ChevronDown, Trash } from "lucide-react";
import { EdgeDefinition } from "./builder";
import { Button } from "../components/ui/button";

export interface CustomEdgeProps extends EdgeProps {
  source: string;
  target: string;
  data: {
    edgeType: string;
    options: EdgeDefinition[];
  };
  onReverse: Function;
}

export default function (props: CustomEdgeProps) {
  const { updateEdgeData, deleteElements } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  });

  function updateEdgeType(type: string) {
    updateEdgeData(props.id, { edgeType: type });
  }

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={{ ...props.style, strokeWidth: 2 }}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-auto absolute text-xs"
          style={{
            transform: `translate(-75%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          <EdgeTypeSelector
            options={props.data?.options}
            currentEdgeType={props.data.edgeType}
            onSelect={updateEdgeType}
            onDelete={() => deleteElements({ edges: [{ id: props.id }] })}
            onReverse={() =>
              props.onReverse(
                props.id,
                props.source,
                props.target,
                props.data.edgeType
              )
            }
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function EdgeTypeSelector(props: {
  currentEdgeType: string;
  options: EdgeDefinition[];
  onSelect: (value: string) => void;
  onDelete: () => void;
  onReverse: Function;
}) {
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <p className="bg-background">
            {props.currentEdgeType} <ChevronDown className="inline w-4" />
          </p>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{props.currentEdgeType}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={props.currentEdgeType}
            onValueChange={props.onSelect}
          >
            {props.options.map((e) => (
              <DropdownMenuRadioItem key={e.label} value={e.label}>
                {e.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <div className="flex gap-2 justify-end">
            <Button
              size="icon"
              variant="ghost"
              onClick={props.onReverse as any}
            >
              <ArrowLeftRight className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={props.onDelete}>
              <Trash className="size-4 text-destructive" />
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
