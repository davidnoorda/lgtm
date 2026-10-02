import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

const variants = {
  default: "bg-foreground text-background enabled:hover:bg-muted",
  outline: "bg-surface enabled:hover:bg-secondary",
  ghost: "border-transparent bg-transparent enabled:hover:bg-secondary",
  destructive: "bg-surface text-danger enabled:hover:bg-secondary",
};
const sizes = {
  default: "px-3 py-1.5",
  sm: "px-3 py-1.5 text-xs",
  icon: "w-8.5 shrink-0 p-1.5",
};

// App styling only; interaction and composition belong to native/Base UI controls.
export function Button({
  variant = "outline",
  size = "default",
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      type={type}
      className={twMerge(
        "inline-flex min-h-8.5 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border disabled:cursor-default disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
