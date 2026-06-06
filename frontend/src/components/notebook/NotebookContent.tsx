import { CellWrapper } from "@/components/notebook/cells/CellWrapper";
import type { CellData } from "@/types/notebook";

export interface NotebookContentProps {
  cells: CellData[];
}

export function NotebookContent({ cells }: NotebookContentProps) {
  return (
    <div className="flex flex-col gap-6 p-4 max-w-5xl mx-auto pb-24">
      {cells.map((cell, index) => (
        <CellWrapper key={cell.id} cell={cell} index={index} total={cells.length} />
      ))}
    </div>
  );
}
