import type { FilterOp } from "@/types/charts";

type SpecTransformer = (spec: Record<string, unknown>) => Record<string, unknown>;

const INTERACTIVE_SPECS: Record<string, SpecTransformer> = {
  viz_scatter: (spec) => ({
    ...spec,
    brush: {
      toolbox: ["rect", "polygon", "clear"],
      brushStyle: { borderWidth: 1, color: "rgba(79,70,229,0.1)", borderColor: "#4f46e5" },
    },
    toolbox: {
      feature: {
        brush: { type: ["rect", "polygon", "clear"] },
      },
      right: 8,
      top: 8,
    },
  }),
  viz_timeline: (spec) => ({
    ...spec,
    dataZoom: [
      {
        type: "slider",
        xAxisIndex: 0,
        bottom: 12,
        height: 24,
        borderColor: "#e2e8f0",
        fillerColor: "rgba(79,70,229,0.1)",
        handleStyle: { color: "#4f46e5" },
        moveHandleStyle: { color: "#4f46e5" },
        showDetail: false,
      },
    ],
    grid: { ...((spec.grid as object) ?? {}), bottom: 75 },
  }),
};

export function buildInteractiveSpec(
  opId: string,
  spec: Record<string, unknown>,
  timelineRange?: { min: string; max: string } | null,
) {
  const transform = INTERACTIVE_SPECS[opId];
  const transformed = transform ? transform(spec) : spec;

  const title = (transformed.title as Record<string, unknown>) || {};
  title.show = false;
  transformed.title = title;

  if (opId === "viz_timeline" && timelineRange) {
    const dz = (transformed.dataZoom as Record<string, unknown>[])?.[0];
    if (dz) {
      dz.startValue = timelineRange.min;
      dz.endValue = timelineRange.max;
    }
  }

  return transformed;
}

interface HandlerArgs {
  spec: Record<string, unknown>;
  applyFilter: (ops: FilterOp[]) => void;
  setFilterHint: (hint: string | null) => void;
  setTimelineRange?: (r: { min: string; max: string; xCol: string } | null) => void;
}

type HandlerFactory = (args: HandlerArgs) => Record<string, (params: unknown) => void>;

const EVENT_HANDLERS: Record<string, HandlerFactory> = {
  viz_histogram: ({ spec, applyFilter, setFilterHint }) => ({
    click: (params) => {
      const p = params as { dataIndex: number };
      const edges = spec._binEdges as number[] | undefined;
      const col = spec._column as string | undefined;
      if (!edges || !col) return;
      const min = edges[p.dataIndex];
      const max = edges[p.dataIndex + 1];
      if (min === undefined || max === undefined) return;
      setFilterHint(`Filtering ${col}: [${min.toFixed(2)}, ${max.toFixed(2)}]`);
      applyFilter([{ op_id: "filter_range", params: { column: col, min, max } }]);
    },
    mouseover: () => {},
    mouseout: () => {},
  }),

  viz_bar_topn: ({ spec, applyFilter, setFilterHint }) => ({
    click: (params) => {
      const p = params as { name: string };
      const col = spec._column as string | undefined;
      if (!col || !p.name) return;
      setFilterHint(`Filtering ${col} = "${p.name}"`);
      applyFilter([{ op_id: "filter_in_values", params: { column: col, values: [p.name] } }]);
    },
    mouseover: () => {},
    mouseout: () => {},
  }),

  viz_scatter: ({ spec, applyFilter, setFilterHint }) => ({
    brushSelected: (params) => {
      const p = params as {
        batch: { selected: { seriesIndex: number; dataIndex: number[] }[] }[];
      };
      const selected = p.batch?.[0]?.selected?.[0];
      if (!selected || selected.dataIndex.length === 0) return;

      const xCol = spec._x as string | undefined;
      const yCol = spec._y as string | undefined;
      if (!xCol || !yCol) return;

      const series = (spec.series as { data: [number, number][] }[])[0];
      if (!series?.data) return;

      const pts = selected.dataIndex.map((i) => series.data[i]).filter(Boolean);
      if (pts.length === 0) return;

      const xMin = Math.min(...pts.map((pt) => pt[0]));
      const xMax = Math.max(...pts.map((pt) => pt[1]));
      const yMin = Math.min(...pts.map((pt) => pt[1]));
      const yMax = Math.max(...pts.map((pt) => pt[1]));

      setFilterHint(`Filtering ${pts.length} points selected`);
      applyFilter([
        { op_id: "filter_range", params: { column: xCol, min: xMin, max: xMax } },
        { op_id: "filter_range", params: { column: yCol, min: yMin, max: yMax } },
      ]);
    },
  }),

  viz_timeline: ({ spec, setTimelineRange }) => ({
    datazoom: (params) => {
      const p = params as {
        startValue?: unknown;
        endValue?: unknown;
        batch?: { startValue?: unknown; endValue?: unknown }[];
      };
      const xCol = spec._x as string | undefined;
      if (!xCol) return;
      const raw = p.batch?.[0] ?? p;
      if (raw.startValue === undefined || raw.endValue === undefined) return;
      const toDate = (v: unknown) =>
        typeof v === "number" ? new Date(v).toISOString().split("T")[0] : String(v);
      const min = toDate(raw.startValue);
      const max = toDate(raw.endValue);
      setTimelineRange?.({ min, max, xCol });
    },
  }),

  viz_heatmap: ({ spec, applyFilter, setFilterHint }) => ({
    click: (params) => {
      const p = params as { data: [number, number, number] };
      const xCol = spec._x as string | undefined;
      const yCol = spec._y as string | undefined;
      if (!xCol || !yCol || !p.data) return;
      const xCategories = (spec.xAxis as { data?: string[] } | undefined)?.data ?? [];
      const yCategories = (spec.yAxis as { data?: string[] } | undefined)?.data ?? [];
      const xIdx = p.data[0];
      const yIdx = p.data[1];
      const xVal = xCategories[xIdx];
      const yVal = yCategories[yIdx];
      if (xVal === undefined || yVal === undefined) return;

      const xType = spec._xColType as string | undefined;
      const yType = spec._yColType as string | undefined;
      const xEdges = spec._xBinEdges as unknown[] | undefined;
      const yEdges = spec._yBinEdges as unknown[] | undefined;

      const makeOp = (
        col: string,
        idx: number,
        colType: string | undefined,
        edges: unknown[] | undefined,
        label: string,
      ) => {
        if ((colType === "numeric" || colType === "temporal") && edges) {
          return {
            op_id: "filter_range",
            params: { column: col, min: edges[idx], max: edges[idx + 1] },
          };
        }
        return { op_id: "filter_equals", params: { column: col, value: label } };
      };

      setFilterHint(`Filtering ${xCol}="${xVal}", ${yCol}="${yVal}"`);
      applyFilter([
        makeOp(xCol, xIdx, xType, xEdges, xVal),
        makeOp(yCol, yIdx, yType, yEdges, yVal),
      ]);
    },
  }),
};

export function buildEventHandlers(
  opId: string,
  spec: Record<string, unknown>,
  applyFilter: (ops: FilterOp[]) => void,
  setFilterHint: (hint: string | null) => void,
  setTimelineRange?: (r: { min: string; max: string; xCol: string } | null) => void,
): Record<string, (params: unknown) => void> {
  const factory = EVENT_HANDLERS[opId];
  return factory ? factory({ spec, applyFilter, setFilterHint, setTimelineRange }) : {};
}
