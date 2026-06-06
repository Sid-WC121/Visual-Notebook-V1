import React from "react";
import { useGlobalResize } from "@/hooks/useGlobalResize";

export function useScrollSync(ref: React.RefObject<HTMLDivElement>, watch: unknown) {
  const [overflow, setOverflow] = React.useState({ left: false, right: false });

  const checkScroll = React.useCallback(() => {
    const el = ref.current;
    if (el) {
      setOverflow({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    }
  }, [ref]);

  useGlobalResize(checkScroll);

  React.useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
      const timer = setTimeout(checkScroll, 0);
      el.addEventListener("scroll", checkScroll, { passive: true });
      return () => {
        clearTimeout(timer);
        el.removeEventListener("scroll", checkScroll);
      };
    }
  }, [ref, checkScroll, watch]);

  const maskClass = React.useMemo(() => {
    if (overflow.left && overflow.right) return "mask-fade-both";
    if (overflow.left) return "mask-fade-left";
    if (overflow.right) return "mask-fade-right";
    return "";
  }, [overflow]);

  return { maskClass };
}
