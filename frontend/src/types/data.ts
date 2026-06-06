import { ColumnType } from "@/types/schema";

export interface PreviewResponse {
  columns: string[];
  rows: unknown[][];
  total: number;
  shown: number;
  offset: number;
}

export interface ColumnStats {
  column: string;
  column_type: ColumnType;
  null_count: number;
  min?: unknown;
  max?: unknown;
  distinct_values?: unknown[] | null;
  distinct_truncated: boolean;
}
