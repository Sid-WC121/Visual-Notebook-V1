import { useNotebookStore } from "@/store/notebook";
import { TablePreview } from "@/components/notebook/data/TablePreview";
import { CellActionArea } from "@/components/notebook/cells/CellActionArea";
import { Label } from "@/components/ui/Label";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { X, Download, Database, Table } from "lucide-react";
import type { TableCellData } from "@/types/notebook";
import { LineageTrail } from "@/components/ui/LineageTrail";

export interface TableCellViewProps {
  cell: TableCellData;
  cellIndex: number;
  isRoot: boolean;
}

export function TableCellView({ cell, cellIndex, isRoot }: TableCellViewProps) {
  const truncateFrom = useNotebookStore((s) => s.truncateFrom);

  return (
    <div className="flex flex-col">
      <div className="bg-panel border border-border rounded-lg shadow-card overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-panel2 border-b border-border h-13">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Label
              variant="accent"
              size="sm"
              tracking="wider"
              className="shrink-0 flex items-center gap-1.5"
            >
              {isRoot ? <Database size={14} /> : <Table size={14} />}
              {isRoot ? "Dataset" : "Table"}
            </Label>
            <div className="w-px h-3 bg-border shrink-0" />
            <LineageTrail lineage={cell.lineage} />
          </div>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <span className="font-mono text-[11px] text-textdim whitespace-nowrap">
              {cell.rowCount.toLocaleString()} rows
            </span>
            <SimpleTooltip content="Export this state as CSV">
              <a
                href={`/api/export?state_id=${cell.stateId}`}
                download
                className="text-[11px] text-textmute hover:text-text transition-colors flex items-center gap-1 h-6 px-1.5 whitespace-nowrap"
              >
                <Download size={12} /> CSV
              </a>
            </SimpleTooltip>
            {!isRoot && (
              <SimpleTooltip content="Delete this cell and all cells below">
                <button
                  onClick={() => truncateFrom(cellIndex)}
                  className="text-[11px] text-textmute hover:text-danger transition-colors flex items-center justify-center h-6 w-6 rounded-md hover:bg-danger/5 shrink-0"
                >
                  <X size={15} />
                </button>
              </SimpleTooltip>
            )}
          </div>
        </header>

        <TablePreview stateId={cell.stateId} />
      </div>

      <CellActionArea cellId={cell.id} stateId={cell.stateId} cellIndex={cellIndex} />
    </div>
  );
}
