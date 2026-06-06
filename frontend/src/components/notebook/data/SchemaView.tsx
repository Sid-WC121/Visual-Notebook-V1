import clsx from "clsx";
import { TYPE_BORDER, TYPE_DOT } from "@/constants/ui";
import type { ViewPayload } from "@/types/execution";

export function SchemaView({ payload }: { payload: Extract<ViewPayload, { kind: "schema" }> }) {
  const counts = payload.columns.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  const summary = (
    [
      { kind: "numeric", label: "numeric" },
      { kind: "categorical", label: "categorical" },
      { kind: "temporal", label: "temporal" },
      { kind: "boolean", label: "boolean" },
      { kind: "other", label: "other" },
    ] as const
  ).filter((s) => counts[s.kind] > 0);

  return (
    <section className="bg-panel border border-border rounded-lg m-2 p-4 shadow-card">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-text">
          <span className="w-2 h-2 rounded-xs bg-accent" />
          Schema
          <span className="text-[12px] text-textmute font-normal font-mono">
            {payload.columns.length} column{payload.columns.length === 1 ? "" : "s"}
          </span>
        </h3>
        <div className="flex gap-1.5 flex-wrap">
          {summary.map((s) => (
            <span
              key={s.kind}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-panel2 border border-border text-[11px] text-textd"
            >
              <span className={clsx("w-1.5 h-1.5 rounded-full", TYPE_DOT[s.kind])} />
              {counts[s.kind]} {s.label}
            </span>
          ))}
        </div>
      </header>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
      >
        {payload.columns.map((c) => (
          <div
            key={c.name}
            className={clsx(
              "bg-panel border border-border border-l-[3px] rounded-md px-3 py-2.5",
              "transition-colors hover:bg-panel2 hover:border-border2",
              TYPE_BORDER[c.type] ?? "border-l-slate-300",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-mono text-[13px] text-text font-medium truncate">{c.name}</span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 whitespace-nowrap shrink-0">
                {c.dtype}
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap font-mono text-[10px]">
              {c.min !== undefined && c.max !== undefined && c.min !== "" && (
                <span className="px-1.5 py-0.5 bg-panel2 border border-border rounded-sm text-textdim">
                  {c.min} → {c.max}
                </span>
              )}
              {c.nulls !== undefined && c.nulls > 0 ? (
                <span className="px-1.5 py-0.5 bg-danger/5 border border-danger/20 rounded-sm text-danger">
                  {c.nulls.toLocaleString()} null{c.nulls === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 bg-success/5 border border-success/20 rounded-sm text-success">
                  complete
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
