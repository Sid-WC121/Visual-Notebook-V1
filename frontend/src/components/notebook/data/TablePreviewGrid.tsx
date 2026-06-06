import clsx from "clsx";
import type { PreviewResponse } from "@/types/data";
import type { ColumnType } from "@/types/schema";
import { formatCellValue } from "@/utils/format";
import { TYPE_BADGE_BG, TYPE_ICONS } from "@/constants/ui";

export interface TablePreviewGridProps {
  preview: PreviewResponse;
  typeByCol: Map<string, string>;
  isFetching: boolean;
}

export function TablePreviewGrid({ preview, typeByCol, isFetching }: TablePreviewGridProps) {
  return (
    <div
      className={clsx(
        "max-h-100 overflow-auto bg-panel transition-opacity",
        isFetching && "opacity-70",
      )}
    >
      <table className="w-full border-separate border-spacing-0 font-mono text-[12px]">
        <thead className="sticky top-0 z-1">
          <tr>
            {preview.columns.map((name) => {
              const t = (typeByCol.get(name) ?? "other") as ColumnType;
              const Icon = TYPE_ICONS[t] || TYPE_ICONS.other;
              return (
                <th
                  key={name}
                  className="text-left px-3 py-2 bg-panel2 border-b border-border text-[11px] uppercase tracking-[0.6px] font-semibold text-textd whitespace-nowrap font-sans"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={clsx(
                        "inline-flex items-center justify-center w-4.5 h-4.5",
                        "rounded-sm shrink-0",
                        TYPE_BADGE_BG[t],
                      )}
                    >
                      <Icon size={10} strokeWidth={3} />
                    </span>
                    {name}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, ri) => (
            <tr
              key={ri}
              className={clsx(
                "transition-colors",
                ri % 2 === 1 && "bg-panel2",
                "hover:bg-accent50!",
              )}
            >
              {row.map((cell, ci) => (
                <td key={ci} className={cellClassForValue(cell, preview.columns[ci], typeByCol)}>
                  {renderCellValue(cell, preview.columns[ci], typeByCol)}
                </td>
              ))}
            </tr>
          ))}
          {preview.rows.length === 0 && (
            <tr>
              <td colSpan={preview.columns.length} className="px-3 py-12 text-center text-textmute">
                No rows to display.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function columnType(columnName: string, typeByCol: Map<string, string>) {
  return (typeByCol.get(columnName) ?? "other") as ColumnType;
}

function cellClassForValue(cell: unknown, columnName: string, typeByCol: Map<string, string>) {
  const base = "px-3 py-1.5 border-b border-border max-w-65 truncate";
  if (cell === null || cell === undefined) return `${base} text-textmute italic`;

  const t = columnType(columnName, typeByCol);
  if (t === "numeric") return `${base} text-text text-right`;
  if (t === "boolean") {
    const truthy = String(cell).toLowerCase() === "true" || cell === true;
    return `${base} ${truthy ? "text-emerald-700" : "text-pink-700"}`;
  }
  return `${base} text-text`;
}

function renderCellValue(cell: unknown, columnName: string, typeByCol: Map<string, string>) {
  if (cell === null || cell === undefined) return "null";

  const t = columnType(columnName, typeByCol);
  if (t === "boolean") return String(cell).toLowerCase();
  return formatCellValue(cell);
}
