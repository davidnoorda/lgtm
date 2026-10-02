import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/Button";
import { Textarea } from "./components/ui/Textarea";
import { ChromeHeader } from "./components/ChromeHeader";

type Note = {
  id: string;
  start: number;
  end: number;
  quote: string;
  text: string;
  detached: boolean;
};
type Document = { text: string; notes: Note[] };
export function Scratch({
  id,
  onBack,
  onHome,
}: {
  id: string;
  onBack: () => void;
  onHome: () => void;
}) {
  const [doc, setDoc] = useState<Document>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`lgtm-scratch:${id}`) || '{"text":"","notes":[]}',
      );
    } catch {
      return { text: "", notes: [] };
    }
  });
  const [range, setRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [comment, setComment] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (id === "new") {
      const next = crypto.randomUUID();
      localStorage.setItem(
        `lgtm-scratch:${next}`,
        JSON.stringify({ text: "", notes: [] }),
      );
      window.history.replaceState({}, "", `/scratch/${next}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else {
      try {
        localStorage.setItem(`lgtm-scratch:${id}`, JSON.stringify(doc));
      } catch {
        setError(
          "Could not save this scratch document. Browser storage may be full.",
        );
      }
    }
  }, [id, doc]);
  function change(text: string) {
    // Treat a textarea edit as one replacement. Preserve ranges outside it;
    // never guess an anchor when its selected text was edited.
    let prefix = 0;
    while (
      prefix < doc.text.length &&
      prefix < text.length &&
      doc.text[prefix] === text[prefix]
    )
      prefix++;
    let suffix = 0;
    while (
      suffix < doc.text.length - prefix &&
      suffix < text.length - prefix &&
      doc.text[doc.text.length - 1 - suffix] === text[text.length - 1 - suffix]
    )
      suffix++;
    const oldEnd = doc.text.length - suffix;
    const delta = text.length - doc.text.length;
    setDoc({
      text,
      notes: doc.notes.map((n) =>
        n.detached
          ? n
          : n.end <= prefix
            ? n
            : n.start >= oldEnd
              ? { ...n, start: n.start + delta, end: n.end + delta }
              : { ...n, detached: true },
      ),
    });
    setRange(null);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        doc.notes
          .map(
            (n) =>
              `> ${n.quote.split("\n").join("\n> ")}\n\n${n.text}${n.detached ? "\n(selected text was edited)" : ""}`,
          )
          .join("\n\n"),
      );
    } catch {
      setError("Could not copy feedback.");
    }
  }
  // Wait for the canonical route before accepting edits; this temporary
  // component is replaced when /scratch/new gets its document ID.
  if (id === "new") return <p role="status">Creating scratch document…</p>;

  return (
    <div className="flex h-dvh flex-col">
      <ChromeHeader
        title="LGTM · Scratch"
        context="Browser-local text annotations"
        onHome={onHome}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onBack}>
              Back to review
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.history.pushState({}, "", "/scratch/new");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >
              New scratch
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copy}
              disabled={!doc.notes.length}
            >
              Copy feedback ({doc.notes.length})
            </Button>
          </>
        }
      />
      {error && (
        <div
          role="alert"
          className="border-b border-border px-4 py-2.5 text-danger"
        >
          {error}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[minmax(0,1fr)_340px]">
        <main className="flex min-h-80 flex-col p-4">
          <p className="mb-3 text-xs text-muted">
            Paste text or Markdown. Highlight any text, then add a comment.
          </p>
          <Textarea
            ref={area}
            className="min-h-60 flex-1 font-mono"
            aria-label="Scratch text"
            placeholder="Paste text or Markdown here…"
            value={doc.text}
            onChange={(e) => change(e.target.value)}
            onSelect={(e) => {
              const t = e.currentTarget;
              setRange(
                t.selectionEnd > t.selectionStart
                  ? { start: t.selectionStart, end: t.selectionEnd }
                  : null,
              );
            }}
          />
        </main>
        <section className="border-t border-border p-4 md:overflow-auto md:border-t-0 md:border-l">
          <h3 className="mb-3 text-base">Text annotations</h3>
          {range && (
            <div className="my-3 rounded-md border border-border bg-surface p-3">
              <blockquote className="my-2.5 max-h-40 overflow-auto border-l-2 border-border pl-2.5 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
                {doc.text.slice(range.start, range.end)}
              </blockquote>
              <Textarea
                aria-label="Annotation"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What should change?"
              />
              <Button
                variant="default"
                disabled={!comment.trim()}
                onClick={() => {
                  setDoc((d) => ({
                    ...d,
                    notes: [
                      ...d.notes,
                      {
                        id: crypto.randomUUID(),
                        ...range,
                        quote: d.text.slice(range.start, range.end),
                        text: comment.trim(),
                        detached: false,
                      },
                    ],
                  }));
                  setComment("");
                  setRange(null);
                }}
              >
                Add comment
              </Button>
            </div>
          )}
          {doc.notes.map((n) => (
            <article
              key={n.id}
              className="my-3 rounded-md border border-border bg-surface p-3"
            >
              {n.detached && (
                <small className="text-danger">
                  Selected text was edited — annotation detached
                </small>
              )}
              <blockquote className="my-2.5 max-h-40 overflow-auto border-l-2 border-border pl-2.5 font-mono text-xs whitespace-pre-wrap wrap-anywhere">
                {n.quote}
              </blockquote>
              <Textarea
                aria-label="Edit annotation"
                value={n.text}
                onChange={(e) =>
                  setDoc((d) => ({
                    ...d,
                    notes: d.notes.map((item) =>
                      item.id === n.id
                        ? { ...item, text: e.target.value }
                        : item,
                    ),
                  }))
                }
              />
              <Button
                className="mr-2"
                disabled={n.detached}
                onClick={() => {
                  area.current?.focus();
                  area.current?.setSelectionRange(n.start, n.end);
                }}
              >
                Show selection
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  setDoc((d) => ({
                    ...d,
                    notes: d.notes.filter((item) => item.id !== n.id),
                  }))
                }
              >
                Delete
              </Button>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
