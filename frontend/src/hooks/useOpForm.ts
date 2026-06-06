import { useState, useRef, useEffect } from "react";
import { useColumnStats } from "@/hooks/api/useColumnStats";
import type { OperationDef } from "@/types/operations";

export function useOpForm(op: OperationDef, stateId: string) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const p of op.params) {
      if (p.default !== undefined && p.default !== null) init[p.name] = p.default;
      else if (p.kind === "multi_values_from_column" || p.kind === "columns_multi")
        init[p.name] = [];
      else init[p.name] = "";
    }
    return init;
  });

  const [lastOpId, setLastOpId] = useState(op.id);
  if (op.id !== lastOpId) {
    setLastOpId(op.id);
    const init: Record<string, unknown> = {};
    for (const p of op.params) {
      if (p.default !== undefined && p.default !== null) init[p.name] = p.default;
      else if (p.kind === "multi_values_from_column" || p.kind === "columns_multi")
        init[p.name] = [];
      else init[p.name] = "";
    }
    setValues(init);
  }

  const columnParamName = op.params.find((p) => p.kind.startsWith("column"))?.name;
  const chosenColumn = (columnParamName ? values[columnParamName] : "") as string;
  const colStats = useColumnStats(chosenColumn || null, stateId, !!chosenColumn);

  const lastColStatsRef = useRef<unknown>(null);
  const lastChosenColumnRef = useRef("");

  useEffect(() => {
    if (colStats.data && colStats.data !== lastColStatsRef.current) {
      const columnChanged = chosenColumn !== lastChosenColumnRef.current;
      lastColStatsRef.current = colStats.data;
      lastChosenColumnRef.current = chosenColumn;

      setValues((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const p of op.params) {
          if (p.depends_on !== columnParamName) continue;
          if (op.id === "filter_range" && (p.name === "min" || p.name === "max")) {
            const currentVal = prev[p.name];
            const isDefault =
              currentVal === "" || currentVal === p.default || currentVal === undefined;

            if (columnChanged || isDefault) {
              const v = p.name === "min" ? colStats.data?.min : colStats.data?.max;
              if (v !== undefined && v !== null && next[p.name] !== v) {
                next[p.name] = v;
                changed = true;
              }
            }
          }
        }
        return changed ? next : prev;
      });
    }
  }, [colStats.data, op.id, op.params, columnParamName, chosenColumn]);

  const isValid = op.params.every((p) => {
    const val = values[p.name];
    if (p.kind.startsWith("column")) {
      if (p.kind === "column_numeric_optional" || p.kind === "column_categorical_optional" || p.kind === "columns_multi") return true;
      return !!val;
    }
    if (p.kind === "text") return typeof val === "string" && val.trim().length > 0;
    if (p.kind === "number" || p.kind === "int") return typeof val === "number" && !isNaN(val);
    if (p.kind === "value_from_column" || p.kind === "enum")
      return val !== undefined && val !== null && val !== "";
    return true;
  });

  return { values, setValues, isValid, colStats, columnParamName };
}
