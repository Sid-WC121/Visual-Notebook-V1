import { useCallback, useEffect, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useHistory } from "@/hooks/api/useHistory";
import { useSession } from "@/hooks/api/useSession";
import { ErrorToast } from "@/components/ui/ErrorToast";
import { Header } from "@/components/layout/Header";
import { NotebookPage } from "@/components/notebook/NotebookPage";
import { UploadPanel } from "@/components/notebook/data/UploadPanel";
import { HistoryPanel } from "@/components/notebook/HistoryPanel";
import { useNotebookStore } from "@/store/notebook";
import { useUIStore } from "@/store/ui";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useNotebookInitialization } from "@/hooks/useNotebookInitialization";
import { Badge } from "@/components/ui/Badge";
import { ChevronDown } from "lucide-react";

export default function App() {
  const { data: session } = useSession();
  const cells = useNotebookStore((s) => s.cells);
  const { historyPanelOpen } = useUIStore();

  // Callback ref: fires exactly when the <main> element mounts/unmounts
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  const mainRef = useCallback((el: HTMLElement | null) => setMainEl(el), []);

  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const { dragChip, onDragStart, onDragEnd } = useDragAndDrop();
  const { data: history } = useHistory(!!session?.has_data);

  useNotebookInitialization(session, history);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /** Scroll the main container to bring a specific cell into view. */
  const scrollToCell = useCallback((cellId: string) => {
    const el = document.getElementById(`cell-${cellId}`);
    if (!el || !mainEl) return;
    const containerTop = mainEl.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const offset = elTop - containerTop - 24;
    mainEl.scrollBy({ top: offset, behavior: "smooth" });
  }, [mainEl]);

  // Attach scroll/resize watchers as soon as mainEl is available
  useEffect(() => {
    if (!mainEl) return;
    const check = () => {
      setShowScrollBtn(mainEl.scrollHeight - mainEl.scrollTop - mainEl.clientHeight > 120);
    };
    check();
    mainEl.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(mainEl);
    return () => { mainEl.removeEventListener("scroll", check); ro.disconnect(); };
  }, [mainEl]);

  const scrollToBottom = useCallback(() => {
    mainEl?.scrollTo({ top: mainEl.scrollHeight, behavior: "smooth" });
  }, [mainEl]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-textmute">Connecting…</div>
    );
  }

  if (!session.has_data) {
    return (
      <div className="min-h-screen">
        <Header />
        <UploadPanel />
      </div>
    );
  }

  const rootCell = cells.find((c) => c.type === "table");
  const totalRows = rootCell?.type === "table" ? rootCell.rowCount : undefined;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="h-screen flex flex-col bg-bg">
        <Header totalRows={totalRows} />
        <ErrorToast />

        {/* Body: notebook + optional right-side history panel */}
        <div className="flex-1 flex overflow-hidden">
          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            <NotebookPage />

            {/* Floating scroll-to-bottom button — inside main, not overlapping history panel */}
            {showScrollBtn && (
              <button
                onClick={scrollToBottom}
                style={{
                  position: "fixed",
                  bottom: "24px",
                  right: historyPanelOpen ? "344px" : "24px",
                  animation: "fadeIn 0.2s ease-out",
                  transition: "right 0.18s ease",
                }}
                className="z-50 w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white shadow-pop hover:bg-accent/90 active:scale-95"
                title="Scroll to new cell"
              >
                <ChevronDown size={18} />
              </button>
            )}
          </main>

          {/* Collapsible history graph sidebar */}
          {historyPanelOpen && (
          <div
              className="w-80 shrink-0 overflow-hidden border-l border-border"
              style={{ animation: "slideInRight 0.18s ease-out" }}
            >
              <HistoryPanel onNavigate={scrollToCell} />
            </div>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragChip && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent bg-panel shadow-card text-[12px] text-text font-mono opacity-90 pointer-events-none select-none">
            <Badge variant="accent" className="font-bold border-none bg-transparent px-0">
              {dragChip.colType[0].toUpperCase()}
            </Badge>
            {dragChip.column}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
