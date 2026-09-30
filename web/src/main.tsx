import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MultiFileDiff } from '@pierre/diffs/react';
import type { DiffLineAnnotation, FileContents } from '@pierre/diffs';
import { FileTree, useFileTree } from '@pierre/trees/react';
import './style.css';

type Entry = { path: string; status: string };
type Overview = { repo: string; head: string; files: Entry[] };
type View = { path: string; old: string | null; new: string | null };
type Side = 'additions' | 'deletions';
type Comment = { id: string; repo: string; path: string; side: Side; line: number; text: string; excerpt: string; version: string; stale: boolean };
const get = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) throw new Error(await r.text()); return r.json(); };
const lines = (text: string | null) => text?.split('\n') ?? [];
const keyFor = (view: View) => JSON.stringify([view.old, view.new]);
function Tree({ files, selected, onSelect }: { files: Entry[]; selected: string | null; onSelect: (path: string) => void }) {
  const paths = useMemo(() => files.map(f => f.path), [files]);
  const onSelectionChange = useCallback((paths: readonly string[]) => { const path = paths[0]; if (path && files.some(f => f.path === path)) onSelect(path); }, [files, onSelect]);
  const { model } = useFileTree({ paths, initialExpansion: 'open', flattenEmptyDirectories: true, onSelectionChange });
  useEffect(() => { model.resetPaths(paths); }, [model, paths]);
  useEffect(() => { if (selected) model.getItem(selected)?.select(); }, [model, selected]);
  return <FileTree model={model} />;
}
function App() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<Comment[]>(() => { try { return JSON.parse(localStorage.getItem('readit-comments') || '[]'); } catch { return []; } });
  const [note, setNote] = useState(() => localStorage.getItem('readit-note') || '');
  const [draft, setDraft] = useState<{ side: Side; line: number } | null>(null);
  const [text, setText] = useState('');
  const [style, setStyle] = useState<'unified' | 'split'>('unified');
  const current = useRef<View | null>(null);
  useEffect(() => { localStorage.setItem('readit-comments', JSON.stringify(comments)); }, [comments]);
  useEffect(() => { localStorage.setItem('readit-note', note); }, [note]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const next = await get<Overview>('/api/overview');
        if (!active) return;
        setOverview(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next); setError('');
        setSelected(s => s && next.files.some(f => f.path === s) ? s : next.files[0]?.path ?? null);
      } catch (e) { if (active) setError(String(e)); }
    }
    void refresh(); const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!selected) { setView(null); current.current = null; return; }
    const path = selected;
    let active = true;
    async function refresh() {
      try {
        const next = await get<View>('/api/file/' + path.split('/').map(encodeURIComponent).join('/'));
        if (!active) return;
        const previous = current.current;
        setComments(cs => cs.some(c => c.repo === overview?.repo && c.path === next.path && !c.stale && c.version !== keyFor(next)) ? cs.map(c => c.repo === overview?.repo && c.path === next.path && c.version !== keyFor(next) ? { ...c, stale: true } : c) : cs);
        if (previous?.path === next.path && keyFor(previous) !== keyFor(next)) setDraft(null);
        current.current = next; setView(prev => prev?.path === next.path && keyFor(prev) === keyFor(next) ? prev : next); setError('');
      } catch (e) { if (active) setError(String(e)); }
    }
    current.current = null; setView(null); void refresh();
    const timer = setInterval(refresh, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [selected, overview?.repo]);
  const oldFile = useMemo<FileContents | null>(() => view?.old == null ? null : { name: view.path, contents: view.old }, [view]);
  const newFile = useMemo<FileContents | null>(() => view?.new == null ? null : { name: view.path, contents: view.new }, [view]);
  const annotations = useMemo<DiffLineAnnotation<Comment>[]>(() => comments.filter(c => c.repo === overview?.repo && c.path === selected && !c.stale).map(c => ({ side: c.side, lineNumber: c.line, metadata: c })), [comments, selected, overview?.repo]);
  const renderAnnotation = useCallback((annotation: DiffLineAnnotation<Comment>) => <div className="inline-comment">{annotation.metadata.text}</div>, []);
  const options = useMemo(() => ({ theme: { dark: 'pierre-dark' as const, light: 'pierre-light' as const }, diffStyle: style, lineHoverHighlight: 'both' as const, onLineNumberClick: ({ lineNumber, annotationSide }: { lineNumber: number; annotationSide: Side }) => { setDraft({ line: lineNumber, side: annotationSide }); setText(''); } }), [style]);
  function save() {
    if (!view || !draft || !text.trim()) return;
    const source = draft.side === 'additions' ? view.new : view.old;
    const excerpt = lines(source)[draft.line - 1] ?? '';
    setComments(cs => [...cs, { id: crypto.randomUUID(), repo: overview?.repo ?? '', path: view.path, side: draft.side, line: draft.line, text: text.trim(), excerpt, version: keyFor(view), stale: false }]);
    setDraft(null); setText('');
  }
  const reviewComments = comments.filter(c => c.repo === overview?.repo);
  async function copy() {
    const body = [note.trim(), ...reviewComments.map(c => `### ${c.path} — ${c.side === 'additions' ? 'new' : 'old'} line ${c.line}${c.stale ? ' (possibly stale)' : ''}\n\n> ${c.excerpt || '(blank line)'}\n\n${c.text}`)].filter(Boolean).join('\n\n');
    try { await navigator.clipboard.writeText(`Please address this review feedback (working changes against HEAD ${overview?.head ?? '?'}):\n\n${body}`); } catch (e) { setError(`Copy failed: ${e}`); }
  }
  return <div className="app"><header><strong>readit</strong><span className="repo">{overview?.repo ?? 'Loading repository…'}</span><span className="mode">Working changes · HEAD {overview?.head}</span><button onClick={copy} disabled={!note.trim() && !reviewComments.length}>Copy feedback ({reviewComments.length})</button></header>
    {error && <div className="error">{error}</div>}
    <div className="layout"><aside><h3>Changed files <span>{overview?.files.length ?? 0}</span></h3><div className="tree">{overview && <Tree files={overview.files} selected={selected} onSelect={setSelected} />}</div></aside>
      <main><div className="filebar"><span>{selected ?? 'No changes'}</span><div><button onClick={() => setStyle('unified')} aria-pressed={style === 'unified'}>Unified</button><button onClick={() => setStyle('split')} aria-pressed={style === 'split'}>Split</button></div></div>
        {view ? <><p className="hint">Click a diff line number to comment.{(view.old === null || view.new === null) && ' Added and deleted files have only one side, so both layouts look alike.'}</p>{oldFile && newFile ? <MultiFileDiff oldFile={oldFile} newFile={newFile} options={options} lineAnnotations={annotations} renderAnnotation={renderAnnotation} /> : oldFile ? <MultiFileDiff oldFile={oldFile} newFile={null} options={options} lineAnnotations={annotations} renderAnnotation={renderAnnotation} /> : newFile ? <MultiFileDiff oldFile={null} newFile={newFile} options={options} lineAnnotations={annotations} renderAnnotation={renderAnnotation} /> : null}
          {draft && <div className="editor"><strong>Comment on {draft.side === 'additions' ? 'new' : 'old'} line {draft.line}</strong><textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="What should change?" /><div><button onClick={() => setDraft(null)}>Cancel</button><button onClick={save} disabled={!text.trim()}>Add comment</button></div></div>}</> : <div className="empty">{selected ? 'Loading diff…' : 'No working changes to review.'}</div>}
      </main><section className="review"><h3>Review notes <span>{reviewComments.length}</span></h3><label>Overall note<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional instructions for your agent…" /></label><div className="comments">{reviewComments.map(c => <article key={c.id}><small>{c.path} · {c.side === 'additions' ? 'new' : 'old'}:{c.line} {c.stale && <b>Potentially stale</b>}</small><blockquote>{c.excerpt}</blockquote><textarea value={c.text} onChange={e => setComments(cs => cs.map(item => item.id === c.id ? { ...item, text: e.target.value } : item))} /><div><button onClick={() => { setSelected(c.path); setDraft({ side: c.side, line: c.line }); setText(c.text); setComments(cs => cs.filter(item => item.id !== c.id)); }}>Reattach / edit</button><button onClick={() => setComments(cs => cs.filter(item => item.id !== c.id))}>Delete</button></div></article>)}</div></section></div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
