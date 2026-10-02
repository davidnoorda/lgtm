import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={twMerge(
        "my-2 block min-h-20 w-full resize-y rounded-md border border-border bg-background p-2.5 text-sm text-foreground placeholder:text-muted",
        className,
      )}
      {...props}
    />
  );
}
