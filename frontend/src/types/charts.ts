import { ReactNode } from "react";

export interface FilterOp {
  op_id: string;
  params: Record<string, unknown>;
}

export interface ChartSlot {
  name: string;
  label: string;
  accepts: "numeric" | "categorical" | "temporal" | "boolean" | "any";
}

export interface ChartExtra {
  name: string;
  label: string;
  default: number;
  step?: number;
  min?: number;
  max?: number;
}

export interface ChartType {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  slots: ChartSlot[];
  extras: ChartExtra[];
}
