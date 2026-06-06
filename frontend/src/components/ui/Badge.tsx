import clsx from "clsx";
import React from "react";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "muted" | "accent" | "danger" | "success" | "indigo";
  className?: string;
}

export function Badge({ children, variant = "muted", className }: BadgeProps) {
  const variants = {
    muted: "text-textmute bg-panel2 border-border",
    accent: "text-accent bg-accent50 border-accent/20",
    danger: "text-danger bg-danger/5 border-danger/20",
    success: "text-success bg-success/5 border-success/20",
    indigo: "text-indigo-700 bg-indigo-50 border-indigo-100",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
