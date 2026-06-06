import { useMutation, useQueryClient } from "@tanstack/react-query";
import { exportNotebook, importNotebook, uploadFile } from "@/services/api";
import { useNotebookStore } from "@/store/notebook";
import { useErrorStore } from "@/store/error";
import { K } from "@/constants/keys";
import type { SessionInfo } from "@/types/session";
import type { CellData } from "@/types/notebook";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function useNotebookExport() {
  const setError = useErrorStore((s) => s.setError);
  return useMutation({
    mutationFn: (cells: CellData[]) => exportNotebook(cells),
    onSuccess: (blob, cells) => {
      if (blob.size === 0) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;

      const firstCell = cells[0];
      const baseName = firstCell?.type === "table" ? firstCell.description : "notebook";
      const cleanBase = baseName
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9\s_-]/g, "")
        .replace(/[\s_-]+/g, "_")
        .trim();

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `${cleanBase || "notebook"}_${timestamp}.nb.zip`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to export notebook"));
    },
  });
}

export function useBatchExportCSV() {
  const setError = useErrorStore((s) => s.setError);
  return useMutation({
    mutationFn: (stateIds: string[]) =>
      import("@/services/api").then((api) => api.exportAllCSVs(stateIds)),
    onSuccess: (blob) => {
      if (blob.size === 0) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `all_tables_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to export CSVs"));
    },
  });
}

export function useNotebookImport() {
  const qc = useQueryClient();
  const restoreNotebook = useNotebookStore((s) => s.restoreNotebook);
  const setError = useErrorStore((s) => s.setError);

  return useMutation({
    mutationFn: (file: File) => importNotebook(file),
    onSuccess: (data) => {
      qc.setQueryData<SessionInfo | undefined>(K.session, (session) => ({
        session_id: session?.session_id ?? "",
        has_data: true,
        dataset_name: data.dataset_name,
        last_error: null,
      }));
      qc.removeQueries({ queryKey: K.history });
      restoreNotebook(data.cells);
      qc.invalidateQueries({ queryKey: K.session });
      qc.invalidateQueries({ queryKey: K.history });
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, "Failed to import notebook"));
    },
  });
}

export function useGenericUpload() {
  const upload = useMutation({ mutationFn: uploadFile });
  const importNb = useNotebookImport();
  const qc = useQueryClient();
  const setError = useErrorStore((s) => s.setError);

  const handleFile = async (file: File) => {
    try {
      if (file.name.endsWith(".nb.zip")) {
        await importNb.mutateAsync(file);
      } else {
        await upload.mutateAsync(file);
        qc.invalidateQueries({ queryKey: K.session });
        qc.invalidateQueries({ queryKey: K.history });
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Upload failed"));
    }
  };

  return {
    mutate: handleFile,
    isPending: upload.isPending || importNb.isPending,
    isError: upload.isError || importNb.isError,
    error: upload.error || importNb.error,
  };
}
