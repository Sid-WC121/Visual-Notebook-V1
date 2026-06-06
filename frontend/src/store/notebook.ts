import { create } from "zustand";
import { persist } from "zustand/middleware";
import { executeFromState } from "@/services/api";
import { applyChainAndCascade, type CascadeOptions } from "@/services/cascade";
import type {
  CellData,
  ChartCellData,
  MarkdownCellData,
  OpStep,
  TableCellData,
  TimelineRange,
} from "@/types/notebook";

interface NotebookState {
  cells: CellData[];
  isCascading: boolean;
  cascadeError: string | null;
  lastAction: "append" | "update" | null;

  initNotebook: (root: TableCellData) => void;
  restoreNotebook: (cells: CellData[]) => void;
  truncateFrom: (index: number) => void;

  applyChainAndCascade: (
    parentIndex: number,
    ops: OpStep[],
    options?: CascadeOptions,
  ) => Promise<void>;

  applyWithoutCascade: (parentIndex: number, ops: OpStep[]) => Promise<void>;

  applyChainAfterChart: (chartIndex: number, chartId: string, ops: OpStep[]) => Promise<void>;

  appendChartCell: (
    parentIndex: number,
    opId: string,
    params: Record<string, unknown>,
  ) => Promise<void>;
  setChartTimelineRange: (cellId: string, range: TimelineRange | null) => void;
  updateMarkdownCell: (cellId: string, content: string) => void;
}

export const useNotebookStore = create<NotebookState>()(
  persist(
    (set, get) => ({
      cells: [],
      isCascading: false,
      cascadeError: null,
      lastAction: null,

      initNotebook: (root) =>
        set({ cells: [root], isCascading: false, cascadeError: null, lastAction: null }),

      restoreNotebook: (cells) =>
        set({ cells, isCascading: false, cascadeError: null, lastAction: null }),

      truncateFrom: (index) => set((s) => ({ cells: s.cells.slice(0, index), lastAction: null })),

      applyChainAndCascade: async (parentIndex, ops, options) => {
        if (ops.length === 0) return;
        set({ isCascading: true, cascadeError: null });

        try {
          const newCells = await applyChainAndCascade(get().cells, parentIndex, ops, options);
          set({
            cells: newCells,
            isCascading: false,
            lastAction: get().lastAction === "update" ? "update" : "append",
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ isCascading: false, cascadeError: msg, lastAction: null });
        }
      },

      applyWithoutCascade: async (parentIndex, ops) => {
        if (ops.length === 0) return;
        const cells = get().cells;
        const parent = cells[parentIndex];
        if (!parent || parent.type === "markdown") return;
        const parentStateId = parent.type === "table" ? parent.stateId : parent.sourceStateId;
        const parentLineage = parent.lineage;
        if (!parentStateId) return;

        set({ isCascading: true, cascadeError: null });
        try {
          let curState = parentStateId;
          let lastDesc = "";
          let lastCount = 0;
          for (const step of ops) {
            const r = await (await import("@/services/api")).branchOp(curState, step.op_id, step.params);
            if (r.kind !== "data" || !r.state_id) throw new Error("Backend did not return a new state.");
            curState = r.state_id;
            lastDesc = r.description ?? lastDesc;
            lastCount = r.count ?? lastCount;
          }
          const label = lastDesc || ops[ops.length - 1].op_id;
          const inserted: TableCellData = {
            id: crypto.randomUUID(),
            type: "table",
            stateId: curState,
            description: label,
            rowCount: lastCount,
            lineage: [...parentLineage, label],
            opChain: ops,
          };
          const mdCell: MarkdownCellData = {
            id: crypto.randomUUID(),
            type: "markdown",
            content: `### ${label}`,
          };
          // Insert right after parent; downstream cells are LEFT UNCHANGED
          set((s) => ({
            cells: [
              ...s.cells.slice(0, parentIndex + 1),
              mdCell,
              inserted,
              ...s.cells.slice(parentIndex + 1),
            ],
            isCascading: false,
            lastAction: "append",
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ isCascading: false, cascadeError: msg, lastAction: null });
        }
      },

      applyChainAfterChart: async (chartIndex, chartId, ops) => {
        const cells = get().cells;
        const next = cells[chartIndex + 1];
        const isUpdate = next?.type === "table" && next.meta?.fromChartId === chartId;

        set({ lastAction: "update" });
        await get().applyChainAndCascade(chartIndex, ops, {
          meta: { fromChartId: chartId },
          overwriteIndex: isUpdate ? chartIndex + 1 : undefined,
          preservedId: isUpdate ? next.id : undefined,
        });
      },

      appendChartCell: async (parentIndex, opId, params) => {
        const cells = get().cells;
        const parent = cells[parentIndex];
        if (!parent || parent.type === "markdown") return;

        const stateId = parent.type === "table" ? parent.stateId : parent.sourceStateId;
        if (!stateId) return;

        set({ isCascading: true, cascadeError: null, lastAction: null });
        try {
          const r = await executeFromState(opId, params, stateId);
          if (r.kind !== "viz" || !r.spec) {
            throw new Error("Backend did not return a chart spec.");
          }
          const stepDesc = `${opId.replace(/^viz_/, "")}: ${
            Object.values(params).filter(Boolean).join(", ") || "—"
          }`;

          const baseLineage =
            parent.type === "table" ? parent.lineage : parent.lineage.slice(0, -1);
          const cell: ChartCellData = {
            id: crypto.randomUUID(),
            type: "chart",
            opId,
            opParams: params,
            spec: r.spec,
            sourceStateId: stateId,
            lineage: [...baseLineage, stepDesc],
          };

          const mdCell: MarkdownCellData = {
            id: crypto.randomUUID(),
            type: "markdown",
            content: `### ${stepDesc}`,
          };

          set((s) => ({
            cells: [...s.cells.slice(0, parentIndex + 1), mdCell, cell, ...s.cells.slice(parentIndex + 1)],
            isCascading: false,
            lastAction: "append",
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ isCascading: false, cascadeError: msg, lastAction: null });
        }
      },

      setChartTimelineRange: (cellId, range) =>
        set((s) => ({
          cells: s.cells.map((cell) =>
            cell.type === "chart" && cell.id === cellId ? { ...cell, timelineRange: range } : cell,
          ),
        })),

      updateMarkdownCell: (cellId, content) =>
        set((s) => ({
          cells: s.cells.map((cell) =>
            cell.type === "markdown" && cell.id === cellId ? { ...cell, content } : cell,
          ),
        })),
    }),
    {
      name: "va-notebook",
      version: 3,
      migrate: (_persisted, _version) => ({ cells: [] }),
      partialize: (s) => ({ cells: s.cells }),
    },
  ),
);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__notebookStore = useNotebookStore;
}
