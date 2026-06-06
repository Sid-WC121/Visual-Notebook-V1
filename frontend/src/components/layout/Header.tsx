import { useReset } from "@/hooks/api/useReset";
import { useSession } from "@/hooks/api/useSession";
import { formatNumber } from "@/utils/format";
import { useNotebookStore } from "@/store/notebook";
import { useUIStore } from "@/store/ui";
import { Download, GitBranch, Upload, Save } from "lucide-react";
import { Button, ButtonProgress } from "@/components/ui/Button";
import { useNotebookExport, useBatchExportCSV } from "@/hooks/api/useNotebookIO";

export interface HeaderProps {
  totalRows?: number;
}

export function Header({ totalRows }: HeaderProps) {
  const { data: session } = useSession();
  const reset = useReset();
  const hasData = !!session?.has_data;
  const isCascading = useNotebookStore((s) => s.isCascading);
  const cells = useNotebookStore((s) => s.cells);
  const exporter = useNotebookExport();
  const batchCSV = useBatchExportCSV();
  const { historyPanelOpen, toggleHistoryPanel } = useUIStore();

  const onExport = () => {
    const tableStateIds = cells
      .flatMap((c) => (c.type === "table" ? [c.stateId] : []))
      .filter(Boolean);
    if (tableStateIds.length > 0) {
      batchCSV.mutate(tableStateIds);
    }
  };

  const onSaveNotebook = () => {
    exporter.mutate(cells);
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-4 px-6 py-3.5 bg-panel/80 backdrop-blur-md border-b border-border">
      {isCascading && (
        <div className="absolute -bottom-px left-0 w-full h-0.5 overflow-hidden">
          <div className="h-full bg-accent animate-progress-ind"></div>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-xs bg-accent" />
        <h1 className="text-[15px] font-semibold tracking-tight">Visual Notebook</h1>
      </div>

      <div className="flex items-center gap-3 font-mono text-[12px] text-textdim">
        {hasData ? (
          <>
            <span className="text-text font-semibold">{session?.dataset_name}</span>
            {totalRows !== undefined ? <span>· {formatNumber(totalRows)} rows</span> : null}
            <Button
              onClick={onSaveNotebook}
              className="ml-3"
              variant="primary"
              disabled={exporter.isPending}
            >
              {exporter.isPending ? <ButtonProgress /> : null}
              <Save size={14} />
              Save Notebook
            </Button>
            <Button onClick={onExport} variant="secondary" disabled={batchCSV.isPending}>
              {batchCSV.isPending ? <ButtonProgress /> : null}
              <Download size={14} />
              Export CSV (All)
            </Button>
            <Button
              onClick={toggleHistoryPanel}
              variant={historyPanelOpen ? "primary" : "secondary"}
              title="Toggle history graph"
            >
              <GitBranch size={14} />
              History
            </Button>
            <Button onClick={() => reset.mutate()} variant="secondary">
              <Upload size={14} />
              Change file
            </Button>
          </>
        ) : (
          <span>no dataset loaded</span>
        )}
      </div>
    </header>
  );
}
