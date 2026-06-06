import type { StateNode } from "@/types/history";

export interface GraphNode {
  id: string;
  description: string;
  count: number;
  is_current: boolean;
  parent_id: string | null;
  lane: number;
  row: number;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: number;
  rows: number;
}

export function buildGraphLayout(
  states: StateNode[],
  lineageIds: string[],
): GraphLayout {
  if (states.length === 0) return { nodes: [], edges: [], lanes: 1, rows: 0 };

  const lineageSet = new Set(lineageIds);

  const childrenOf = new Map<string, string[]>();
  for (const s of states) {
    if (s.parent_id != null) {
      if (!childrenOf.has(s.parent_id)) childrenOf.set(s.parent_id, []);
      childrenOf.get(s.parent_id)!.push(s.id);
    }
  }

  const root = states.find((s) => s.parent_id == null);
  if (!root) return { nodes: [], edges: [], lanes: 1, rows: 0 };

  const laneOf = new Map<string, number>();
  const rowOf = new Map<string, number>();
  let currentRow = 0;
  let nextBranchLane = 1; // each direct branch from lane 0 gets its own lane

  // DFS: branches appear right after their parent (keeps edges short).
  // Direct branches from lane 0 get unique lanes (1, 2, 3…) so they don't overlap.
  // Sub-branches (from lane > 0) stay on the same lane as their parent.
  function dfs(id: string, lane: number): void {
    laneOf.set(id, lane);
    rowOf.set(id, currentRow++);

    const children = childrenOf.get(id) ?? [];
    const mainChild = children.find((cid) => lineageSet.has(cid)) ?? null;
    const branchChildren = children.filter((cid) => cid !== mainChild);

    for (const bChild of branchChildren) {
      // Lane-0 branches each get a fresh unique lane; deeper branches stay put
      const childLane = lane === 0 ? nextBranchLane++ : lane;
      dfs(bChild, childLane);
    }

    if (mainChild) dfs(mainChild, lane);
  }

  dfs(root.id, 0);

  const stateMap = new Map(states.map((s) => [s.id, s]));
  const nodes: GraphNode[] = [];
  for (const [id, row] of rowOf.entries()) {
    const s = stateMap.get(id);
    if (!s) continue;
    nodes.push({
      id,
      description: s.description,
      count: s.count,
      is_current: s.is_current,
      parent_id: s.parent_id,
      lane: laneOf.get(id) ?? 0,
      row,
    });
  }
  nodes.sort((a, b) => a.row - b.row);

  const edges: GraphEdge[] = [];
  for (const n of nodes) {
    if (n.parent_id != null) {
      const parent = nodes.find((p) => p.id === n.parent_id);
      if (parent) {
        edges.push({
          fromId: parent.id,
          toId: n.id,
          fromLane: parent.lane,
          toLane: n.lane,
          fromRow: parent.row,
          toRow: n.row,
        });
      }
    }
  }

  const maxLane = Math.max(0, ...Array.from(laneOf.values()));
  return { nodes, edges, lanes: maxLane + 1, rows: nodes.length };
}
