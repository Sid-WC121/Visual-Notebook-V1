import { useNotebookStore } from "@/store/notebook";
import { NotebookContent } from "@/components/notebook/NotebookContent";

export function NotebookPage() {
  const cells = useNotebookStore((s) => s.cells);

  return <NotebookContent cells={cells} />;
}
