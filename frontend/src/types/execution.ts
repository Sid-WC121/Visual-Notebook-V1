import { SchemaColumn } from "@/types/schema";

export type ExecuteKind = "data" | "viz" | "view";

export interface ExecuteResponse {
  kind: ExecuteKind;
  state_id?: string;
  description?: string;
  count?: number;
  spec?: Record<string, unknown>;
  payload?: ViewPayload;
}

export type ViewPayload =
  | { kind: "schema"; columns: (SchemaColumn & { nulls?: number; min?: string; max?: string })[] }
  | { kind: "row_count"; count: number };

export interface MapPayload {
  kind: "map";
  lat_col?: string;
  lon_col?: string;
  center: [number, number] | null;
  points: [number, number][];
  error?: string;
}
