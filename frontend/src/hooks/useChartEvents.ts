import { useMemo } from "react";
import type ReactECharts from "echarts-for-react";
import type { FilterOp } from "@/types/charts";
import { buildEventHandlers } from "@/utils/charts";

export function useChartEvents(
  opId: string,
  spec: Record<string, unknown>,
  echartsRef: React.RefObject<ReactECharts>,
  applyFilter: (ops: FilterOp[]) => void,
  setFilterHint: (hint: string | null) => void,
  setTimelineRange: (r: { min: string; max: string; xCol: string } | null) => void,
) {
  return useMemo(() => {
    const baseEvents = buildEventHandlers(opId, spec, applyFilter, setFilterHint, setTimelineRange);

    if (opId === "viz_timeline") {
      return {
        ...baseEvents,
        datazoom: (params: unknown) => {
          const p = params as {
            startValue?: unknown;
            endValue?: unknown;
            batch?: { startValue?: unknown; endValue?: unknown }[];
          };
          const xCol = spec._x as string | undefined;
          if (!xCol) return;

          const raw = p.batch?.[0] ?? p;
          let sv = raw.startValue;
          let ev = raw.endValue;

          if (sv === undefined || ev === undefined) {
            const opt = echartsRef.current?.getEchartsInstance()?.getOption() as
              | { dataZoom?: { startValue?: unknown; endValue?: unknown }[] }
              | undefined;
            sv = opt?.dataZoom?.[0]?.startValue;
            ev = opt?.dataZoom?.[0]?.endValue;
          }

          if (sv === undefined || ev === undefined) return;

          const formatRangeValue = (v: unknown) => {
            if (typeof v === "number") return new Date(v).toISOString().split("T")[0];
            const s = String(v);
            if (s.includes("T")) {
              const [d, t] = s.split("T");
              const timePart = t.split(".")[0];
              const hm = timePart.split(":").slice(0, 2).join(":");
              return hm === "00:00" ? d : `${d} ${hm}`;
            }
            return s;
          };

          const min = formatRangeValue(sv);
          const max = formatRangeValue(ev);
          setFilterHint(`${xCol}: ${min} → ${max}`);
          setTimelineRange({ min, max, xCol });
        },
      };
    }

    return baseEvents;
  }, [opId, spec, echartsRef, applyFilter, setFilterHint, setTimelineRange]);
}
