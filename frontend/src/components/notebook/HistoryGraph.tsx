import { useState } from "react";
import type { GraphLayout, GraphNode, GraphEdge } from "@/utils/graphLayout";

//  Constants 
const ROW_H = 54;    // px per row
const LANE_W = 20;    // px per lane column
const NODE_R = 7;     // node circle radius
const PAD_L = 12;    // left padding
const LABEL_X = 10;  // gap from circle right edge to label

const COLORS = {
  main: "#4f46e5",   // lane 0: indigo
  branch: "#0891b2", // lane 1: cyan
};

function laneColor(lane: number) {
  return lane === 0 ? COLORS.main : COLORS.branch;
}

//  Edge path 
function edgePath(e: GraphEdge): string {
  const x1 = PAD_L + e.fromLane * LANE_W;
  const y1 = e.fromRow * ROW_H + ROW_H / 2 + NODE_R; // bottom of parent circle
  const x2 = PAD_L + e.toLane * LANE_W;
  const y2 = e.toRow * ROW_H + ROW_H / 2 - NODE_R;   // top of child circle

  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Orthogonal L-path: down to y_fork, right to target lane, down to child.
  const y_fork = e.fromRow * ROW_H + ROW_H - 5;
  return "M " + x1 + " " + y1 + " L " + x1 + " " + y_fork + " L " + x2 + " " + y_fork + " L " + x2 + " " + y2;
}

//  Node
function NodeRow({
  node,
  totalLanes,
  inNotebook,
  isHighlighted,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  node: GraphNode;
  totalLanes: number;
  inNotebook: boolean;
  isHighlighted: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const cx = PAD_L + node.lane * LANE_W;
  const cy = node.row * ROW_H + ROW_H / 2;
  // Label past ALL lane columns so no edge can cross it
  const lx = PAD_L + totalLanes * LANE_W + LABEL_X;
  const color = laneColor(node.lane);
  const desc =
    node.description.length > 26
      ? node.description.slice(0, 24) + "…"
      : node.description;

  return (
    <g
      onClick={inNotebook ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: inNotebook ? "pointer" : "default" }}
    >
      {/* Row highlight */}
      {(isHovered || isHighlighted) && (
        <rect
          x={0}
          y={node.row * ROW_H + 1}
          width="100%"
          height={ROW_H - 2}
          fill={color}
          opacity={0.07}
          rx={3}
        />
      )}

      {/* Glow for current */}
      {node.is_current && (
        <circle cx={cx} cy={cy} r={NODE_R + 4} fill={color} opacity={0.2} />
      )}

      {/* Circle — filled for all nodes, colour indicates role */}
      {inNotebook ? (
        <circle cx={cx} cy={cy} r={NODE_R} fill={color} />
      ) : (
        // Orphan: solid but muted (like a git commit on a dead branch)
        <circle cx={cx} cy={cy} r={NODE_R} fill="#94a3b8" opacity={0.55} />
      )}

      {/* Inner dot for current */}
      {node.is_current && inNotebook && (
        <circle cx={cx} cy={cy} r={NODE_R - 2.5} fill="white" opacity={0.9} />
      )}

      {/* Description */}
      <text
        x={lx} y={cy - 5}
        dominantBaseline="middle" fontSize={13}
        fontWeight={node.is_current ? "600" : "400"}
        fill={!inNotebook ? "#94a3b8" : node.is_current ? "#0f172a" : "#334155"}
        style={{ fontFamily: "inherit" }}
      >
        {desc}
      </text>

      {/* Row count */}
      <text
        x={lx} y={cy + 11}
        dominantBaseline="middle" fontSize={11}
        fill={!inNotebook ? "#cbd5e1" : "#64748b"}
        style={{ fontFamily: "ui-monospace, monospace" }}
      >
        {node.count.toLocaleString()} rows
      </text>
    </g>
  );
}

//  Main  
export interface HistoryGraphProps {
  layout: GraphLayout;
  notebookStateIds: Set<string>;
  highlightedId?: string | null;
  onNodeClick: (stateId: string) => void;
}

export function HistoryGraph({
  layout,
  notebookStateIds,
  highlightedId,
  onNodeClick,
}: HistoryGraphProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // SVG width: widest label start (highest lane) + label area
  const svgW = PAD_L + (layout.lanes - 1) * LANE_W + NODE_R + LABEL_X + 190;
  const svgH = Math.max(layout.rows * ROW_H, ROW_H);

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ display: "block", maxWidth: "100%" }}
    >
      {/* Draw ONLY actual parent→child edges — no rails between unrelated nodes */}
      {layout.edges.map((edge) => {
        const toInNotebook = notebookStateIds.has(edge.toId);
        const color = toInNotebook ? laneColor(edge.toLane) : "#94a3b8";
        const isBranch = edge.fromLane !== edge.toLane;
        return (
          <path
            key={`${edge.fromId}-${edge.toId}`}
            d={edgePath(edge)}
            stroke={color}
            strokeWidth={1.5}
            fill="none"
            opacity={toInNotebook ? (isBranch ? 0.65 : 0.5) : 0.4}
          />
        );
      })}

      {/* Nodes on top of edges */}
      {layout.nodes.map((node) => (
        <NodeRow
          key={node.id}
          node={node}
          totalLanes={layout.lanes}
          inNotebook={notebookStateIds.has(node.id)}
          isHighlighted={highlightedId === node.id}
          isHovered={hoveredId === node.id}
          onClick={() => onNodeClick(node.id)}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId(null)}
        />
      ))}
    </svg>
  );
}
