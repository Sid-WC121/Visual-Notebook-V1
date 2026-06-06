import { useQuery } from "@tanstack/react-query";
import { fetchColumnStats } from "@/services/api";
import { K } from "@/constants/keys";

export function useColumnStats(column: string | null, stateId?: string, enabled = true) {
  return useQuery({
    queryKey: K.colStats(column ?? "", stateId),
    enabled: !!column && enabled,
    queryFn: () => fetchColumnStats(column!, stateId),
    staleTime: 60_000,
  });
}
