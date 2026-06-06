import React from "react";
import ReactECharts from "echarts-for-react";

export interface EChartsWrapperProps {
  spec: Record<string, unknown>;
  onEvents: Record<string, (params: unknown) => void>;
  echartsRef: React.Ref<ReactECharts>;
}

export function EChartsWrapper({ spec, onEvents, echartsRef }: EChartsWrapperProps) {
  return (
    <ReactECharts
      ref={echartsRef}
      option={spec}
      notMerge
      style={{ height: 380, width: "100%" }}
      onEvents={onEvents}
    />
  );
}
