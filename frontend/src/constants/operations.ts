import React from "react";
import {
  ArrowUpDown,
  ChevronUp,
  Trash2,
  Type,
  Filter,
  ListFilter,
  BetweenHorizontalEnd,
  Search,
  Ban,
  CircleDot,
  Eraser,
  Table,
  Package,
} from "lucide-react";

export const DATA_OP_ICONS: Record<string, React.ReactNode> = {
  sort_by: React.createElement(ArrowUpDown, { size: 14 }),
  keep_top_n: React.createElement(ChevronUp, { size: 14 }),
  drop_column: React.createElement(Trash2, { size: 14 }),
  rename_column: React.createElement(Type, { size: 14 }),
  filter_range: React.createElement(BetweenHorizontalEnd, { size: 14 }),
  filter_equals: React.createElement(Filter, { size: 14 }),
  filter_in_values: React.createElement(ListFilter, { size: 14 }),
  filter_text_contains: React.createElement(Search, { size: 14 }),
  filter_not_null: React.createElement(CircleDot, { size: 14 }),
  filter_null: React.createElement(Ban, { size: 14 }),
  drop_rows_any_null: React.createElement(Eraser, { size: 14 }),
  keep_rows_any_null: React.createElement(Table, { size: 14 }),
  group_by: React.createElement(Package, { size: 14 }),
};
