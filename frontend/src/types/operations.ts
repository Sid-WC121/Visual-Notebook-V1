export interface ParamSpec {
  name: string;
  kind: string;
  label: string;
  options?: string[] | null;
  default?: unknown;
  depends_on?: string | null;
}

export interface OperationDef {
  id: string;
  label: string;
  menu: "Data" | "Filter" | "Group" | "Visualize" | "View";
  kind: "data" | "viz" | "view";
  params: ParamSpec[];
}

export interface OperationsCatalog {
  operations: OperationDef[];
}
