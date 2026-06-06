import { ChartType } from "@/types/charts";
import { BarChart3, BarChartHorizontal, ScatterChart, LineChart, Grid3X3, Map, PieChart, Box, AreaChart, Filter, Layout, BarChart4 } from "lucide-react";
import React from "react";

export const CHART_TYPES: ChartType[] = [
  {
    id: "viz_histogram",
    label: "Histogram",
    description: "Shows the frequency distribution of a single numeric column.",
    icon: React.createElement(BarChart3, { size: 14 }),
    slots: [{ name: "column", label: "Numeric column", accepts: "numeric" }],
    extras: [{ name: "bins", label: "Bins", default: 30, min: 2, max: 200 }],
  },
  {
    id: "viz_scatter",
    label: "Scatter",
    description: "Plots points to identify correlation between two numeric columns.",
    icon: React.createElement(ScatterChart, { size: 14 }),
    slots: [
      { name: "x", label: "X (numeric)", accepts: "numeric" },
      { name: "y", label: "Y (numeric)", accepts: "numeric" },
    ],
    extras: [],
  },
  {
    id: "viz_area",
    label: "Area Chart",
    description: "Shows volume over time using a filled area under a curve.",
    icon: React.createElement(AreaChart, { size: 14 }),
    slots: [
      { name: "x", label: "X (date/time)", accepts: "temporal" },
      { name: "y", label: "Y (numeric)", accepts: "numeric" },
    ],
    extras: [],
  },
  {
    id: "viz_pie",
    label: "Pie Chart",
    description: "Displays the top categories as proportional slices.",
    icon: React.createElement(PieChart, { size: 14 }),
    slots: [{ name: "column", label: "Categorical column", accepts: "categorical" }],
    extras: [{ name: "n", label: "Top N", default: 5, min: 2, max: 20 }],
  },
  {
    id: "viz_funnel",
    label: "Funnel Chart",
    description: "Shows progressive reduction or step-by-stage values across categories.",
    icon: React.createElement(Filter, { size: 14 }),
    slots: [{ name: "column", label: "Categorical column", accepts: "categorical" }],
    extras: [{ name: "n", label: "Top N", default: 5, min: 2, max: 20 }],
  },
  {
    id: "viz_treemap",
    label: "Treemap",
    description: "Visualizes hierarchical data or distribution via nested rectangles.",
    icon: React.createElement(Layout, { size: 14 }),
    slots: [
      { name: "column", label: "Category", accepts: "categorical" },
      { name: "value", label: "Value (optional)", accepts: "numeric" },
    ],
    extras: [],
  },
  {
    id: "viz_bar_stacked",
    label: "Stacked Bar",
    description: "Compares proportions of groups across variables using stacked segments.",
    icon: React.createElement(BarChart4, { size: 14 }),
    slots: [
      { name: "x", label: "X Axis", accepts: "any" },
      { name: "by", label: "Stack By", accepts: "categorical" },
      { name: "y", label: "Y Value (optional)", accepts: "numeric" },
    ],
    extras: [],
  },
  {
    id: "viz_boxplot",
    label: "Box Plot",
    description: "Visualizes summary statistics (min, quartiles, median, max) of a numeric column.",
    icon: React.createElement(Box, { size: 14 }),
    slots: [
      { name: "column", label: "Numeric column", accepts: "numeric" },
      { name: "by", label: "Group by (optional)", accepts: "categorical" }
    ],
    extras: [],
  },
  {
    id: "viz_bar_topn",
    label: "Bar top-N",
    description: "Displays the most frequent categories as horizontal bars.",
    icon: React.createElement(BarChartHorizontal, { size: 14 }),
    slots: [{ name: "column", label: "Categorical column", accepts: "categorical" }],
    extras: [{ name: "n", label: "N", default: 10, min: 3, max: 50 }],
  },
  {
    id: "viz_timeline",
    label: "Timeline",
    description: "Traces numeric values along a continuous date/time axis.",
    icon: React.createElement(LineChart, { size: 14 }),
    slots: [
      { name: "x", label: "X (date/time)", accepts: "temporal" },
      { name: "y", label: "Y (numeric)", accepts: "numeric" },
    ],
    extras: [],
  },
  {
    id: "viz_heatmap",
    label: "Heatmap",
    description: "Shows data density/intensity in a 2D grid using color variations.",
    icon: React.createElement(Grid3X3, { size: 14 }),
    slots: [
      { name: "x", label: "X", accepts: "any" },
      { name: "y", label: "Y", accepts: "any" },
    ],
    extras: [{ name: "bins", label: "Bins (numeric)", default: 10, min: 2, max: 50 }],
  },
  {
    id: "viz_map",
    label: "Map",
    description: "Plots geographic latitude and longitude coordinates on a map.",
    icon: React.createElement(Map, { size: 14 }),
    slots: [
      { name: "lat", label: "Latitude", accepts: "numeric" },
      { name: "lon", label: "Longitude", accepts: "numeric" },
    ],
    extras: [],
  },
];

export const FILTER_HINTS: Record<string, string> = {
  viz_histogram: "Click on a bar to filter by that bin.",
  viz_bar_topn: "Click on a bar to filter by that category.",
  viz_scatter: "Use the rectangle or lasso tool (top right toolbox) to select points and filter.",
  viz_timeline: "Use the slider to select a range.",
  viz_area: "Use the slider to select a range.",
  viz_heatmap: "Click on a cell to filter by that combination of values.",
  viz_pie: "Click on a slice to filter by that category.",
  viz_funnel: "Click on a stage to filter by that category.",
  viz_treemap: "Click on a block to filter by that category.",
  viz_bar_stacked: "Click on a stacked segment to filter by that intersection.",
  viz_boxplot: "Box plots do not support direct filtering yet.",
};
