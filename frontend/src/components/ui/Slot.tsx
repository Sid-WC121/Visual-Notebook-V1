import { useDroppable } from "@dnd-kit/core";
import clsx from "clsx";
import { X, ArrowDown } from "lucide-react";
import { useVizStore } from "@/store/viz";
import type { ChartSlot } from "@/types/charts";

export interface SlotProps {
  cellId: string;
  slot: ChartSlot;
}

export function Slot({ cellId, slot }: SlotProps) {
  const slots = useVizStore((s) => s.slots);
  const clearSlot = useVizStore((s) => s.clearSlot);
  const vizCellId = useVizStore((s) => s.vizCellId);

  const { setNodeRef, isOver, active } = useDroppable({
    id: `vp-slot:${cellId}:${slot.name}`,
    data: { kind: "vp-slot", cellId, slotName: slot.name, accepts: slot.accepts },
  });

  const draggedType = (active?.data.current as { type?: string } | undefined)?.type;
  const incompatible =
    isOver && !!draggedType && slot.accepts !== "any" && draggedType !== slot.accepts;

  const filled = vizCellId === cellId ? slots[slot.name] : undefined;

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "flex-1 min-w-35 rounded-lg border-2 p-3 transition-all duration-200",
        filled
          ? "bg-panel2 border-solid border-border2 shadow-xs"
          : "bg-panel border-dashed border-border/60 hover:border-border2",
        isOver && !incompatible && "border-accent bg-accent50 scale-[1.02]",
        incompatible && "border-danger bg-red-50",
      )}
    >
      <div className="text-[10px] uppercase tracking-[1px] text-textmute font-bold mb-2 flex items-center justify-between">
        {slot.label}
        {slot.accepts !== "any" ? (
          <span className="text-[9px] font-normal opacity-60">({slot.accepts})</span>
        ) : null}
      </div>
      {filled ? (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] text-text font-mono bg-panel border border-border shadow-xs animate-in fade-in zoom-in duration-200">
          {filled.column}
          <button
            onClick={() => clearSlot(slot.name)}
            className="inline-flex items-center justify-center w-4 h-4 ml-0.5 rounded-full hover:bg-panel3 text-textmute hover:text-danger transition-colors"
            aria-label="clear"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-2 text-textmute/40">
          <ArrowDown size={18} className="mb-1" />
          <div className="text-[10px] italic">{incompatible ? "wrong type" : "Drop column"}</div>
        </div>
      )}
    </div>
  );
}
