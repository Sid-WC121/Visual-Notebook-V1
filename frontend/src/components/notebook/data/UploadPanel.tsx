import clsx from "clsx";
import { useFileDrop } from "@/hooks/useFileDrop";
import { Badge } from "@/components/ui/Badge";
import { Upload } from "lucide-react";

export function UploadPanel() {
  const { upload, inputRef, isDragging, onSelect, onDrop, onDragEnter, onDragOver, onDragLeave } =
    useFileDrop();

  return (
    <div className="mx-auto max-w-170 mt-20 px-6">
      <div
        className={clsx(
          "relative flex flex-col items-center justify-center text-center",
          "rounded-2xl px-10 py-16 bg-panel",
          "border-2 border-dashed transition-colors duration-150 cursor-pointer select-none",
          isDragging ? "border-accent bg-accent50" : "border-border2 hover:border-accent",
        )}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 bg-accent50 text-accent border border-indigo-100">
          <Upload size={32} />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-text">
          {upload.isPending ? "Uploading…" : "Drop a file here"}
        </h2>
        <p className="text-sm text-textdim mb-5">or click anywhere in this area to browse</p>
        <div className="inline-flex gap-2 flex-wrap justify-center">
          {[".csv", ".tsv", ".parquet", ".nb.zip"].map((ext) => (
            <Badge key={ext} variant="muted">
              {ext}
            </Badge>
          ))}
        </div>

        {upload.isError && (
          <p className="mt-4 font-mono text-[12px] text-danger">
            {(upload.error as Error)?.message ?? "Upload failed"}
          </p>
        )}

        <p className="mt-7 flex items-center gap-2 text-[11px] text-textmute">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          All processing runs locally — no data leaves your machine.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.parquet,.nb.zip"
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
