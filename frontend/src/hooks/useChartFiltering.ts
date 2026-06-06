import { useCallback, useEffect, useRef, useState } from "react";
import { useNotebookStore } from "@/store/notebook";
import type { FilterOp } from "@/types/charts";
import type { TimelineRange } from "@/types/notebook";

function rangeKey(range: TimelineRange | null) {
  return range ? `${range.xCol}:${range.min}:${range.max}` : "";
}

export function useChartFiltering(
  cellId: string,
  cellIndex: number,
  opId: string,
  initialTimelineRange?: TimelineRange | null,
) {
  const applyChainAfterChart = useNotebookStore((s) => s.applyChainAfterChart);
  const isCascading = useNotebookStore((s) => s.isCascading);
  const [filterHint, setFilterHint] = useState<string | null>(null);
  const [timelineRange, setTimelineRange] = useState<TimelineRange | null>(
    initialTimelineRange ?? null,
  );
  const [isApplying, setIsApplying] = useState(false);
  const lastAppliedRange = useRef<string>(rangeKey(initialTimelineRange ?? null));

  const applyFilter = useCallback(
    async (ops: FilterOp[]) => {
      setFilterHint(null);
      setIsApplying(true);
      try {
        await applyChainAfterChart(cellIndex, cellId, ops);
      } finally {
        setIsApplying(false);
      }
    },
    [applyChainAfterChart, cellIndex, cellId],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (opId !== "viz_timeline" || !timelineRange || isCascading || isApplying) return;

    const currentRangeKey = rangeKey(timelineRange);
    if (currentRangeKey === lastAppliedRange.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastAppliedRange.current = currentRangeKey;
      applyFilter([
        {
          op_id: "filter_range",
          params: { column: timelineRange.xCol, min: timelineRange.min, max: timelineRange.max },
        },
      ]);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [timelineRange, applyFilter, opId, isCascading, isApplying]);

  return {
    filterHint,
    setFilterHint,
    timelineRange,
    setTimelineRange,
    applyFilter,
    filtering: isCascading || isApplying,
  };
}
