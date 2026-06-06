import { useQuery } from "@tanstack/react-query";
import { fetchSchema } from "@/services/api";
import { K } from "@/constants/keys";

export function useSchema(stateId?: string) {
  return useQuery({
    queryKey: K.schema(stateId),
    enabled: !!stateId,
    queryFn: () => fetchSchema(stateId),
    placeholderData: (prev) => prev,
  });
}
