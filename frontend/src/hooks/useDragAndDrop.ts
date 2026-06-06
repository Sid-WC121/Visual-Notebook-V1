import { useState } from "react";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { useVizStore } from "@/store/viz";
import { useErrorStore } from "@/store/error";

export function useDragAndDrop() {
  const setSlot = useVizStore((s) => s.setSlot);
  const setError = useErrorStore((s) => s.setError);
  const vizCellId = useVizStore((s) => s.vizCellId);
  const [dragChip, setDragChip] = useState<{ column: string; colType: string } | null>(null);

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { kind: string; column: string; type: string } | undefined;
    if (d?.kind === "column") setDragChip({ column: d.column, colType: d.type });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragChip(null);
    const dragged = e.active.data.current as
      | { kind: "column"; column: string; type: string }
      | undefined;
    const target = e.over?.data.current as
      | { kind: "vp-slot"; cellId: string; slotName: string; accepts: string }
      | undefined;

    if (!dragged || !target || target.kind !== "vp-slot") return;

    if (target.cellId !== vizCellId) return;

    if (target.accepts !== "any" && dragged.type !== target.accepts) {
      setError(
        `Incompatible type: ${dragged.column} is ${dragged.type}, but this slot expects ${target.accepts}.`,
      );
      return;
    }
    setSlot(target.slotName, dragged.column, dragged.type);
  };

  return { dragChip, onDragStart, onDragEnd };
}
