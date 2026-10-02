import { ToggleGroup as Primitive } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";

export function ToggleGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <Primitive
      aria-label={label}
      value={[value]}
      className="inline-flex gap-0.5 rounded-md bg-secondary p-0.75"
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next[0]);
        if (option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="cursor-pointer rounded-sm bg-transparent px-2.5 py-1.25 text-xs data-pressed:bg-surface"
        >
          {option.label}
        </Toggle>
      ))}
    </Primitive>
  );
}
