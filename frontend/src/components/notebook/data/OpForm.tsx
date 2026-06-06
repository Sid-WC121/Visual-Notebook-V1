import { useSchema } from "@/hooks/api/useSchema";
import { useOpForm } from "@/hooks/useOpForm";
import type { OperationDef } from "@/types/operations";
import { Field } from "@/components/ui/Field";
import { Button, ButtonSpinner } from "@/components/ui/Button";
import { ChevronLeft } from "lucide-react";

export interface OpFormProps {
  op: OperationDef;
  stateId: string;
  onBack: () => void;
  onApply: (values: Record<string, unknown>) => Promise<void>;
  isPending: boolean;
  error: string | null;
}

export function OpForm({ op, stateId, onBack, onApply, isPending, error }: OpFormProps) {
  const { data: schema } = useSchema(stateId);
  const { values, setValues, isValid, colStats, columnParamName } = useOpForm(op, stateId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="px-1 -ml-1 text-textdim hover:text-text"
        >
          <ChevronLeft size={14} /> Back
        </Button>
        <h3 className="text-[15px] font-bold text-text ml-1">{op.label}</h3>
      </div>

      {op.params.length === 0 ? (
        <p className="text-textdim text-[13px]">No parameters required.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {op.params.map((p) => {
            const depColName = p.depends_on ? values[p.depends_on] : undefined;
            const depCol = schema?.columns.find((c) => c.name === depColName);
            return (
              <Field
                key={p.name}
                spec={p}
                value={values[p.name]}
                onChange={(v) => setValues((prev) => ({ ...prev, [p.name]: v }))}
                schema={schema?.columns ?? []}
                colStats={p.depends_on === columnParamName ? colStats.data : undefined}
                parentType={depCol?.type}
              />
            );
          })}
        </div>
      )}
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}

      <Button
        onClick={() => onApply(values)}
        disabled={!isValid || isPending}
        variant="primary"
        className="self-start"
      >
        {isPending ? (
          <>
            <ButtonSpinner /> Applying cascade…
          </>
        ) : (
          "Apply"
        )}
      </Button>
    </div>
  );
}
