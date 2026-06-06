import { ChartCellView } from "@/components/notebook/cells/ChartCellView";
import { TableCellView } from "@/components/notebook/cells/TableCellView";
import { MarkdownCell } from "@/components/notebook/cells/MarkdownCell";
import type { CellData } from "@/types/notebook";

export interface CellWrapperProps {
  cell: CellData;
  index: number;
  total: number;
}

export function CellWrapper({ cell, index }: CellWrapperProps) {
  return (
    <div id={`cell-${cell.id}`}>
      {cell.type === "table" && (
        <TableCellView cell={cell} cellIndex={index} isRoot={index === 0} />
      )}
      {cell.type === "chart" && <ChartCellView cell={cell} cellIndex={index} />}
      {cell.type === "markdown" && <MarkdownCell cell={cell} />}
    </div>
  );
}
