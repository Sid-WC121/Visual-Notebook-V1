import { useCallback, useRef, useState } from "react";
import { useGenericUpload } from "@/hooks/api/useNotebookIO";

export function useFileDrop() {
  const upload = useGenericUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onSelect = useCallback(
    (file: File | null) => {
      if (!file) return;
      upload.mutate(file);
    },
    [upload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onSelect(f);
    },
    [onSelect],
  );

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  return {
    upload,
    inputRef,
    isDragging,
    onSelect,
    onDrop,
    onDragEnter,
    onDragOver,
    onDragLeave,
  };
}
