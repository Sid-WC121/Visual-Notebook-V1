import { useQuery } from "@tanstack/react-query";
import { fetchHistory } from "@/services/api";
import { K } from "@/constants/keys";

export function useHistory(enabled: boolean) {
  return useQuery({
    queryKey: K.history,
    enabled,
    queryFn: fetchHistory,
  });
}
