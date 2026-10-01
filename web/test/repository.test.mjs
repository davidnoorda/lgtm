import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { FileTree } from "@pierre/trees";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

// Use the installed TS compiler so tests don't require a runner or Node's TS support.
const source = await readFile(
  new URL("../src/repository.ts", import.meta.url),
  "utf8",
);
const { outputText } = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
});
const {
  invalidateUnavailableComments,
  keyFor,
  parseRepositoryRoute,
  repositoryFiles,
  repositoryURL,
  syncTreeSelection,
  updateCommentFreshness,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const snapshot = { path: "src/file.ts", old: "before\n", new: "after\n" };
const comment = (mode, view = snapshot, overrides = {}) => ({
  repo: "/repo",
  path: view.path,
  mode,
  version: keyFor(mode === "files" ? { ...view, old: null } : view),
  stale: false,
  ...overrides,
});

test("full repository paths include deletions and deduplicate changed files", () => {
  const files = [
    { path: "src/file.ts", status: "file" },
    { path: "clean.txt", status: "file" },
  ];
  const changes = [
    { path: "src/file.ts", status: "modified" },
    { path: "removed.txt", status: "deleted" },
  ];
  const entries = repositoryFiles(files, changes);
  assert.deepEqual(entries, [files[1], changes[1], changes[0]]);
  const tree = new FileTree({
    paths: entries.map((file) => file.path),
    gitStatus: changes,
  });
  try {
    assert.ok(tree.getItem("removed.txt"));
  } finally {
    tree.cleanUp();
  }
  assert.equal(files.length, 2);
});

test("tree selection returns after toggling changed-only off", () => {
  const tree = new FileTree({ paths: ["changed.txt", "clean.txt"] });
  try {
    syncTreeSelection(tree, "clean.txt");
    tree.resetPaths(["changed.txt"]);
    syncTreeSelection(tree, "clean.txt");
    assert.deepEqual(tree.getSelectedPaths(), []);
    tree.resetPaths(["changed.txt", "clean.txt"]);
    syncTreeSelection(tree, "clean.txt");
    assert.deepEqual(tree.getSelectedPaths(), ["clean.txt"]);
  } finally {
    tree.cleanUp();
  }
});

test("tree selection follows navigation without accumulating previous selections", () => {
  const tree = new FileTree({ paths: ["a.txt", "b.txt"] });
  try {
    syncTreeSelection(tree, "a.txt");
    syncTreeSelection(tree, "b.txt");
    assert.deepEqual(tree.getSelectedPaths(), ["b.txt"]);
    syncTreeSelection(tree, null);
    assert.deepEqual(tree.getSelectedPaths(), []);
  } finally {
    tree.cleanUp();
  }
});

test("canonical changed-only URL works without a selected file", () => {
  assert.equal(
    repositoryURL("repo", null, { changedOnly: true }),
    "/r/repo/files?changed=1",
  );
  assert.deepEqual(parseRepositoryRoute("/r/repo/files?changed=1"), {
    id: "repo",
    path: null,
    changedOnly: true,
    fullFile: false,
  });
});

test("repository URLs preserve filters, file mode, and encoded paths", () => {
  const path = "src/a ?#% ü.ts";
  const url = repositoryURL("repo", path, {
    changedOnly: true,
    fullFile: true,
  });
  assert.deepEqual(parseRepositoryRoute(url), {
    id: "repo",
    path,
    changedOnly: true,
    fullFile: true,
  });
  assert.deepEqual(
    parseRepositoryRoute(repositoryURL("repo", path, { fullFile: true })),
    {
      id: "repo",
      path,
      changedOnly: false,
      fullFile: true,
    },
  );
});

test("old Changes routes are not retained", () => {
  assert.equal(parseRepositoryRoute("/r/repo/changes"), null);
  assert.equal(parseRepositoryRoute("/r/repo/changes/src/file.ts"), null);
  assert.equal(parseRepositoryRoute("/scratch/new"), null);
});

test("full-file and diff comments stay fresh against their own coordinate versions", () => {
  const comments = [comment("files"), comment("changes")];
  assert.equal(
    updateCommentFreshness(comments, "/repo", snapshot, true),
    comments,
  );
});

test("editing a file invalidates both kinds of comments regardless of display mode", () => {
  const comments = [comment("files"), comment("changes")];
  const next = updateCommentFreshness(
    comments,
    "/repo",
    { ...snapshot, new: "edited\n" },
    true,
  );
  assert.deepEqual(
    next.map((note) => note.stale),
    [true, true],
  );
  assert.equal(comments[0].stale, false);
});

test("a changed diff baseline does not invalidate unchanged full-file contents", () => {
  const next = updateCommentFreshness(
    [comment("files"), comment("changes")],
    "/repo",
    {
      ...snapshot,
      old: "different HEAD\n",
    },
    true,
  );
  assert.deepEqual(
    next.map((note) => note.stale),
    [false, true],
  );
});

test("committing a change invalidates the diff but preserves matching full-file comments", () => {
  const next = updateCommentFreshness(
    [comment("files"), comment("changes")],
    "/repo",
    {
      ...snapshot,
      old: null,
    },
    false,
  );
  assert.deepEqual(
    next.map((note) => note.stale),
    [false, true],
  );
});

test("deleting a file invalidates full-file comments but keeps matching deletion comments", () => {
  const deleted = { ...snapshot, new: null };
  const next = updateCommentFreshness(
    [comment("files"), comment("changes", deleted)],
    "/repo",
    deleted,
    true,
  );
  assert.deepEqual(
    next.map((note) => note.stale),
    [true, false],
  );
});

test("polling invalidates unavailable coordinates even when their file is not selected", () => {
  const comments = [
    comment("files"),
    comment("changes"),
    comment("files", snapshot, { path: "removed.txt" }),
  ];
  const next = invalidateUnavailableComments(
    comments,
    "/repo",
    [{ path: snapshot.path, status: "file" }],
    [],
  );
  assert.deepEqual(
    next.map((note) => note.stale),
    [false, true, true],
  );
});

test("freshness checks respect repository/path scope and never revive stale comments", () => {
  const comments = [
    comment("files", snapshot, { repo: "/other" }),
    comment("changes", snapshot, { path: "other.ts" }),
    comment("files", snapshot, { stale: true }),
  ];
  assert.equal(
    updateCommentFreshness(
      comments,
      "/repo",
      { ...snapshot, new: "edited" },
      true,
    ),
    comments,
  );
  assert.equal(
    invalidateUnavailableComments(comments, "/unrelated", [], []),
    comments,
  );
});
