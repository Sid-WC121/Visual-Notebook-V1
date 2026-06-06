import { branchOp, executeFromState } from "@/services/api";
import type { CellData, CellMeta, ChartCellData, MarkdownCellData, OpStep, TableCellData } from "@/types/notebook";

export interface CascadeOptions {
  meta?: CellMeta;
  overwriteIndex?: number;
  preservedId?: string;
}

export async function applyChainAndCascade(
  currentCells: CellData[],
  parentIndex: number,
  ops: OpStep[],
  options?: CascadeOptions,
): Promise<CellData[]> {
  const parent = currentCells[parentIndex];
  if (!parent || parent.type === "markdown") return currentCells;

  const parentStateId = parent.type === "table" ? parent.stateId : parent.sourceStateId;
  const parentLineage = parent.lineage;

  let curState = parentStateId;
  let lastDesc = "";
  let lastCount = 0;
  for (const step of ops) {
    const r = await branchOp(curState, step.op_id, step.params);
    if (r.kind !== "data" || !r.state_id) {
      throw new Error("Backend did not return a new state.");
    }
    curState = r.state_id;
    lastDesc = r.description ?? lastDesc;
    lastCount = r.count ?? lastCount;
  }

  const inserted: TableCellData = {
    id: options?.preservedId || crypto.randomUUID(),
    type: "table",
    stateId: curState,
    description: lastDesc || ops[ops.length - 1].op_id,
    rowCount: lastCount,
    lineage: [...parentLineage, lastDesc || ops[ops.length - 1].op_id],
    opChain: ops,
    meta: options?.meta,
  };

  // Markdown separator inserted right after the new table cell
  const mdCell: MarkdownCellData = {
    id: crypto.randomUUID(),
    type: "markdown",
    content: `### ${inserted.description}`,
  };

  const sliceAt =
    options?.overwriteIndex !== undefined ? options.overwriteIndex + 1 : parentIndex + 1;
  const newCells: CellData[] = [...currentCells.slice(0, parentIndex + 1), mdCell, inserted];

  let prevTableStateId = inserted.stateId;
  let prevTableLineage = inserted.lineage;

  let i = sliceAt;
  while (i < currentCells.length) {
    const old = currentCells[i];

    if (old.type === "table") {
      if (!old.opChain || old.opChain.length === 0) break;
      let stateId = prevTableStateId;
      let desc = "";
      let count = 0;
      for (const step of old.opChain) {
        const r = await branchOp(stateId, step.op_id, step.params);
        if (r.kind !== "data" || !r.state_id) {
          throw new Error(`Could not rebase '${step.op_id}'.`);
        }
        stateId = r.state_id;
        desc = r.description ?? desc;
        count = r.count ?? count;
      }
      const updated: TableCellData = {
        id: old.id,
        type: "table",
        stateId,
        description: desc || old.description,
        rowCount: count,
        lineage: [...prevTableLineage, desc || old.description],
        opChain: old.opChain,
        meta: old.meta,
      };
      newCells.push(updated);
      prevTableStateId = updated.stateId;
      prevTableLineage = updated.lineage;
      i++;
    } else if (old.type === "markdown") {
      // Markdown separator cells are preserved as-is
      newCells.push(old);
      i++;
    } else {
      // Find a block of consecutive charts to parallelize
      const chartBlock: ChartCellData[] = [];
      let j = i;
      while (j < currentCells.length && currentCells[j].type === "chart") {
        chartBlock.push(currentCells[j] as ChartCellData);
        j++;
      }

      if (chartBlock.length === 0) {
        i++;
        continue;
      }

      const results = await Promise.all(
        chartBlock.map((c) => executeFromState(c.opId!, c.opParams!, prevTableStateId)),
      );

      results.forEach((r, idx) => {
        const original = chartBlock[idx];
        if (r.kind !== "viz" || !r.spec) {
          throw new Error(`Could not re-render chart '${original.opId}'.`);
        }

        const ownStep = original.lineage[original.lineage.length - 1] ?? "";
        const updated: ChartCellData = {
          id: original.id,
          type: "chart",
          opId: original.opId!,
          opParams: original.opParams!,
          spec: r.spec,
          sourceStateId: prevTableStateId,
          lineage: [...prevTableLineage, ownStep],
          timelineRange: original.timelineRange,
        };
        newCells.push(updated);
      });

      i = j;
    }
  }

  return newCells;
}
