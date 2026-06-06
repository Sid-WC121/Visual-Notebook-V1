import { MultiSelect } from "@/components/ui/MultiSelect";
import { Label } from "@/components/ui/Label";
import { INPUT_CLASSES } from "@/constants/ui";
import type { ParamSpec } from "@/types/operations";
import type { ColumnType } from "@/types/schema";

export interface FieldProps {
  spec: ParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  schema: { name: string; type: ColumnType }[];
  colStats?: { distinct_values?: unknown[] | null } | null;
  parentType?: ColumnType;
}

export function Field({ spec, value, onChange, schema, colStats, parentType }: FieldProps) {
  const label = <Label size="sm">{spec.label}</Label>;

  if (
    spec.kind === "column" ||
    spec.kind === "column_numeric" ||
    spec.kind === "column_categorical" ||
    spec.kind === "column_temporal" ||
    spec.kind === "column_numeric_optional" ||
    spec.kind === "column_categorical_optional"
  ) {
    const optional = spec.kind === "column_numeric_optional" || spec.kind === "column_categorical_optional";
    const filter = (t: ColumnType) => {
      if (spec.kind === "column") return true;
      if (spec.kind === "column_numeric" || spec.kind === "column_numeric_optional")
        return t === "numeric";
      if (spec.kind === "column_rangeable") return t === "numeric" || t === "temporal";
      if (spec.kind === "column_categorical" || spec.kind === "column_categorical_optional") return t === "categorical" || t === "boolean";
      if (spec.kind === "column_temporal") return t === "temporal";
      return true;
    };
    const opts = schema.filter((c) => filter(c.type));
    const val = (value as string) ?? "";

    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <select
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT_CLASSES} ${val === "" ? "text-textmute" : "text-text"}`}
        >
          {optional ? (
            <option value="">(None)</option>
          ) : (
            <option value="" disabled hidden>
              Select a column...
            </option>
          )}
          {opts.map((c) => (
            <option key={c.name} value={c.name} className="text-text">
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (spec.kind === "columns_multi") {
    return (
      <MultiSelect
        label={spec.label}
        options={schema.map((c) => c.name)}
        selected={(value as string[]) ?? []}
        onChange={onChange}
        placeholder="Select columns (empty = all)..."
      />
    );
  }

  if (spec.kind === "value_from_column") {
    const distincts = colStats?.distinct_values ?? [];
    const val = (value as string) ?? "";

    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <select
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT_CLASSES} ${val === "" ? "text-textmute" : "text-text"}`}
        >
          <option value="" disabled hidden>
            Select a value...
          </option>
          {distincts.map((v) => (
            <option key={String(v)} value={String(v)} className="text-text">
              {String(v)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (spec.kind === "multi_values_from_column") {
    const distincts = colStats?.distinct_values ?? [];
    return (
      <MultiSelect
        label={spec.label}
        options={distincts.map((v) => String(v))}
        selected={(value as string[]) ?? []}
        onChange={onChange}
        placeholder="Select values..."
      />
    );
  }

  if (spec.kind === "enum") {
    const val = (value as string) ?? "";
    const placeholder = `Select ${spec.label.toLowerCase()}...`;
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <select
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT_CLASSES} ${val === "" ? "text-textmute" : "text-text"}`}
        >
          <option value="" disabled hidden>
            {placeholder}
          </option>
          {(spec.options ?? []).map((o) => (
            <option key={o} value={o} className="text-text">
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (spec.kind === "number" || spec.kind === "int") {
    if (parentType === "temporal") {
      return (
        <div className="flex flex-col gap-1.5">
          {label}
          <input
            type="datetime-local"
            value={typeof value === "string" ? value.slice(0, 16) : ""}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT_CLASSES} text-text`}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <input
          type="number"
          step={spec.kind === "int" ? 1 : "any"}
          value={(value as number) ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${INPUT_CLASSES} text-text`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASSES} text-text`}
      />
    </div>
  );
}
