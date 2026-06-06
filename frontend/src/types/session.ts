export interface SessionInfo {
  session_id: string;
  has_data: boolean;
  dataset_name: string | null;
  last_error: string | null;
}

export interface UploadResponse {
  session_id: string;
  dataset_name: string;
  rows: number;
}
