import { useQuery } from "@tanstack/react-query";
import { fetchPreview } from "@/services/api";
import { K } from "@/constants/keys";

export function usePreview(stateId: string, n = 50, offset = 0) {
  return useQuery({
    queryKey: K.preview(stateId, n, offset),
    enabled: !!stateId,
    queryFn: () => fetchPreview(stateId, n, offset),
    placeholderData: (prev) => prev,
  });
}
