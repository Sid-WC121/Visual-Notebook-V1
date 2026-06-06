import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/utils/cn";
import { useClickOutside } from "@/hooks/useClickOutside";

export interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select options...",
  label,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => setIsOpen(false), []);
  useClickOutside(containerRef, closePanel);

  const filteredOptions = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const removeOption = (e: React.MouseEvent, opt: string) => {
    e.stopPropagation();
    onChange(selected.filter((s) => s !== opt));
  };

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {label && (
        <label className="text-[10px] uppercase tracking-[0.9px] text-textdim font-semibold">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "min-h-9.5 w-full px-2 py-1.5 bg-panel border border-border rounded-md cursor-pointer",
            "flex flex-wrap gap-1.5 items-center",
            "focus-within:border-accent focus-within:shadow-glow transition-all",
            isOpen && "border-accent shadow-glow",
          )}
        >
          {selected.length === 0 ? (
            <span className="text-[13px] text-textmute px-1">{placeholder}</span>
          ) : (
            selected.map((val) => (
              <span
                key={val}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent50 border border-accent/20 rounded text-[11px] text-accent font-medium"
              >
                {val}
                <button
                  onClick={(e) => removeOption(e, val)}
                  className="hover:text-danger transition-colors"
                >
                  ×
                </button>
              </span>
            ))
          )}
          <div className="ml-auto pr-1 text-textmute text-[10px]">▼</div>
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-panel border border-border rounded-md shadow-pop max-h-60 flex flex-col overflow-hidden">
            <div className="p-2 border-b border-border bg-panel2">
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-2 py-1.5 text-[12px] bg-panel border border-border rounded focus:outline-hidden focus:border-accent"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-[12px] text-textmute text-center">No options found</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = selected.includes(opt);
                  return (
                    <div
                      key={opt}
                      onClick={() => toggleOption(opt)}
                      className={cn(
                        "px-3 py-2 text-[13px] cursor-pointer flex items-center justify-between",
                        "hover:bg-panel2 transition-colors",
                        isSelected && "bg-accent50 text-accent font-medium",
                      )}
                    >
                      {opt}
                      {isSelected ? <span>✓</span> : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
