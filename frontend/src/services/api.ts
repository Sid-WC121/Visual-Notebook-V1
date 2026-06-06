import axios from "axios";
import type { ExecuteResponse } from "@/types/execution";
import type { ColumnStats, PreviewResponse } from "@/types/data";
import type { HistoryResponse } from "@/types/history";
import type { OperationsCatalog } from "@/types/operations";
import type { SchemaResponse } from "@/types/schema";
import type { SessionInfo, UploadResponse } from "@/types/session";
import type { CellData } from "@/types/notebook";

export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 30_000,
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") {
      err.message = detail;
    }
    return Promise.reject(err);
  },
);

export async function branchOp(
  stateId: string,
  opId: string,
  params: Record<string, unknown>,
): Promise<ExecuteResponse> {
  const { data } = await http.post<ExecuteResponse>("/branch", {
    state_id: stateId,
    op_id: opId,
    params,
  });
  return data;
}

export async function executeFromState(
  opId: string,
  params: Record<string, unknown>,
  fromStateId: string,
): Promise<ExecuteResponse> {
  const { data } = await http.post<ExecuteResponse>("/execute", {
    op_id: opId,
    params,
    from_state_id: fromStateId,
  });
  return data;
}

export async function fetchColumnStats(column: string, stateId?: string): Promise<ColumnStats> {
  const { data } = await http.get<ColumnStats>("/column-stats", {
    params: { column, ...(stateId ? { state_id: stateId } : {}) },
  });
  return data;
}

export async function fetchHistory(): Promise<HistoryResponse> {
  const { data } = await http.get<HistoryResponse>("/history");
  return data;
}

export async function fetchOperations(): Promise<OperationsCatalog> {
  const { data } = await http.get<OperationsCatalog>("/operations");
  return data;
}

export async function fetchPreview(stateId: string, n = 50, offset = 0): Promise<PreviewResponse> {
  const { data } = await http.get<PreviewResponse>("/preview", {
    params: { n, offset, state_id: stateId },
  });
  return data;
}

export async function resetSession(): Promise<void> {
  await http.post("/reset");
}

export async function fetchSchema(stateId?: string): Promise<SchemaResponse> {
  const { data } = await http.get<SchemaResponse>("/schema", {
    params: stateId ? { state_id: stateId } : {},
  });
  return data;
}

export async function fetchSession(): Promise<SessionInfo> {
  const { data } = await http.get<SessionInfo>("/session");
  return data;
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await http.post<UploadResponse>("/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

async function rethrowBlobError(err: unknown): Promise<never> {
  if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
    const blob = err.response.data;
    if (blob.type === "application/json") {
      const text = await blob.text();
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") {
        throw new Error(parsed.detail);
      }
    }
  }
  throw err;
}

export async function exportNotebook(cells: CellData[]): Promise<Blob> {
  try {
    const { data } = await http.post("/export-notebook", { cells }, { responseType: "blob" });
    return data;
  } catch (err: unknown) {
    return rethrowBlobError(err);
  }
}

export async function exportAllCSVs(stateIds: string[]): Promise<Blob> {
  try {
    const { data } = await http.post(
      "/export-all",
      { state_ids: stateIds },
      { responseType: "blob" },
    );
    return data;
  } catch (err: unknown) {
    return rethrowBlobError(err);
  }
}

export async function importNotebook(file: File): Promise<{
  cells: CellData[];
  dataset_name: string;
  rows: number;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await http.post("/import-notebook", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
