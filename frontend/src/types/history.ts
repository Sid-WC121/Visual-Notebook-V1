export interface StateNode {
  id: string;
  description: string;
  count: number;
  parent_id: string | null;
  is_current: boolean;
}

export interface HistoryResponse {
  current_id: string;
  lineage_ids: string[];
  states: StateNode[];
}
