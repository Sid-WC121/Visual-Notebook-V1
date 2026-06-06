export const K = {
  session: ["session"] as const,
  schema: (stateId?: string) => ["schema", stateId ?? "current"] as const,
  preview: (stateId: string, n: number, offset: number) => ["preview", stateId, n, offset] as const,
  ops: ["operations"] as const,
  history: ["history"] as const,
  colStats: (col: string, stateId?: string) => ["column-stats", col, stateId ?? "current"] as const,
};
