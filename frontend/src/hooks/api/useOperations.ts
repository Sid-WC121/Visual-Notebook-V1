import { useQuery } from "@tanstack/react-query";
import { fetchOperations } from "@/services/api";
import { K } from "@/constants/keys";

export function useOperations() {
  return useQuery({
    queryKey: K.ops,
    queryFn: fetchOperations,
    staleTime: Infinity,
  });
}
