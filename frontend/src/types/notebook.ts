export interface OpStep {
  op_id: string;
  params: Record<string, unknown>;
}

export interface TimelineRange {
  min: string;
  max: string;
  xCol: string;
}

export interface CellMeta {
  fromChartId?: string;
}

export interface TableCellData {
  id: string;
  type: "table";
  stateId: string;
  description: string;
  rowCount: number;
  lineage: string[];
  opChain: OpStep[];
  meta?: CellMeta;
}

export interface ChartCellData {
  id: string;
  type: "chart";
  opId: string;
  opParams: Record<string, unknown>;
  spec: Record<string, unknown>;
  sourceStateId: string;
  lineage: string[];
  timelineRange?: TimelineRange | null;
}

export interface MarkdownCellData {
  id: string;
  type: "markdown";
  content: string; // raw markdown
}

export type CellData = TableCellData | ChartCellData | MarkdownCellData;
