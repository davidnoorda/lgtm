import { IconX } from "@pierre/icons";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";

export type ReviewNote = {
  id: string;
  path: string;
  mode: "files" | "changes";
  side: "additions" | "deletions";
  line: number;
  end?: number;
  excerpt: string;
  text: string;
  stale: boolean;
};

export function ReviewNotes({
  overall,
  onOverallChange,
  comments,
  onEdit,
  onDelete,
  onOpen,
}: {
  overall: string;
  onOverallChange: (value: string) => void;
  comments: ReviewNote[];
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onOpen: (comment: ReviewNote) => void;
}) {
  return (
    <div className="p-4">
      <label className="text-xs">
        Overall note
        <Textarea
          value={overall}
          onChange={(event) => onOverallChange(event.target.value)}
          placeholder="Optional instructions for your agent…"
        />
      </label>
      {!comments.length && (
        <p className="my-3 text-xs text-muted">
          Select line numbers in a file to leave a comment.
        </p>
      )}
      {comments.map((comment) => (
        <article
          key={comment.id}
          className="my-3 rounded-md border border-border bg-surface p-3"
        >
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-full flex-1 justify-start truncate pl-0 text-left"
              onClick={() => onOpen(comment)}
              title={comment.path}
            >
              {comment.path}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete comment on ${comment.path}`}
              onClick={() => onDelete(comment.id)}
            >
              <IconX />
            </Button>
          </div>
          <p className="my-2 text-xs text-muted">
            {comment.mode === "files" ? "Full file" : "Diff"} ·{" "}
            {comment.side === "additions" ? "new" : "old"} line {comment.line}
            {comment.end && comment.end !== comment.line
              ? `–${comment.end}`
              : ""}
          </p>
          {comment.stale && (
            <p className="my-2 text-danger">Potentially stale</p>
          )}
          <blockquote className="my-2.5 max-h-40 overflow-auto border-l-2 border-border pl-2.5 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
            {comment.excerpt}
          </blockquote>
          <Textarea
            aria-label={`Edit comment on ${comment.path}`}
            value={comment.text}
            onChange={(event) => onEdit(comment.id, event.target.value)}
          />
        </article>
      ))}
    </div>
  );
}
