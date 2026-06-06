import { FILTER_HINTS } from "@/constants/charts";
import ReactECharts from "echarts-for-react";
import { useRef } from "react";
import type { MapPayload } from "@/types/execution";
import type { ChartCellData } from "@/types/notebook";
import { useNotebookStore } from "@/store/notebook";
import { useChartFiltering } from "@/hooks/useChartFiltering";
import { useChartEvents } from "@/hooks/useChartEvents";
import { MapCanvas } from "@/components/notebook/charts/MapCanvas";
import { ChartHeader } from "@/components/notebook/charts/ChartHeader";
import { EChartsWrapper } from "@/components/notebook/charts/EChartsWrapper";
import { CellActionArea } from "@/components/notebook/cells/CellActionArea";
import { buildInteractiveSpec } from "@/utils/charts";

export interface ChartCellViewProps {
  cell: ChartCellData;
  cellIndex: number;
}

export function ChartCellView({ cell, cellIndex }: ChartCellViewProps) {
  const echartsRef = useRef<ReactECharts>(null);
  const truncateFrom = useNotebookStore((s) => s.truncateFrom);
  const setStoredTimelineRange = useNotebookStore((s) => s.setChartTimelineRange);

  const { filterHint, setFilterHint, timelineRange, setTimelineRange, applyFilter, filtering } =
    useChartFiltering(cell.id, cellIndex, cell.opId, cell.timelineRange);

  const spec = buildInteractiveSpec(cell.opId, cell.spec, timelineRange);

  const handleTimelineRangeChange = (range: typeof timelineRange) => {
    setTimelineRange(range);
    setStoredTimelineRange(cell.id, range);
  };

  const onEvents = useChartEvents(
    cell.opId,
    cell.spec,
    echartsRef,
    applyFilter,
    setFilterHint,
    handleTimelineRangeChange,
  );

  const chartTitle = (cell.spec?.title as { text?: string } | undefined)?.text ?? "Chart";

  const exportPng = () => {
    const instance = echartsRef.current?.getEchartsInstance();
    if (!instance) return;
    const url = instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" });
    const a = document.createElement("a");
    a.href = url;
    const namePart = cell.lineage[cell.lineage.length - 1] || chartTitle;
    const cleanName = namePart
      .replace(/[^a-zA-Z0-9\s_-]/g, "")
      .replace(/[\s_-]+/g, "_")
      .trim();
    a.download = `${cleanName || "chart"}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col">
      <div className="bg-panel border border-border rounded-lg shadow-card overflow-hidden">
        <ChartHeader
          lineage={cell.lineage}
          filtering={filtering}
          filterHint={filterHint}
          onExportPng={exportPng}
          onTruncate={() => truncateFrom(cellIndex)}
        />

        <div className="relative">
          {filtering && (
            <div className="absolute inset-0 bg-panel/50 z-10 flex items-center justify-center">
              <span className="text-[12px] text-accent font-medium">Applying filter…</span>
            </div>
          )}
          {cell.opId === "viz_map" ? (
            <MapCanvas payload={cell.spec as unknown as MapPayload} />
          ) : (
            <EChartsWrapper spec={spec} onEvents={onEvents} echartsRef={echartsRef} />
          )}
        </div>

        <div className="px-3.5 py-2 border-t border-border bg-panel2 flex items-center justify-between gap-3 min-w-0">
          <div className="truncate">
            <FilterInstruction opId={cell.opId} />
          </div>
          {cell.opId === "viz_timeline" && timelineRange && !filtering && (
            <span className="text-[11px] text-textdim whitespace-nowrap shrink-0">
              {timelineRange.min} → {timelineRange.max}
            </span>
          )}
        </div>
      </div>

      <CellActionArea cellId={cell.id} stateId={cell.sourceStateId} cellIndex={cellIndex} />
    </div>
  );
}

function FilterInstruction({ opId }: { opId: string }) {
  const hint = FILTER_HINTS[opId];
  if (!hint) return null;
  return <span className="text-[11px] text-textmute">{hint}</span>;
}
