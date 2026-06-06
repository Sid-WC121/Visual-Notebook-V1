import * as React from "react";
import { cn } from "@/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "pagination";
  size?: "sm" | "md" | "lg" | "icon" | "square";
}

export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin -ml-1 mr-2 h-4 w-4", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

export function ButtonProgress() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="h-full bg-white/25 animate-progress-ind w-full" />
    </div>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    const variants = {
      primary: "bg-accent text-white border-accent hover:opacity-90",
      secondary: "bg-panel border-border text-text hover:bg-panel2 hover:border-border2",
      outline: "bg-transparent border-border text-text hover:bg-panel hover:border-border2",
      ghost: "bg-transparent border-transparent text-textdim hover:text-text hover:bg-panel",
      danger: "bg-transparent border-transparent text-textmute hover:text-danger hover:bg-danger/5",
      pagination:
        "bg-panel border-border text-text hover:bg-accent50 hover:border-accent hover:text-accent",
    };

    const sizes = {
      sm: "px-2 py-1 text-[11px]",
      md: "px-3 py-1.5 text-[12px]",
      lg: "px-4 py-2 text-[14px]",
      icon: "p-1.5",
      square: "w-7 h-7 p-0 text-[14px]",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center gap-1.5 rounded-md font-sans font-medium whitespace-nowrap transition-colors border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 overflow-hidden",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button };
