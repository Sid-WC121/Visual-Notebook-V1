import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadFile } from "@/services/api";
import { K } from "@/constants/keys";

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadFile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.session });
      qc.invalidateQueries({ queryKey: K.history });
    },
  });
}
