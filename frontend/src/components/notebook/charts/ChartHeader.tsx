import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Label } from "@/components/ui/Label";
import { BarChart3, Download, X } from "lucide-react";
import { LineageTrail } from "@/components/ui/LineageTrail";

export interface ChartHeaderProps {
  lineage: string[];
  filtering: boolean;
  filterHint: string | null;
  onExportPng: () => void;
  onTruncate: () => void;
}

export function ChartHeader({
  lineage,
  filtering,
  filterHint,
  onExportPng,
  onTruncate,
}: ChartHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-panel2 border-b border-border h-13">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Label
          variant="accent"
          size="sm"
          tracking="wider"
          className="shrink-0 flex items-center gap-1.5"
        >
          <BarChart3 size={14} /> Chart
        </Label>
        <div className="w-px h-3 bg-border shrink-0" />
        <LineageTrail lineage={lineage} />
      </div>
      <div className="flex items-center gap-3 ml-auto shrink-0">
        {filtering && (
          <span className="text-[11px] text-textmute animate-pulse whitespace-nowrap">
            Filtering…
          </span>
        )}
        {filterHint && !filtering && (
          <span className="text-[11px] text-textdim whitespace-nowrap">{filterHint}</span>
        )}
        <SimpleTooltip content="Export as PNG">
          <button
            onClick={onExportPng}
            className="text-[11px] text-textmute hover:text-text transition-colors flex items-center gap-1 h-6 px-1.5 whitespace-nowrap"
          >
            <Download size={12} /> PNG
          </button>
        </SimpleTooltip>
        <SimpleTooltip content="Delete this cell and all cells below">
          <button
            onClick={onTruncate}
            className="text-[11px] text-textmute hover:text-danger transition-colors flex items-center justify-center h-6 w-6 rounded-md hover:bg-danger/5 shrink-0"
          >
            <X size={15} />
          </button>
        </SimpleTooltip>
      </div>
    </header>
  );
}
