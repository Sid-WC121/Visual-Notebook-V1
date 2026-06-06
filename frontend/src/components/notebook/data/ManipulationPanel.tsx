import { useState } from "react";
import { useOperations } from "@/hooks/api/useOperations";
import type { OperationDef } from "@/types/operations";
import { useNotebookStore } from "@/store/notebook";
import { useUIStore } from "@/store/ui";
import { OpForm } from "@/components/notebook/data/OpForm";
import { DATA_OP_ICONS } from "@/constants/operations";
import { Package, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

export interface ManipulationPanelProps {
  stateId: string;
  cellIndex: number;
  onClose: () => void;
}

const CASCADE_TOOLTIP = (
  <span>
    <b>ON</b> — rebases all cells below when you apply an operation here.<br />
    <b>OFF</b> — inserts a new branch table; downstream cells stay unchanged
    (useful for comparing transforms side-by-side).
  </span>
);

export function ManipulationPanel({ stateId, cellIndex, onClose }: ManipulationPanelProps) {
  const [selectedOp, setSelectedOp] = useState<OperationDef | null>(null);
  const { data: ops } = useOperations();
  const applyChainAndCascade = useNotebookStore((s) => s.applyChainAndCascade);
  const applyWithoutCascade = useNotebookStore((s) => s.applyWithoutCascade);
  const isCascading = useNotebookStore((s) => s.isCascading);
  const cascadeError = useNotebookStore((s) => s.cascadeError);
  const { autoCascade, toggleAutoCascade } = useUIStore();

  const dataOps = (ops?.operations ?? []).filter((o) => o.kind === "data" && o.menu !== "View");

  if (selectedOp) {
    return (
      <OpForm
        op={selectedOp}
        stateId={stateId}
        onBack={() => setSelectedOp(null)}
        onApply={async (values) => {
          const step = { op_id: selectedOp.id, params: values };
          if (autoCascade) {
            await applyChainAndCascade(cellIndex, [step]);
          } else {
            await applyWithoutCascade(cellIndex, [step]);
          }
          if (!useNotebookStore.getState().cascadeError) onClose();
        }}
        isPending={isCascading}
        error={cascadeError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Auto-cascade toggle */}
      <div className="flex items-center justify-between px-0.5 mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-textdim font-medium">Auto-cascade</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle size={12} className="text-textmute cursor-help" />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-52 whitespace-normal leading-relaxed text-[11px] z-[200]"
            >
              {CASCADE_TOOLTIP}
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Toggle switch */}
        <button
          onClick={toggleAutoCascade}
          className={`relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors focus:outline-none ${
            autoCascade ? "bg-accent" : "bg-border2"
          }`}
          aria-pressed={autoCascade}
          title={autoCascade ? "Auto-cascade ON — click to disable" : "Auto-cascade OFF — click to enable"}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
              autoCascade ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <p className="text-[11px] text-textmute">Choose an operation to apply:</p>

      <div className="grid grid-cols-2 gap-1.5">
        {dataOps.map((op) => (
          <button
            key={op.id}
            onClick={() => setSelectedOp(op)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-panel text-left text-[12px] text-text font-medium hover:bg-panel2 hover:border-border2 transition-colors"
          >
            <span className="text-accent w-6 shrink-0 flex justify-center">
              {DATA_OP_ICONS[op.id] ?? <Package size={14} />}
            </span>
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}
