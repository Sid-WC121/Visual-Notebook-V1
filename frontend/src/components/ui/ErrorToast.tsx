import { useEffect } from "react";
import { useErrorStore } from "@/store/error";
import { Button } from "./Button";
import { X, AlertCircle } from "lucide-react";

export function ErrorToast() {
  const error = useErrorStore((s) => s.errorMessage);
  const setError = useErrorStore((s) => s.setError);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error, setError]);

  if (!error) return null;
  return (
    <div className="mx-5 mt-3">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-danger/5 border border-danger/20 border-l-[3px] border-l-danger text-danger font-mono text-[12px]">
        <AlertCircle size={16} className="text-danger shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="font-semibold">Error:</span> {error}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setError(null)}
          aria-label="Close"
          className="shrink-0 px-1 text-danger hover:bg-danger/10 border-none"
        >
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
