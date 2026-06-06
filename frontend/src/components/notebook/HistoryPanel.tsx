/**
 * HistoryPanel — collapsible right-side panel showing the git-style History tree.
 *
 * Behaviour:
 * - Opens/closes via `useUIStore().historyPanelOpen`.
 * - Fetches `/api/history` via `useHistory()` (already used in App.tsx).
 * - Computes the graph layout from `buildGraphLayout()`.
 * - On node click: finds the matching TableCellData by stateId and emits
 *   `onNavigate(cellId)` so App.tsx can scroll to it.
 * - Nodes that have NO matching cell in cells[] are still shown (dimmed),
 *   because they exist in the backend History tree (e.g. created by a previous
 *   branch that was deleted from the notebook but not from the backend).
 */

import { useEffect, useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { useHistory } from "@/hooks/api/useHistory";
import { useNotebookStore } from "@/store/notebook";
import { useSession } from "@/hooks/api/useSession";
import { buildGraphLayout } from "@/utils/graphLayout";
import { HistoryGraph } from "@/components/notebook/HistoryGraph";

interface HistoryPanelProps {
  /** Called with the cell DOM id to scroll to. */
  onNavigate: (cellId: string) => void;
}

export function HistoryPanel({ onNavigate }: HistoryPanelProps) {
  const { data: session } = useSession();
  const { data: history, isLoading, refetch } = useHistory(!!session?.has_data);
  const cells = useNotebookStore((s) => s.cells);
  const [highlightedStateId, setHighlightedStateId] = useState<string | null>(null);

  // Refetch history whenever the notebook cells change (new op, cascade rebase, etc.)
  const cellsKey = useNotebookStore((s) =>
    s.cells
      .map((c) => (c.type === "table" ? c.stateId : c.type === "chart" ? c.sourceStateId : ""))
      .join(","),
  );
  useEffect(() => {
    refetch();
  }, [cellsKey, refetch]);

  // Build graph layout whenever history changes
  const layout = useMemo(() => {
    if (!history) return { nodes: [], edges: [], lanes: 1, rows: 0 };
    return buildGraphLayout(history.states, history.lineage_ids);
  }, [history]);

  // Index: stateId → cell DOM id
  const stateIdToCellId = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of cells) {
      if (cell.type === "table") {
        map.set(cell.stateId, cell.id);
      }
    }
    return map;
  }, [cells]);

  const notebookStateIds = useMemo(
    () => new Set(stateIdToCellId.keys()),
    [stateIdToCellId],
  );

  function handleNodeClick(stateId: string) {
    const cellId = stateIdToCellId.get(stateId);
    if (!cellId) return; // node not in notebook — no scroll
    setHighlightedStateId(stateId);
    onNavigate(cellId);
  }

  // Number of distinct branch lanes (= unique non-main paths from lineage nodes)
  const totalBranches = layout.lanes - 1;

  // Count of in-notebook nodes NOT on lane 0 (user's active branches)
  const activeBranchCount = layout.nodes.filter(
    (n) => n.lane > 0 && notebookStateIds.has(n.id),
  ).length;

  return (
    <div className="flex flex-col h-full bg-panel border-l border-border overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-panel2 shrink-0">
        <GitBranch size={13} className="text-accent shrink-0" />
        <span className="text-[12px] font-semibold text-text tracking-tight flex-1">
          History
        </span>
        {(totalBranches > 0 || activeBranchCount > 0) && (
          <span className="text-[10px] font-mono text-textmute bg-panel3 px-1.5 py-0.5 rounded-full border border-border">
            {activeBranchCount > 0
              ? `${activeBranchCount} branch`
              : `${totalBranches} lane${totalBranches !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {/* Graph scroll area */}
      <div className="flex-1 overflow-y-auto overflow-x-auto pt-1 px-2 pb-2">
        {isLoading && (
          <div className="flex items-center justify-center h-24 text-textmute text-[11px]">
            Loading…
          </div>
        )}

        {!isLoading && layout.nodes.length === 0 && (
          <div className="flex items-center justify-center h-24 text-textmute text-[11px]">
            No history yet.
          </div>
        )}

        {!isLoading && layout.nodes.length > 0 && (
          <HistoryGraph
            layout={layout}
            notebookStateIds={notebookStateIds}
            highlightedId={highlightedStateId}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 border-t border-border px-3 py-2 bg-panel2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-[9.5px] text-textmute">
            <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#4f46e5" /></svg>
            In notebook
          </span>
          <span className="text-textmute text-[9.5px]">·</span>
          <span className="flex items-center gap-1 text-[9.5px] text-textmute">
            <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#94a3b8" opacity="0.55" /></svg>
            Orphan (old rebased state)
          </span>
          <span className="text-textmute text-[9.5px]">·</span>
          <span className="text-[9.5px] text-textmute">Click to scroll</span>
        </div>
      </div>
    </div>
  );
}
