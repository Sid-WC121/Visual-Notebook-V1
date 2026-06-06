import { useTablePreview } from "../../../hooks/useTablePreview";
import { TablePreviewHeader } from "@/components/notebook/data/TablePreviewHeader";
import { TablePreviewGrid } from "@/components/notebook/data/TablePreviewGrid";

export interface TablePreviewProps {
  stateId: string;
}

export function TablePreview({ stateId }: TablePreviewProps) {
  const {
    preview,
    isFetching,
    typeByCol,
    total,
    start,
    end,
    hasPrev,
    hasNext,
    handleFirstPage,
    handlePrevPage,
    handleNextPage,
    handleLastPage,
  } = useTablePreview(stateId);

  if (!preview) {
    return (
      <section className="bg-panel p-12 text-center text-textmute border-t border-border">
        Loading preview…
      </section>
    );
  }

  return (
    <section className="bg-panel overflow-hidden">
      <TablePreviewHeader
        start={start}
        end={end}
        total={total}
        columnCount={preview.columns.length}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onFirstPage={handleFirstPage}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onLastPage={handleLastPage}
      />
      <TablePreviewGrid preview={preview} typeByCol={typeByCol} isFetching={isFetching} />
    </section>
  );
}
