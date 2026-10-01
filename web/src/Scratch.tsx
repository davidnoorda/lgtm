import { useEffect, useRef, useState } from "react";

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
  return (
    <div className="app">
      <header>
        <strong>LGTM · Scratch</strong>
        <span className="repo">Browser-local text annotations</span>
        <nav className="view-nav" aria-label="Views">
          <button onClick={onBack}>Back to review</button>
          <button onClick={onHome}>Repositories</button>
        </nav>
        <button
          onClick={() => {
            window.history.pushState({}, "", "/scratch/new");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          New scratch
        </button>
        <button onClick={copy} disabled={!doc.notes.length}>
          Copy feedback ({doc.notes.length})
        </button>
      </header>
      {error && <div className="error">{error}</div>}
      <div className="scratch-layout">
        <main>
          <p className="hint">
            Paste text or Markdown. Highlight any text, then add a comment.
          </p>
          <textarea
            ref={area}
            className="scratch-text"
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
        <section className="review">
          <h3>Text annotations</h3>
          {range && (
            <div>
              <blockquote>{doc.text.slice(range.start, range.end)}</blockquote>
              <textarea
                aria-label="Annotation"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What should change?"
              />
              <button
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
              </button>
            </div>
          )}
          {doc.notes.map((n) => (
            <article key={n.id}>
              {n.detached && (
                <small>Selected text was edited — annotation detached</small>
              )}
              <blockquote>{n.quote}</blockquote>
              <textarea
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
              <button
                disabled={n.detached}
                onClick={() => {
                  area.current?.focus();
                  area.current?.setSelectionRange(n.start, n.end);
                }}
              >
                Show selection
              </button>
              <button
                onClick={() =>
                  setDoc((d) => ({
                    ...d,
                    notes: d.notes.filter((item) => item.id !== n.id),
                  }))
                }
              >
                Delete
              </button>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
