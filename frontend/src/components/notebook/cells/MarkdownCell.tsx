import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { marked } from "marked";
import { Pencil, Check, X } from "lucide-react";
import { useNotebookStore } from "@/store/notebook";
import type { MarkdownCellData } from "@/types/notebook";

// Configure marked for inline-safe output
marked.setOptions({ breaks: true, gfm: true });

interface MarkdownCellProps {
  cell: MarkdownCellData;
}

export function MarkdownCell({ cell }: MarkdownCellProps) {
  const updateMarkdownCell = useNotebookStore((s) => s.updateMarkdownCell);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cell.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(cell.content); }, [cell.content]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const save = useCallback(() => {
    updateMarkdownCell(cell.id, draft.trim() || cell.content);
    setEditing(false);
  }, [cell.id, cell.content, draft, updateMarkdownCell]);

  const cancel = useCallback(() => {
    setDraft(cell.content);
    setEditing(false);
  }, [cell.content]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); }
      if (e.key === "Escape") { cancel(); }
    },
    [save, cancel],
  );

  // Parse markdown with marked — returns HTML string
  const html = useMemo(() => marked.parse(cell.content) as string, [cell.content]);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 px-1 py-1">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.max(2, draft.split("\n").length + 1)}
          className="w-full resize-y rounded-lg border border-accent/50 bg-panel2 px-3 py-2 text-[13px] text-text font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
          placeholder="Markdown supported: **bold**, *italic*, # headings, `code`, - lists…"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-accent/90 transition-colors"
          >
            <Check size={12} /> Save
          </button>
          <button
            onClick={cancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-panel3 text-textmute text-[12px] hover:text-text border border-border transition-colors"
          >
            <X size={12} /> Cancel
          </button>
          <span className="text-[10.5px] text-textmute ml-1">Ctrl+Enter · Esc to cancel</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative rounded-lg px-3 py-1 hover:bg-panel2/50 transition-colors cursor-text"
      onDoubleClick={() => setEditing(true)}
    >
      {/* Edit button — visible on hover but also has low-opacity baseline so it's always findable */}
      <button
        onClick={() => setEditing(true)}
        className="absolute top-1 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-panel3 border border-border text-textmute text-[10.5px] opacity-30 group-hover:opacity-100 hover:!opacity-100 hover:text-text transition-opacity"
        title="Edit markdown"
      >
        <Pencil size={11} />
        Edit
      </button>

      {/* Rendered markdown */}
      <div
        className="markdown-body pr-16"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
