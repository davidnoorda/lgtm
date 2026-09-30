# readit

Local, read-only Git working-change review. Rust backend, React UI, Pierre Diffs and Trees. Requires Git, Rust and Node/npm to build; the release binary needs only Git.

```sh
make dev                 # open http://127.0.0.1:5173; reviews the current directory
./scripts/dev.sh /repo   # review another repository in development
make build               # builds server/target/release/readit with embedded UI
server/target/release/readit /path/to/repo
```

Click a diff line number to add a comment. Edit or delete comments in the review panel. Copy feedback to paste into an agent. The UI polls Git every two seconds; comments on changed files are flagged as potentially stale, not silently relocated. Drafts are stored in browser localStorage (comments scoped by repository path). Only textual working-tree changes are supported; binary files show an error. Git ignored files are excluded. Comparison is against HEAD, including staged, unstaged and untracked changes. No commits or files are modified.

`make test` type-checks the frontend and runs Rust tests. `READIT_NO_OPEN=1` prevents automatic browser launch; `READIT_PORT=3001` overrides the default random loopback port.
