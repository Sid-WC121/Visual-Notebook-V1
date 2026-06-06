import { useState } from "react";
import { useVizStore } from "@/store/viz";
import { ManipulationPanel } from "@/components/notebook/data/ManipulationPanel";
import { VisualizationPanel } from "@/components/notebook/charts/VisualizationPanel";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { X, LayoutGrid, BarChart3 } from "lucide-react";

export interface CellActionAreaProps {
  cellId: string;
  stateId: string;
  cellIndex: number;
}

type PanelMode = "none" | "manipulation" | "visualization";

export function CellActionArea({ cellId, stateId, cellIndex }: CellActionAreaProps) {
  const [activePanel, setActivePanel] = useState<PanelMode>("none");
  const { openVizPanel, closeVizPanel } = useVizStore();

  const togglePanel = (mode: PanelMode) => {
    if (activePanel === mode) {
      handleClose();
    } else {
      setActivePanel(mode);
      if (mode === "visualization") openVizPanel(cellId);
      else closeVizPanel();
    }
  };

  const handleClose = () => {
    setActivePanel("none");
    closeVizPanel();
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => togglePanel("manipulation")}
          variant={activePanel === "manipulation" ? "primary" : "secondary"}
          className="rounded-lg"
        >
          <LayoutGrid size={14} /> Manipulation
        </Button>
        <Button
          onClick={() => togglePanel("visualization")}
          variant={activePanel === "visualization" ? "primary" : "secondary"}
          className="rounded-lg"
        >
          <BarChart3 size={14} /> Visualization
        </Button>
      </div>

      {activePanel !== "none" && (
        <div className="bg-panel border border-border rounded-lg p-4 shadow-card border-l-4 border-l-accent">
          <div className="flex items-center justify-between mb-3">
            <Label
              variant="accent"
              size="sm"
              tracking="wider"
              className="flex items-center gap-1.5"
            >
              {activePanel === "manipulation" ? (
                <>
                  <LayoutGrid size={14} /> Data Manipulation
                </>
              ) : (
                <>
                  <BarChart3 size={14} /> Visualization
                </>
              )}
            </Label>
            <Button variant="ghost" size="sm" onClick={handleClose} className="px-1">
              <X size={16} />
            </Button>
          </div>

          {activePanel === "manipulation" && (
            <ManipulationPanel stateId={stateId} cellIndex={cellIndex} onClose={handleClose} />
          )}
          {activePanel === "visualization" && (
            <VisualizationPanel
              cellId={cellId}
              stateId={stateId}
              cellIndex={cellIndex}
              onClose={handleClose}
            />
          )}
        </div>
      )}
    </div>
  );
}
