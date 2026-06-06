import { useState, useMemo } from "react";
import { usePreview } from "@/hooks/api/usePreview";
import { useSchema } from "@/hooks/api/useSchema";

export const PAGE_SIZE = 50;

export function useTablePreview(stateId: string) {
  const [offset, setOffset] = useState(0);

  const { data: preview, isFetching } = usePreview(stateId, PAGE_SIZE, offset);
  const { data: schema } = useSchema(stateId);

  const typeByCol = useMemo(() => {
    return new Map((schema?.columns ?? []).map((c) => [c.name, c.type]));
  }, [schema?.columns]);

  const total = preview?.total ?? 0;
  const start = preview?.offset ?? 0;
  const end = (preview?.offset ?? 0) + (preview?.shown ?? 0);
  const hasPrev = offset > 0;
  const hasNext = end < total;
  const lastPageOffset = Math.max(0, Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE);

  const handleFirstPage = () => setOffset(0);
  const handlePrevPage = () => setOffset(Math.max(0, offset - PAGE_SIZE));
  const handleNextPage = () => setOffset(offset + PAGE_SIZE);
  const handleLastPage = () => setOffset(lastPageOffset);

  return {
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
  };
}
