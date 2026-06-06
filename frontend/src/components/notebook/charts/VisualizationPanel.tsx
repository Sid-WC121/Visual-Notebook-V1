import { CHART_TYPES } from "@/constants/charts";
import { Button, ButtonSpinner } from "@/components/ui/Button";
import { InlineChip } from "@/components/ui/InlineChip";
import { Slot } from "@/components/ui/Slot";
import { Label } from "@/components/ui/Label";
import { useVisualizationPanel, TYPE_ORDER } from "../../../hooks/useVisualizationPanel";

export interface VisualizationPanelProps {
  cellId: string;
  stateId: string;
  cellIndex: number;
  onClose: () => void;
}

export function VisualizationPanel({
  cellId,
  stateId,
  cellIndex,
  onClose,
}: VisualizationPanelProps) {
  const {
    chartTypeId,
    setChartTypeId,
    extras,
    setExtra,
    isCascading,
    cascadeError,
    active,
    allFilled,
    onGenerate,
    makeAssignHandler,
    groupedColumns,
  } = useVisualizationPanel(cellId, stateId, cellIndex, onClose);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {CHART_TYPES.map((c) => (
            <Button
              key={c.id}
              onClick={() => setChartTypeId(c.id)}
              variant={chartTypeId === c.id ? "primary" : "secondary"}
              size="sm"
              className="rounded-full"
            >
              {c.icon}
              {c.label}
            </Button>
          ))}
        </div>
        {active.description && (
          <div className="text-[12px] text-textmute italic ml-1">
            {active.description}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <div className="shrink-0 w-45">
          <Label variant="mute" className="mb-2">
            Columns
          </Label>
          <div className="flex flex-col gap-1">
            {TYPE_ORDER.map((type) => {
              const cols = groupedColumns.get(type) ?? [];
              if (cols.length === 0) return null;
              return cols.map((col) => (
                <InlineChip
                  key={col.name}
                  column={col}
                  cellId={cellId}
                  onAssign={makeAssignHandler(col)}
                />
              ));
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {active.slots.map((s) => (
              <Slot key={s.name} cellId={cellId} slot={s} />
            ))}
          </div>

          {active.extras.length > 0 && (
            <div className="flex gap-2 items-end flex-wrap">
              {active.extras.map((e) => (
                <div key={e.name} className="flex flex-col gap-1">
                  <Label className="mb-1">{e.label}</Label>
                  <input
                    type="number"
                    value={(extras[e.name] as number) ?? e.default}
                    min={e.min}
                    max={e.max}
                    step={e.step ?? 1}
                    onChange={(ev) => setExtra(e.name, Number(ev.target.value))}
                    className="bg-panel text-text border border-border rounded text-[12px] px-2 py-1 w-20 focus:outline-hidden focus:border-accent focus:shadow-glow"
                  />
                </div>
              ))}
            </div>
          )}

          {cascadeError ? <p className="text-[11px] text-danger">{cascadeError}</p> : null}

          <Button
            onClick={onGenerate}
            disabled={!allFilled || isCascading}
            variant={allFilled ? "primary" : "secondary"}
            className="self-start"
          >
            {isCascading ? (
              <>
                <ButtonSpinner /> Generating…
              </>
            ) : (
              "Generate"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
