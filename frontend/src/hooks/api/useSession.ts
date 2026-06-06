import { useQuery } from "@tanstack/react-query";
import { fetchSession } from "@/services/api";
import { K } from "@/constants/keys";

export function useSession() {
  return useQuery({
    queryKey: K.session,
    queryFn: fetchSession,
  });
}
