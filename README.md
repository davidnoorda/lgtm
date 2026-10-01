# LGTM

Local, read-only repository review. Rust backend, React UI, Pierre Diffs and Trees. Requires Git, Rust and Node/npm to build; the binary requires Git and curl. Linux local-server discovery uses `$XDG_RUNTIME_DIR`.

```sh
make dev                 # open http://127.0.0.1:5173; select a registered repo
./scripts/dev.sh /repo   # review another repository in development
make build               # builds server/target/release/lgtm with embedded UI

lgtm serve               # start the local server in the foreground
lgtm open .              # register this repo and open its Files view
lgtm open /another/repo --changes
lgtm .                   # shorthand for open; starts serving if none is running
```

Use `server/target/release/lgtm` in place of `lgtm` if it isn't on your PATH. If no server is running, `open` starts one **in the foreground**; keep that terminal running. Subsequent commands register folders with it and exit. Multiple repositories can be open in separate browser tabs. Registration resolves the Git root and deduplicates canonical paths. Repository URLs use a readable folder-name slug, such as `/r/readit/files`; collisions get `-2`, `-3`, etc. Existing opaque IDs remain valid as legacy aliases. Repositories persist in `$XDG_STATE_HOME/lgtm/repositories.json` (default `~/.local/state/lgtm/`). Registration requires a random local token stored with mode 0600 in the runtime directory. Only one server runs per runtime directory; development uses a separate discovery directory.

## Views and URLs

- `/` — registered repositories.
- `/r/:id/files` — full repository tree, including tracked and untracked non-ignored files.
- `/r/:id/files/path/to/file` — full-file annotation.
- `/r/:id/changes` — staged, unstaged and untracked working changes against HEAD.
- `/r/:id/changes/path/to/file` — specific working diff.
- `/scratch/new` — creates a browser-local scratch document and replaces the URL with `/scratch/:id`.

Deep links, refresh and browser back/forward are supported. Use a fixed `LGTM_PORT` if you want bookmarks to survive server restarts. Branch comparisons are not implemented yet.

Click or drag file/diff line numbers to select code and add a comment. Full-file and diff annotations have separate coordinates. Edit or delete comments in the review panel; copy feedback to paste into an agent. The UI polls Git every two seconds. Comments on modified files are flagged as potentially stale, not silently relocated. Drafts are stored in browser localStorage, scoped by repository ID. Text files only; ignored files are excluded and paths outside registered repositories are rejected. No repository files or commits are modified.

## Scratch

Paste free text or Markdown source into the scratch editor, highlight any text, and add a comment. Annotations store the exact quote and character range, not line numbers. Edits outside a selection shift its range; edits touching the selected text mark the annotation as detached. “Show selection” highlights an attached annotation again. Markdown is currently edited as source, not rendered. Scratch documents and their annotations are browser-local; their URLs do not share the document across machines or browser profiles.

## Development checks

Install frontend dependencies with `cd web && npm ci`. Rust formatting requires rustfmt (`rustup component add rustfmt` when using rustup).

```sh
make format             # format web/ with Prettier and server/ with rustfmt
make format-check       # check formatting without modifying files (also runs in CI)
make test               # run frontend checks and Rust tests
```

Run these commands before submitting changes. Coding agents should follow `AGENTS.md`; editor format-on-save is optional. Prettier uses its defaults, with generated output and the npm lockfile excluded.

`make test` type-checks the frontend and runs Rust tests. `LGTM_NO_OPEN=1` prevents automatic browser launch; `LGTM_PORT=3001` overrides the default random loopback port. `LGTM_RUNTIME_DIR` overrides the discovery directory, primarily for isolated development/testing.
