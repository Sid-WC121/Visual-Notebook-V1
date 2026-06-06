export type ColumnType = "numeric" | "categorical" | "temporal" | "boolean" | "other";

export interface SchemaColumn {
  name: string;
  type: ColumnType;
  dtype: string;
}

export interface SchemaResponse {
  columns: SchemaColumn[];
}
