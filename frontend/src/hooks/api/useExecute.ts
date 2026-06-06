import { useMutation } from "@tanstack/react-query";
import { branchOp, executeFromState } from "@/services/api";

export function useExecuteFrom() {
  return useMutation({
    mutationFn: (req: { op_id: string; params: Record<string, unknown>; from_state_id: string }) =>
      executeFromState(req.op_id, req.params, req.from_state_id),
  });
}

export function useBranchFrom() {
  return useMutation({
    mutationFn: (req: { state_id: string; op_id: string; params: Record<string, unknown> }) =>
      branchOp(req.state_id, req.op_id, req.params),
  });
}
