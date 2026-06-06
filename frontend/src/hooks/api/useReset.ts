import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetSession } from "@/services/api";

export function useReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resetSession,
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}
