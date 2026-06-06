import clsx from "clsx";
import { useDraggable } from "@dnd-kit/core";
import { TYPE_BADGE_BG, TYPE_ICONS } from "@/constants/ui";
import type { SchemaColumn } from "@/types/schema";

export interface InlineChipProps {
  column: SchemaColumn;
  cellId: string;
  onAssign?: () => void;
}

export function InlineChip({ column, cellId, onAssign }: InlineChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vp-chip:${cellId}:${column.name}`,
    data: { kind: "column", column: column.name, type: column.type },
  });

  const Icon = TYPE_ICONS[column.type] || TYPE_ICONS.other;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onAssign}
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-1",
        "bg-panel border border-border rounded-sm text-[11px] text-text font-mono",
        "cursor-grab active:cursor-grabbing select-none",
        "hover:bg-panel2 hover:border-border2 transition-colors",
        isDragging && "opacity-40",
      )}
    >
      <span
        className={clsx(
          "inline-flex items-center justify-center w-4 h-4",
          "rounded-sm shrink-0",
          TYPE_BADGE_BG[column.type],
        )}
      >
        <Icon size={10} strokeWidth={3} />
      </span>
      {column.name}
    </div>
  );
}
