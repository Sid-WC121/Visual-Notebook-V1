import { useEffect } from "react";
import { useNotebookStore } from "@/store/notebook";
import type { SessionInfo } from "@/types/session";
import type { HistoryResponse } from "@/types/history";

export function useNotebookInitialization(
  session: SessionInfo | undefined,
  history: HistoryResponse | undefined,
) {
  const cells = useNotebookStore((s) => s.cells);
  const initNotebook = useNotebookStore((s) => s.initNotebook);
  const truncateFrom = useNotebookStore((s) => s.truncateFrom);

  useEffect(() => {
    if (!session?.has_data || cells.length > 0 || !history) return;
    const root = history.states.find((s) => s.parent_id === null) ?? history.states[0];
    if (!root) return;
    initNotebook({
      id: crypto.randomUUID(),
      type: "table",
      stateId: root.id,
      description: root.description,
      rowCount: root.count,
      lineage: [],
      opChain: [],
    });
  }, [session?.has_data, history, cells.length, initNotebook]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session.has_data && cells.length > 0) {
      truncateFrom(0);
    }
  }, [session, cells.length, truncateFrom]);

  useEffect(() => {
    if (!session?.has_data || !history || history.states.length === 0) return;
    if (cells.length === 0) return;
    const firstCell = cells[0];
    const rootStateId = firstCell.type === "table" ? firstCell.stateId : null;
    const backendRoot = history.states.find((s) => s.parent_id === null) ?? history.states[0];
    if (rootStateId && backendRoot && rootStateId !== backendRoot.id) {
      truncateFrom(0);
    }
  }, [session?.has_data, history, cells, truncateFrom]);
}
