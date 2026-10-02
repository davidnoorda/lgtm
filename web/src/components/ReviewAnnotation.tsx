import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";

export function DraftAnnotation({
  value,
  onChange,
  onCancel,
  onSave,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  label: string;
}) {
  return (
    <form
      className="m-3 max-w-150 rounded-md border border-border bg-surface p-3 font-sans text-sm text-foreground"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label className="text-xs">
        {label}
        <Textarea
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="What should change?"
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSave();
            }
          }}
        />
      </label>
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="default"
          size="sm"
          disabled={!value.trim()}
        >
          Add comment
        </Button>
      </div>
    </form>
  );
}

export function SavedAnnotation({ text }: { text: string }) {
  return (
    <div className="m-3 max-w-150 rounded-md border border-border bg-surface p-3 font-sans text-sm text-foreground">
      <strong>Review note</strong>
      <p className="mt-2 whitespace-pre-wrap wrap-anywhere">{text}</p>
    </div>
  );
}
