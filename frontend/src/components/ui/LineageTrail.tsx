import React from "react";
import { Badge } from "@/components/ui/Badge";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { useScrollSync } from "@/hooks/useScrollSync";

export interface LineageTrailProps {
  lineage: string[];
  className?: string;
}

export function LineageTrail({ lineage, className }: LineageTrailProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { maskClass } = useScrollSync(scrollRef, lineage);

  return (
    <div className={cn("relative flex-1 min-w-0 h-full flex items-center", className)}>
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center gap-1 overflow-x-auto no-scrollbar transition-[mask-image]",
          maskClass,
        )}
      >
        <div className="flex items-center gap-1 shrink-0 pl-1">
          {lineage.map((step, i) => (
            <React.Fragment key={`${step}-${i}`}>
              {i > 0 && <ChevronRight size={10} className="text-textmute shrink-0" />}
              <SimpleTooltip content={step}>
                <Badge variant="indigo" className="cursor-default whitespace-nowrap">
                  {step}
                </Badge>
              </SimpleTooltip>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
