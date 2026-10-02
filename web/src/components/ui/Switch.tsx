import { Switch as Primitive } from "@base-ui/react/switch";
import { twMerge } from "tailwind-merge";

export function Switch({
  className,
  ...props
}: Omit<Primitive.Root.Props, "className"> & { className?: string }) {
  return (
    <Primitive.Root
      className={twMerge(
        "inline-flex h-4.5 w-7.5 shrink-0 cursor-pointer items-center rounded-full bg-secondary p-0.5 data-checked:bg-foreground data-disabled:cursor-default data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="size-3.5 rounded-full bg-surface data-checked:translate-x-3" />
    </Primitive.Root>
  );
}
