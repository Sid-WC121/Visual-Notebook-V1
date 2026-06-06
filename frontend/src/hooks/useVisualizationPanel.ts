import { useEffect, useMemo, useCallback } from "react";
import { useSchema } from "@/hooks/api/useSchema";
import { CHART_TYPES } from "@/constants/charts";
import { useNotebookStore } from "@/store/notebook";
import { useVizStore } from "@/store/viz";
import type { ColumnType, SchemaColumn } from "@/types/schema";

export const TYPE_ORDER: ColumnType[] = ["numeric", "temporal", "categorical", "boolean", "other"];

export function groupColumnsByType(columns: SchemaColumn[]): Map<ColumnType, SchemaColumn[]> {
  const grouped = new Map<ColumnType, SchemaColumn[]>();
  for (const col of columns) {
    const list = grouped.get(col.type as ColumnType) ?? [];
    list.push(col);
    grouped.set(col.type as ColumnType, list);
  }
  return grouped;
}

export function useVisualizationPanel(
  cellId: string,
  stateId: string,
  cellIndex: number,
  onClose: () => void,
) {
  const chartTypeId = useVizStore((s) => s.chartTypeId);
  const setChartTypeId = useVizStore((s) => s.setChartTypeId);
  const slots = useVizStore((s) => s.slots);
  const extras = useVizStore((s) => s.extras);
  const setExtra = useVizStore((s) => s.setExtra);
  const setExtras = useVizStore((s) => s.setExtras);
  const vizCellId = useVizStore((s) => s.vizCellId);
  const setSlot = useVizStore((s) => s.setSlot);

  const appendChartCell = useNotebookStore((s) => s.appendChartCell);
  const isCascading = useNotebookStore((s) => s.isCascading);
  const cascadeError = useNotebookStore((s) => s.cascadeError);

  const { data: schema } = useSchema(stateId);

  const active = useMemo(
    () => CHART_TYPES.find((c) => c.id === chartTypeId) ?? CHART_TYPES[0],
    [chartTypeId],
  );

  useEffect(() => {
    if (active.extras.length === 0) return;
    const next: Record<string, number> = {};
    for (const e of active.extras) next[e.name] = e.default;
    setExtras(next);
  }, [chartTypeId, active.extras, setExtras]);

  const mySlots = useMemo(() => (vizCellId === cellId ? slots : {}), [vizCellId, cellId, slots]);
  const allFilled = useMemo(
    () => active.slots.every((s) => mySlots[s.name]),
    [active.slots, mySlots],
  );

  const onGenerate = useCallback(async () => {
    if (!allFilled) return;
    const params: Record<string, unknown> = {};
    for (const s of active.slots) params[s.name] = mySlots[s.name]!.column;
    for (const e of active.extras) params[e.name] = extras[e.name] ?? e.default;

    await appendChartCell(cellIndex, active.id, params);
    if (!useNotebookStore.getState().cascadeError) onClose();
  }, [allFilled, active, mySlots, extras, appendChartCell, cellIndex, onClose]);

  const makeAssignHandler = useCallback(
    (col: SchemaColumn) => () => {
      const firstEmpty = active.slots.find((s) => {
        const alreadyFilled = !!mySlots[s.name];
        const compatible = s.accepts === "any" || s.accepts === col.type;
        return !alreadyFilled && compatible;
      });
      if (firstEmpty) setSlot(firstEmpty.name, col.name, col.type);
    },
    [active.slots, mySlots, setSlot],
  );

  const groupedColumns = useMemo(
    () => groupColumnsByType(schema?.columns ?? []),
    [schema?.columns],
  );

  return {
    chartTypeId,
    setChartTypeId,
    extras,
    setExtra,
    isCascading,
    cascadeError,
    active,
    allFilled,
    onGenerate,
    makeAssignHandler,
    groupedColumns,
  };
}
