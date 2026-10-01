import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { File, MultiFileDiff } from "@pierre/diffs/react";
import type {
  DiffLineAnnotation,
  FileContents,
  SelectedLineRange,
} from "@pierre/diffs";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import {
  invalidateUnavailableComments,
  keyFor,
  parseRepositoryRoute,
  repositoryFiles,
  repositoryURL,
  syncTreeSelection,
  updateCommentFreshness,
} from "./repository";
import type { Entry, View } from "./repository";
import "./style.css";
import { Scratch } from "./Scratch";

type Overview = { repo: string; head: string; files: GitStatusEntry[] };
type Side = "additions" | "deletions";
type Comment = {
  mode: "files" | "changes";
  id: string;
  repo: string;
  path: string;
  side: Side;
  line: number;
  end?: number;
  text: string;
  excerpt: string;
  version: string;
  stale: boolean;
};
type Draft = { path: string; side: Side; start: number; end: number };
type Annotation = { kind: "saved"; comment: Comment } | { kind: "draft" };
const location = (side: Side, start: number, end: number) =>
  `${side === "additions" ? "new" : "old"} ${start === end ? "line" : "lines"} ${start}${start === end ? "" : `–${end}`}`;
const get = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const lines = (text: string | null) => text?.split("\n") ?? [];
function Tree({
  files,
  gitStatus,
  selected,
  onSelect,
}: {
  files: Entry[];
  gitStatus: GitStatusEntry[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  // useFileTree creates its model once and retains the initial callback.
  // Read current props instead of capturing the initial repository view.
  const syncing = useRef(false);
  const selection = useRef({ files, selected, onSelect });
  selection.current = { files, selected, onSelect };
  const onSelectionChange = useCallback((paths: readonly string[]) => {
    const path = paths[0];
    const current = selection.current;
    if (
      !syncing.current &&
      path &&
      path !== current.selected &&
      current.files.some((f) => f.path === path)
    )
      current.onSelect(path);
  }, []);
  const { model } = useFileTree({
    paths,
    gitStatus,
    initialExpansion: "open",
    flattenEmptyDirectories: true,
    onSelectionChange,
  });
  useEffect(() => {
    syncing.current = true;
    try {
      model.resetPaths(paths);
    } finally {
      syncing.current = false;
    }
  }, [model, paths]);
  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [model, gitStatus]);
  useEffect(() => {
    syncing.current = true;
    try {
      syncTreeSelection(model, selected);
    } finally {
      syncing.current = false;
    }
  }, [model, paths, selected]);
  return <FileTree model={model} />;
}
function navigate(url: string, replace = false) {
  if (`${window.location.pathname}${window.location.search}` === url) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function App({
  id,
  path,
  changedOnly,
  fullFile,
}: {
  id: string;
  path: string | null;
  changedOnly: boolean;
  fullFile: boolean;
}) {
  const api = `/api/r/${id}`;
  const select = useCallback(
    (p: string) => navigate(repositoryURL(id, p, { changedOnly })),
    [id, changedOnly],
  );
  const [overview, setOverview] = useState<Overview | null>(null);
  const [files, setFiles] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string | null>(path);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [comments, setComments] = useState<Comment[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`lgtm-comments:${id}`) || "[]");
    } catch {
      return [];
    }
  });
  const [note, setNote] = useState(
    () => localStorage.getItem(`lgtm-note:${id}`) || "",
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(
    null,
  );
  const [text, setText] = useState("");
  const [style, setStyle] = useState<"unified" | "split">("unified");
  const current = useRef<View | null>(null);
  useEffect(() => {
    localStorage.setItem(`lgtm-comments:${id}`, JSON.stringify(comments));
  }, [comments, id]);
  useEffect(() => {
    localStorage.setItem(`lgtm-note:${id}`, note);
  }, [note, id]);
  useEffect(() => {
    setSelected(path);
  }, [path]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [next, tree] = await Promise.all([
          get<Overview>(api + "/overview"),
          get<Entry[]>(api + "/tree"),
        ]);
        if (!active) return;
        setOverview((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
        );
        setFiles((prev) =>
          JSON.stringify(prev) === JSON.stringify(tree) ? prev : tree,
        );
        setComments((cs) =>
          invalidateUnavailableComments(cs, next.repo, tree, next.files),
        );
        setError("");
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  const change = overview?.files.find((file) => file.path === selected);
  const isChanged = !!change;
  const fileMode =
    isChanged && (!fullFile || change.status === "deleted")
      ? "changes"
      : "files";
  const allFiles = useMemo(
    () => repositoryFiles(files, overview?.files ?? []),
    [files, overview?.files],
  );
  const visibleFiles = changedOnly ? (overview?.files ?? []) : allFiles;
  const setChangedOnly = (value: boolean) =>
    navigate(repositoryURL(id, selected, { changedOnly: value, fullFile }));
  const setFullFile = (value: boolean) =>
    navigate(repositoryURL(id, selected, { changedOnly, fullFile: value }));
  useEffect(() => {
    if (!selected || !overview) {
      setView(null);
      current.current = null;
      return;
    }
    const path = selected;
    const repo = overview.repo;
    let active = true;
    async function refresh() {
      try {
        const snapshot = await get<View>(
          api +
            (isChanged ? "/file/" : "/contents/") +
            path.split("/").map(encodeURIComponent).join("/"),
        );
        if (!active) return;
        const next =
          fileMode === "files" ? { ...snapshot, old: null } : snapshot;
        const previous = current.current;
        setComments((cs) =>
          updateCommentFreshness(cs, repo, snapshot, isChanged),
        );
        if (previous?.path === next.path && keyFor(previous) !== keyFor(next)) {
          setDraft(null);
          setSelectedRange(null);
        }
        current.current = next;
        setView((prev) =>
          prev?.path === next.path && keyFor(prev) === keyFor(next)
            ? prev
            : next,
        );
        setError("");
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    current.current = null;
    setView(null);
    setDraft(null);
    setSelectedRange(null);
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, overview?.repo, api, isChanged, fileMode]);
  const oldFile = useMemo<FileContents | null>(
    () => (view?.old == null ? null : { name: view.path, contents: view.old }),
    [view],
  );
  const newFile = useMemo<FileContents | null>(
    () => (view?.new == null ? null : { name: view.path, contents: view.new }),
    [view],
  );
  const annotations = useMemo<DiffLineAnnotation<Annotation>[]>(
    () => [
      ...comments
        .filter(
          (c) =>
            c.mode === fileMode &&
            c.repo === overview?.repo &&
            c.path === selected &&
            !c.stale,
        )
        .map((c) => ({
          side: c.side,
          lineNumber: c.end ?? c.line,
          metadata: { kind: "saved" as const, comment: c },
        })),
      ...(draft?.path === selected
        ? [
            {
              side: draft.side,
              lineNumber: draft.end,
              metadata: { kind: "draft" as const },
            },
          ]
        : []),
    ],
    [comments, selected, overview?.repo, draft, fileMode],
  );
  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<Annotation>) =>
      annotation.metadata.kind === "draft" ? (
        <div className="inline-comment draft-comment">
          <span className="comment-avatar" aria-hidden="true">
            R
          </span>
          <div className="draft-body">
            <strong>
              Comment on {draft && location(draft.side, draft.start, draft.end)}
            </strong>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What should change?"
            />
            <div className="draft-actions">
              <button
                onClick={() => {
                  setDraft(null);
                  setSelectedRange(null);
                  setText("");
                }}
              >
                Cancel
              </button>
              <button onClick={save} disabled={!text.trim()}>
                Add comment
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="inline-comment">
          <span className="comment-avatar" aria-hidden="true">
            R
          </span>
          <div>
            <strong>Review note</strong>
            <p>{annotation.metadata.comment.text}</p>
          </div>
        </div>
      ),
    [draft, text, view, overview?.repo],
  );
  const options = useMemo(
    () => ({
      theme: "pierre-dark" as const,
      diffStyle: style,
      unsafeCSS: ":host { --diffs-bg: #101011; }",
      lineHoverHighlight: "both" as const,
      enableLineSelection: !draft,
      enableGutterUtility: !draft,
      onLineSelectionChange: (range: SelectedLineRange | null) =>
        setSelectedRange(range),
      onGutterUtilityClick: (range: SelectedLineRange) =>
        setSelectedRange(range),
      onLineSelectionEnd: (range: SelectedLineRange | null) => {
        if (!range || !selected || (fileMode === "changes" && !range.side)) {
          setSelectedRange(null);
          return;
        }
        const side = range.side ?? "additions";
        // Comments refer to one version of a file. A selection spanning both sides
        // is limited to the starting side rather than saving misleading coordinates.
        const end =
          range.endSide && range.endSide !== side ? range.start : range.end;
        const start = Math.min(range.start, end);
        const last = Math.max(range.start, end);
        setSelectedRange({ start, end: last, side });
        setDraft({ path: selected, side, start, end: last });
        setText("");
      },
    }),
    [style, selected, draft, fileMode],
  );
  function save() {
    if (!view || !draft || !text.trim()) return;
    const source = draft.side === "additions" ? view.new : view.old;
    const excerpt = lines(source)
      .slice(draft.start - 1, draft.end)
      .join("\n");
    setComments((cs) => [
      ...cs,
      {
        mode: fileMode,
        id: crypto.randomUUID(),
        repo: overview?.repo ?? "",
        path: view.path,
        side: draft.side,
        line: draft.start,
        end: draft.end,
        text: text.trim(),
        excerpt,
        version: keyFor(view),
        stale: false,
      },
    ]);
    setDraft(null);
    setSelectedRange(null);
    setText("");
  }
  const reviewComments = comments.filter((c) => c.repo === overview?.repo);
  async function copy() {
    const body = [
      note.trim(),
      ...reviewComments.map(
        (c) =>
          `### ${c.path} (${c.mode}) — ${location(c.side, c.line, c.end ?? c.line)}${c.stale ? " (possibly stale)" : ""}\n\n> ${(c.excerpt || "(blank line)").split("\n").join("\n> ")}\n\n${c.text}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(
        `Please address this review feedback (repository HEAD ${overview?.head ?? "?"}):\n\n${body}`,
      );
    } catch (e) {
      setError(`Copy failed: ${e}`);
    }
  }
  return (
    <div className="app">
      <header>
        <strong>LGTM</strong>
        <span className="repo">{overview?.repo ?? "Loading repository…"}</span>
        <nav className="view-nav" aria-label="Views">
          <button onClick={() => navigate("/")}>Repositories</button>
          <button onClick={() => navigate("/scratch/new")}>Scratch</button>
        </nav>
        <span className="mode">HEAD {overview?.head}</span>
        <button
          onClick={copy}
          disabled={!note.trim() && !reviewComments.length}
        >
          Copy feedback ({reviewComments.length})
        </button>
      </header>
      {error && <div className="error">{error}</div>}
      <div className="layout">
        <aside>
          <h3>
            Files <span>{visibleFiles.length}</span>
          </h3>
          <label className="tree-filter">
            <input
              type="checkbox"
              checked={changedOnly}
              onChange={(e) => setChangedOnly(e.target.checked)}
            />{" "}
            Changed only <span>{overview?.files.length ?? 0}</span>
          </label>
          <div className="tree">
            {overview && (
              <Tree
                files={visibleFiles}
                gitStatus={overview.files}
                selected={selected}
                onSelect={select}
              />
            )}
          </div>
        </aside>
        <main>
          <div className="filebar">
            <span>{selected ?? "Select a file"}</span>
            <div>
              {isChanged && change.status !== "deleted" && (
                <>
                  <button
                    onClick={() => setFullFile(false)}
                    aria-pressed={fileMode === "changes"}
                  >
                    Diff
                  </button>
                  <button
                    onClick={() => setFullFile(true)}
                    aria-pressed={fileMode === "files"}
                  >
                    Full file
                  </button>
                </>
              )}
              {fileMode === "changes" && (
                <>
                  <button
                    onClick={() => setStyle("unified")}
                    aria-pressed={style === "unified"}
                  >
                    Unified
                  </button>
                  <button
                    onClick={() => setStyle("split")}
                    aria-pressed={style === "split"}
                  >
                    Split
                  </button>
                </>
              )}
            </div>
          </div>
          {view ? (
            <>
              <p className="hint">
                Click or drag line numbers to select lines and leave a comment.
              </p>
              {fileMode === "files" && newFile ? (
                <File<Annotation>
                  file={newFile}
                  options={options}
                  selectedLines={selectedRange}
                  lineAnnotations={annotations}
                  renderAnnotation={(a) =>
                    renderAnnotation({ ...a, side: "additions" })
                  }
                />
              ) : oldFile && newFile ? (
                <MultiFileDiff
                  oldFile={oldFile}
                  newFile={newFile}
                  options={options}
                  selectedLines={selectedRange}
                  lineAnnotations={annotations}
                  renderAnnotation={renderAnnotation}
                />
              ) : oldFile ? (
                <MultiFileDiff
                  oldFile={oldFile}
                  newFile={null}
                  options={options}
                  selectedLines={selectedRange}
                  lineAnnotations={annotations}
                  renderAnnotation={renderAnnotation}
                />
              ) : newFile ? (
                <MultiFileDiff
                  oldFile={null}
                  newFile={newFile}
                  options={options}
                  selectedLines={selectedRange}
                  lineAnnotations={annotations}
                  renderAnnotation={renderAnnotation}
                />
              ) : null}
            </>
          ) : (
            <div className="empty">
              {selected ? "Loading file…" : "Select a file to review."}
            </div>
          )}
        </main>
        <section className="review">
          <h3>
            Review notes <span>{reviewComments.length}</span>
          </h3>
          <label>
            Overall note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional instructions for your agent…"
            />
          </label>
          <div className="comments">
            {reviewComments.map((c) => (
              <article key={c.id}>
                <small>
                  {c.path} · {location(c.side, c.line, c.end ?? c.line)}{" "}
                  {c.stale && <b>Potentially stale</b>}
                </small>
                <blockquote>{c.excerpt}</blockquote>
                <textarea
                  value={c.text}
                  onChange={(e) =>
                    setComments((cs) =>
                      cs.map((item) =>
                        item.id === c.id
                          ? { ...item, text: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <div>
                  <button
                    onClick={() =>
                      navigate(
                        repositoryURL(id, c.path, {
                          fullFile: c.mode === "files",
                        }),
                      )
                    }
                  >
                    Open file
                  </button>
                  <button
                    onClick={() =>
                      setComments((cs) => cs.filter((item) => item.id !== c.id))
                    }
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
function Home() {
  const [repos, setRepos] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    void get<Record<string, string>>("/api/repositories")
      .then(setRepos)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <div className="app">
      <header>
        <strong>LGTM</strong>
        <button onClick={() => navigate("/scratch/new")}>New scratch</button>
      </header>
      <main>
        <h2>Repositories</h2>
        <p>
          Register a repository with <code>lgtm open /path/to/repo</code>.
        </p>
        {error && <p>{error}</p>}
        {Object.entries(repos).map(([id, path]) => (
          <p key={id}>
            <button onClick={() => navigate(`/r/${id}/files`)}>{path}</button>
          </p>
        ))}
      </main>
    </div>
  );
}
function Router() {
  const [url, setUrl] = useState(
    `${window.location.pathname}${window.location.search}`,
  );
  useEffect(() => {
    const update = () =>
      setUrl(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const lastRepository = useRef(
    sessionStorage.getItem("lgtm-last-repository") || "/",
  );
  useEffect(() => {
    if (url.startsWith("/r/")) {
      lastRepository.current = url;
      sessionStorage.setItem("lgtm-last-repository", url);
    }
  }, [url]);
  const route = parseRepositoryRoute(url);
  if (route) return <App key={route.id} {...route} />;
  if (/^\/scratch\/[^/]+$/.test(url))
    return (
      <Scratch
        key={url}
        id={url.slice(9)}
        onBack={() => navigate(lastRepository.current)}
        onHome={() => navigate("/")}
      />
    );
  return <Home />;
}
createRoot(document.getElementById("root")!).render(<Router />);
