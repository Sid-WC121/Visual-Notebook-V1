import type { ColumnType } from "@/types/schema";
import { Hash, Type, Clock, Check, HelpCircle } from "lucide-react";
import React from "react";

export const TYPE_BADGE_BG: Record<ColumnType, string> = {
  numeric: "bg-indigo-50 text-indigo-700",
  categorical: "bg-emerald-50 text-emerald-700",
  temporal: "bg-amber-50 text-amber-700",
  boolean: "bg-pink-50 text-pink-700",
  other: "bg-panel3 text-textdim",
};

export const TYPE_ICONS: Record<ColumnType, React.ElementType> = {
  numeric: Hash,
  categorical: Type,
  temporal: Clock,
  boolean: Check,
  other: HelpCircle,
};

export const TYPE_BORDER: Record<string, string> = {
  numeric: "border-l-indigo-500",
  categorical: "border-l-emerald-500",
  temporal: "border-l-amber-500",
  boolean: "border-l-pink-500",
  other: "border-l-slate-300",
};

export const TYPE_DOT: Record<string, string> = {
  numeric: "bg-indigo-500",
  categorical: "bg-emerald-500",
  temporal: "bg-amber-500",
  boolean: "bg-pink-500",
  other: "bg-slate-300",
};

export const INPUT_CLASSES =
  "bg-panel border border-border rounded-md text-[13px] px-2.5 py-2 w-full " +
  "focus:outline-hidden focus:border-accent focus:shadow-glow transition-colors";
