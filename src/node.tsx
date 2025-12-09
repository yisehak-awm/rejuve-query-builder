import {
  Handle,
  HandleProps,
  NodeProps,
  Position,
  useReactFlow,
} from "@xyflow/react";
import React, {
  FormEvent,
  FormEventHandler,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { Combobox, ComboboxOption } from "../components/ui/combobox";
import { ArrowLeft, ArrowRight, Trash } from "lucide-react";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { QueryBuilderContext } from "./context";
import { createAvatar } from "@dicebear/core";
import { identicon } from "@dicebear/collection";
import deepDiff from "deep-diff";
import { NodeDefinition } from "./builder";

interface IconProperties {
  fillColor?: string;
  strokeColor?: string;
  size?: number;
  children?: ReactNode;
}

export interface NodeIconsMap {
  [key: string]: ((props: IconProperties) => React.JSX.Element) | undefined;
}

export interface FormFieldProps {
  name: string;
  label: string;
  inputType: "input" | "combobox";
  options?: ComboboxOption[];
  [key: string]: any;
}

export interface NodeFormFieldsMap {
  [nodeType: string]: FormFieldProps[];
}

interface NodeClassDefinition {
  icon?: string;
  form?: string;
  params?: string;
}

export interface NodeClassDefinitionMap {
  [nodeType: string]: NodeClassDefinition;
}

export interface AvailableConnection {
  id: string;
  type: string;
  label: string;
  isSource: boolean;
}

export interface CustomNodeProps extends NodeProps {
  data: {
    qb_node_type: string;
    animate?: boolean;
  };
  onAddNode: Function;
  onDelete: (id: string) => void;
}

const inputMap: {
  [nodeType: string]: React.FunctionComponent | typeof Combobox;
} = {
  input: Input,
  combobox: Combobox,
};

function FormField(props: FormFieldProps) {
  const { inputType, ...otherProps } = props;
  const Input = inputMap[inputType];

  return (
    <Label className="mb-4 block">
      <div className="mb-2">{props.label}</div>
      <Input {...otherProps} options={props.options || []} />
    </Label>
  );
}

function Node(props: CustomNodeProps) {
  const { updateNode } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const params = useRef<HTMLDivElement>(null);
  const data = props.data as CustomNodeProps["data"];
  const type = data.qb_node_type;
  const { edgeDefinitions } = useContext(QueryBuilderContext);
  const connections = useMemo(() => getAvailableConnections(type), [type]);
  const wrapperClass = `pointer-events-none ${
    props.data.animate && "animate-bounce-once"
  }`;
  const { forms: formFields } = useContext(QueryBuilderContext);

  function getAvailableConnections(nodeType: string) {
    const filtered: AvailableConnection[] = [];
    edgeDefinitions.forEach((e) => {
      const { source, target } = e;
      if (source != nodeType && target != nodeType) return;
      filtered.push({
        id: e.id,
        label: e.label,
        type: source == nodeType ? target : source,
        isSource: nodeType == target,
      });
    });
    return filtered;
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const values = Object.fromEntries(formData as any);
    Object.keys(values).map((k) => {
      if (values[k] == "-") values[k] = "";
    });
    updateNode(props.id, { data: { ...data, ...values } });
  }

  useEffect(() => {
    const wrapperDiv = wrapper.current;
    const paramsDiv = params.current;
    if (!paramsDiv || !wrapperDiv) return;
    wrapperDiv.style.width = `${paramsDiv.clientWidth + 100}px`;
    updateNode(props.id, {
      measured: { width: paramsDiv.clientWidth + 100, height: 100 },
    });
  }, [props.data]);

  return (
    <div ref={wrapper} className={wrapperClass}>
      <div className="relative w-fit">
        <div ref={params} className="absolute bottom-3/4 left-3/4 z-10">
          <ParametersList parameters={props.data} />
        </div>
        <div className="pointer-events-auto relative w-fit">
          <ContextMenu>
            <ContextMenuTrigger className="p-0">
              <ParametersForm
                values={data}
                fields={formFields?.[type]}
                onSubmit={handleFormSubmit}
              >
                <Icon type={type} />
              </ParametersForm>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => props.onDelete(props.id)}>
                <Trash size={16} className="me-2 inline" />
                Delete node
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <Popover>
            <PopoverTrigger>
              <>
                <CustomHandle type="target" position={Position.Left} />
                <CustomHandle type="source" position={Position.Right} />
              </>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              className="max-h-screen w-full overflow-y-auto p-0"
            >
              <AvailableConnections
                connections={connections}
                onClick={(e) => props.onAddNode(props.id, e)}
              />
            </PopoverContent>
          </Popover>
        </div>
        <p className="relative text-center">{type}</p>
      </div>
    </div>
  );
}

export function Icon(props: { type: string; size?: "small" | "big" }) {
  const { icons: Icons, style: classes } = useContext(QueryBuilderContext);
  const iconClass =
    classes?.[props.type]?.icon || " bg-stone-500 dark:bg-stone-600";
  const NodeIcon = Icons?.[props.type];
  const svgSize = props.size == "small" ? 24 : 48;
  const sizeClass = props.size == "small" ? "h-10 w-10" : "h-24 w-24";
  const cssClass =
    sizeClass + " flex items-center justify-center rounded-full " + iconClass;

  if (NodeIcon) {
    return (
      <div className={cssClass}>
        <NodeIcon size={svgSize} />
      </div>
    );
  }

  const avatar = createAvatar(identicon, {
    seed: props.type,
    size: svgSize,
    rowColor: ["FFF"],
  });

  const svg = avatar.toString();

  return (
    <div className={cssClass} title={props.type}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

function CustomHandle(props: HandleProps) {
  return (
    <Handle
      {...props}
      onClick={props.onClick}
      style={{ width: 20, height: 20, borderWidth: 1 }}
    />
  );
}

function AvailableConnections(props: {
  onClick: (e: AvailableConnection) => void;
  connections: AvailableConnection[];
}) {
  const listClass =
    "flex items-center p-1 px-4 hover:bg-foreground/10 cursor-pointer whitespace-nowrap";

  return (
    <div className="w-full">
      <h4 className="p-4 font-bold">Available connections</h4>
      <ul>
        {props.connections.map((c) => (
          <li key={c.id} onClick={() => props.onClick(c)} className={listClass}>
            <Icon size="small" type={c.type} />
            <span className="ms-2">
              {c.type}
              {c.isSource ? (
                <ArrowRight className="mx-2 inline stroke-foreground/30" />
              ) : (
                <ArrowLeft className="mx-2 inline stroke-foreground/30" />
              )}
              {c.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ParametersForm(props: {
  children?: ReactNode;
  onSubmit: FormEventHandler;
  values: { [k: string]: any };
  fields: FormFieldProps[] | undefined;
}) {
  const { style: classes } = useContext(QueryBuilderContext);
  const formClass =
    classes?.[props.values.qb_node_type]?.form ||
    " bg-stone-500 dark:bg-stone-600";
  const [open, setOpen] = useState(false);
  const cssClass = "p-4 rounded-t text-white " + formClass;
  const form = useRef<HTMLFormElement>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) form.current?.requestSubmit();
        setOpen(o);
      }}
    >
      <PopoverTrigger onAuxClick={() => {}}>{props.children}</PopoverTrigger>
      <PopoverContent className="border-0 p-0 dark:border" side="right">
        <div className="rounded-b shadow-2xl">
          <div className={cssClass}>{props.values.qb_node_type} parameters</div>
          <form onSubmit={props.onSubmit} ref={form}>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {!props.fields?.length && (
                <FormField
                  name="id"
                  label="ID"
                  inputType="input"
                  defaultValue={props.values.id}
                />
              )}
              {props.fields?.map((f) => (
                <FormField
                  {...f}
                  key={f.name}
                  defaultValue={props.values[f.name]}
                />
              ))}
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ParametersList(props: { parameters: { [k: string]: any } }) {
  const { style: classes } = useContext(QueryBuilderContext);
  const parametersClass =
    classes?.[props.parameters.qb_node_type]?.params ||
    " bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-100";
  const cssClass =
    "rounded-xl border-4 border-background px-4 py-2 font-mono text-xs  " +
    parametersClass;

  const list = useMemo(() => {
    const arr: { key: string; value: string }[] = [];
    const blacklist = ["qb_node_type", "error", "animate"];
    Object.keys(props.parameters).forEach((k) => {
      if (blacklist.includes(k) || !props.parameters[k]) return;
      arr.push({ key: k, value: props.parameters[k] });
    });
    return arr;
  }, [props.parameters]);

  if (!list.length) return null;

  return (
    <ul className={cssClass}>
      {list.map((l) => (
        <li key={l.key} className="whitespace-nowrap">
          {l.key}: {l.value}
        </li>
      ))}
    </ul>
  );
}

export default React.memo(Node, (p, c) => {
  return !deepDiff(p.data, c.data);
});

export function generateNodeStyle(
  nodeDefinitions: NodeDefinition[],
  colorByCategory?: boolean
): NodeClassDefinitionMap {
  const uniqueCategories = new Set(
    nodeDefinitions.map((n) => n.category).filter((c) => c)
  );
  const category = Array.from(uniqueCategories).reduce((acc, c, i) => {
    return { ...acc, [c]: styles[i % styles.length] };
  }, {} as NodeClassDefinitionMap);
  return nodeDefinitions.reduce((acc, n, i) => {
    return {
      ...acc,
      [n.id]:
        colorByCategory && uniqueCategories.size > 1
          ? category[n.category]
          : styles[i % styles.length],
    };
  }, {});
}

const styles: NodeClassDefinitionMap["string"][] = [
  {
    form: "bg-purple-600 dark:bg-purple-700",
    icon: "bg-purple-500 dark:bg-purple-900",
    params:
      "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-100",
  },
  {
    icon: "bg-orange-500 dark:bg-orange-900",
    params:
      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-100",
    form: "bg-orange-500 dark:bg-orange-700",
  },
  {
    icon: "bg-pink-500 dark:bg-pink-900",
    params: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-100",
    form: "bg-pink-500 dark:bg-pink-700",
  },
  {
    icon: "bg-lime-500 dark:bg-lime-900",
    params: "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-100",
    form: "bg-lime-500 dark:bg-lime-700",
  },
  {
    icon: "bg-blue-500 dark:bg-blue-900",
    params: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-100",
    form: "bg-blue-500 dark:bg-blue-700",
  },
  {
    icon: "bg-yellow-500 dark:bg-yellow-900",
    params:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-100",
    form: "bg-yellow-500 dark:bg-yellow-700",
  },
  {
    icon: "bg-emerald-500 dark:bg-emerald-900",
    params:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    form: "bg-emerald-500 dark:bg-emerald-700",
  },
  {
    icon: "bg-amber-600 dark:bg-amber-900",
    params: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-100",
    form: "bg-amber-600 dark:bg-amber-700",
  },
  {
    form: "bg-indigo-500 dark:bg-indigo-700",
    icon: "bg-indigo-500 dark:bg-indigo-900",
    params:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-100",
  },
  {
    icon: "bg-rose-500 dark:bg-rose-900",
    params: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-100",
    form: "bg-rose-500 dark:bg-rose-700",
  },
  {
    icon: "bg-violet-500  dark:bg-violet-900",
    params:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-100",
    form: "bg-violet-500 dark:bg-violet-700",
  },
];
