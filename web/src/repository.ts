import type { FileTree, GitStatusEntry } from "@pierre/trees";

export type Entry = { path: string; status: GitStatusEntry["status"] | "file" };
export type View = { path: string; old: string | null; new: string | null };
type RepositoryOptions = { changedOnly?: boolean; fullFile?: boolean };
type CoordinateComment = {
  repo: string;
  path: string;
  mode: "files" | "changes";
  version: string;
  stale: boolean;
};

export const keyFor = (view: View) => JSON.stringify([view.old, view.new]);

// Deleted paths aren't returned by /tree. Git decorations alone don't add rows.
export function repositoryFiles(
  files: Entry[],
  changes: GitStatusEntry[],
): Entry[] {
  const entries = new Map(files.map((file) => [file.path, file]));
  for (const change of changes) entries.set(change.path, change);
  return [...entries.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

export function repositoryURL(
  id: string,
  path: string | null = null,
  options: RepositoryOptions = {},
): string {
  const query = new URLSearchParams();
  if (options.changedOnly) query.set("changed", "1");
  if (options.fullFile) query.set("view", "file");
  const suffix = query.size ? `?${query}` : "";
  return `/r/${id}/files${path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : ""}${suffix}`;
}

export function parseRepositoryRoute(url: string) {
  const [pathname, search] = url.split("?");
  const match = pathname.match(/^\/r\/([^/]+)\/files(?:\/(.*))?$/);
  if (!match) return null;
  const query = new URLSearchParams(search);
  return {
    id: match[1],
    path: match[2] ? decodeURIComponent(match[2]) : null,
    changedOnly: query.get("changed") === "1",
    fullFile: query.get("view") === "file",
  };
}

export function syncTreeSelection(
  model: Pick<FileTree, "getSelectedPaths" | "getItem">,
  selected: string | null,
) {
  for (const path of model.getSelectedPaths()) {
    if (path !== selected) model.getItem(path)?.deselect();
  }
  if (selected) model.getItem(selected)?.select();
}

function markStale<T extends CoordinateComment>(
  comments: T[],
  shouldInvalidate: (comment: T) => boolean,
): T[] {
  let changed = false;
  const next = comments.map((comment) => {
    if (comment.stale || !shouldInvalidate(comment)) return comment;
    changed = true;
    return { ...comment, stale: true };
  });
  return changed ? next : comments;
}

// Check both coordinate systems, regardless of which one is currently displayed.
export function updateCommentFreshness<T extends CoordinateComment>(
  comments: T[],
  repo: string,
  snapshot: View,
  isChanged: boolean,
): T[] {
  const fileVersion = keyFor({ ...snapshot, old: null });
  const diffVersion = keyFor(snapshot);
  return markStale(
    comments,
    (comment) =>
      comment.repo === repo &&
      comment.path === snapshot.path &&
      (comment.mode === "files"
        ? snapshot.new === null || comment.version !== fileVersion
        : !isChanged || comment.version !== diffVersion),
  );
}

// Polling must also flag comments on files that aren't currently selected.
export function invalidateUnavailableComments<T extends CoordinateComment>(
  comments: T[],
  repo: string,
  files: Entry[],
  changes: GitStatusEntry[],
): T[] {
  const existingPaths = new Set(files.map((file) => file.path));
  const changedPaths = new Set(changes.map((file) => file.path));
  return markStale(
    comments,
    (comment) =>
      comment.repo === repo &&
      !(comment.mode === "files" ? existingPaths : changedPaths).has(
        comment.path,
      ),
  );
}
