import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { SimpleTooltip } from "@/components/ui/Tooltip";

export interface TablePreviewHeaderProps {
  start: number;
  end: number;
  total: number;
  columnCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  onFirstPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
}

export function TablePreviewHeader({
  start,
  end,
  total,
  columnCount,
  hasPrev,
  hasNext,
  onFirstPage,
  onPrevPage,
  onNextPage,
  onLastPage,
}: TablePreviewHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-panel2 border-t border-b border-border flex-wrap">
      <Label variant="mute" tracking="wider" size="sm">
        Preview
      </Label>
      <div className="flex items-center gap-3 ml-auto">
        <div className="font-mono text-[11px] text-textdim">
          rows <b className="text-text font-semibold">{(start + 1).toLocaleString()}</b>
          {"–"}
          <b className="text-text font-semibold">{end.toLocaleString()}</b>
          {" of "}
          <b className="text-text font-semibold">{total.toLocaleString()}</b>
          {" · "}
          <b className="text-text font-semibold">{columnCount}</b> cols
        </div>

        <div className="flex items-center gap-0.5">
          <SimpleTooltip content="First page">
            <Button
              variant="pagination"
              size="square"
              onClick={onFirstPage}
              disabled={!hasPrev}
              aria-label="First"
            >
              <ChevronsLeft size={14} />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content="Previous page">
            <Button
              variant="pagination"
              size="square"
              onClick={onPrevPage}
              disabled={!hasPrev}
              aria-label="Previous"
            >
              <ChevronLeft size={14} />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content="Next page">
            <Button
              variant="pagination"
              size="square"
              onClick={onNextPage}
              disabled={!hasNext}
              aria-label="Next"
            >
              <ChevronRight size={14} />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content="Last page">
            <Button
              variant="pagination"
              size="square"
              onClick={onLastPage}
              disabled={!hasNext}
              aria-label="Last"
            >
              <ChevronsRight size={14} />
            </Button>
          </SimpleTooltip>
        </div>
      </div>
    </header>
  );
}
