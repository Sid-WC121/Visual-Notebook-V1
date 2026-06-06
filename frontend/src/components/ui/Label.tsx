import clsx from "clsx";
import React from "react";

export interface LabelProps {
  children: React.ReactNode;
  variant?: "dim" | "mute" | "accent";
  size?: "xs" | "sm";
  className?: string;
  tracking?: "normal" | "wide" | "wider";
}

export function Label({
  children,
  variant = "dim",
  size = "xs",
  className,
  tracking = "wide",
}: LabelProps) {
  const variants = {
    dim: "text-textdim",
    mute: "text-textmute",
    accent: "text-accent",
  };

  const sizes = {
    xs: "text-[9px]",
    sm: "text-[10px]",
  };

  const trackings = {
    normal: "tracking-normal",
    wide: "tracking-[0.9px]",
    wider: "tracking-[1.4px]",
  };

  return (
    <label
      className={clsx(
        "uppercase font-semibold select-none",
        variants[variant],
        sizes[size],
        trackings[tracking],
        className,
      )}
    >
      {children}
    </label>
  );
}
