export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toString() : v.toPrecision(6).replace(/\.?0+$/, "");
  }
  return String(v);
}

export function formatType(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
