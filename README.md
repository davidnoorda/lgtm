# LGTM

Local, read-only repository review. Rust backend, React UI, Pierre Diffs and Trees. The prebuilt binary requires only Git; building from source requires Rust 1.89+ and Node 22+/npm. The frontend is embedded in the binary.

## Install

Releases support Linux and macOS 12+ (x86_64 and ARM64), and Windows 10+ (x86_64). Linux binaries use musl, avoiding a dependency on a particular glibc version. Windows builds statically link the C runtime, so no Visual C++ redistributable is needed. Install Git first; no Rust or Node installation is needed.

Releases are hosted at [davidnoorda/lgtm](https://github.com/davidnoorda/lgtm). The installers download public release assets without authentication; for a private repository, download manually using authenticated GitHub access. Download the installer from a **published release**, inspect it, then run it:

### Linux / macOS

```sh
curl --proto '=https' --tlsv1.2 -fsSL -o install.sh https://github.com/davidnoorda/lgtm/releases/latest/download/install.sh
bash install.sh --repo davidnoorda/lgtm
# Pin a release or choose another directory:
bash install.sh --repo davidnoorda/lgtm --version v0.1.0 --dir "$HOME/.local/bin"
```

The default directory is `~/.local/bin`. The installer prints a PATH reminder if needed; it does not edit shell configuration. Requires curl, tar, and either sha256sum (Linux) or shasum (macOS).

### Windows (PowerShell)

```powershell
Invoke-WebRequest -UseBasicParsing https://github.com/davidnoorda/lgtm/releases/latest/download/install.ps1 -OutFile install.ps1
# Review install.ps1 before running it. If local execution policy requires it:
Unblock-File ./install.ps1
./install.ps1 -Repo davidnoorda/lgtm -AddToPath
# Pin a release or choose another directory:
./install.ps1 -Repo davidnoorda/lgtm -Version v0.1.0 -InstallDir "$env:LOCALAPPDATA\Programs\lgtm\bin"
```

Requires Windows PowerShell 5.1+ and Git for Windows on PATH. The default directory is `%LOCALAPPDATA%\Programs\lgtm\bin`. `-AddToPath` updates the current session and the user PATH for future terminals; it never changes the system PATH. If your local policy blocks scripts, run the reviewed, unblocked installer in a new process with `powershell -NoProfile -ExecutionPolicy RemoteSigned -File ./install.ps1 -Repo davidnoorda/lgtm -AddToPath`, then open a new terminal. This does not change the permanent execution policy; organization policies may still require administrator approval.

Both installers verify the archive against the release's `SHA256SUMS`, check the executable's version, and stage it before replacing an existing installation. Close a running instance before upgrading, especially on Windows. `LGTM_REPO` and `LGTM_INSTALL_DIR` can supply defaults. Latest means the latest published non-prerelease; prereleases require an explicit version.

Alternatively, download the matching archive and `SHA256SUMS`, verify the archive's SHA-256, extract `lgtm`/`lgtm.exe`, and put it on PATH. Checksums detect corrupted downloads but are not signatures; use releases from a repository you trust. Initial releases are unsigned and not notarized, so OS security warnings are possible.

To uninstall, remove the executable and any PATH entry you added. Your saved repositories and browser-local annotations are retained.

## Usage

```sh
make dev                 # open http://127.0.0.1:5173; select a registered repo
./scripts/dev.sh /repo   # review another repository in development
make build               # builds server/target/release/lgtm with embedded UI

lgtm serve               # start the local server in the foreground
lgtm open .              # register this repo and open its repository view
lgtm open /another/repo --changes  # open with Changed only enabled
lgtm .                   # shorthand for open; starts serving if none is running
```

Use `server/target/release/lgtm` in place of `lgtm` if it isn't on your PATH. If no server is running, `open` starts one **in the foreground**; keep that terminal running. Subsequent commands register folders with it and exit. Multiple repositories can be open in separate browser tabs. Registration resolves the Git root and deduplicates canonical paths. Repository URLs use a readable folder-name slug, such as `/r/readit/files`; collisions get `-2`, `-3`, etc. Existing opaque IDs remain valid as legacy aliases. Repositories persist in the platform's user-data directory (see below). Registration requires a random local token stored in a private runtime directory (mode 0600 on Unix; inherited user-profile ACLs on Windows). Only one server runs per runtime directory; development uses a separate discovery directory.

## Views and URLs

- `/` — registered repositories.
- `/r/:id/files` — repository tree with Git status, including tracked, untracked non-ignored, and deleted paths.
- `/r/:id/files?changed=1` — the same tree filtered to staged, unstaged and untracked working changes against HEAD.
- `/r/:id/files/path/to/file` — a working diff for a changed file, otherwise full-file contents.
- `/r/:id/files/path/to/file?view=file` — full-file contents and annotations; changed files also have Diff / Full file buttons.
- `/scratch/new` — creates a browser-local scratch document and replaces the URL with `/scratch/:id`.

Deep links, refresh and browser back/forward are supported. Use a fixed `LGTM_PORT` if you want bookmarks to survive server restarts. Branch comparisons are not implemented yet.

Click or drag file/diff line numbers to select code and add a comment. Full-file and diff annotations have separate coordinates. Opening a full-file comment selects Full file even when the file has changes. Comments whose diff is no longer available (for example, after a commit) remain in the review panel and are flagged as potentially stale. Edit or delete comments in the review panel; copy feedback to paste into an agent. The UI polls Git every two seconds. Comments on modified files are flagged as potentially stale, not silently relocated. Drafts are stored in browser localStorage, scoped by repository ID. Text files only; ignored files are excluded and paths outside registered repositories are rejected. No repository files or commits are modified.

## Scratch

Paste free text or Markdown source into the scratch editor, highlight any text, and add a comment. Annotations store the exact quote and character range, not line numbers. Edits outside a selection shift its range; edits touching the selected text mark the annotation as detached. “Show selection” highlights an attached annotation again. Markdown is currently edited as source, not rendered. Scratch documents and their annotations are browser-local; their URLs do not share the document across machines or browser profiles.

## Development checks

Install frontend dependencies with `cd web && npm ci`. Rust formatting requires rustfmt (`rustup component add rustfmt` when using rustup). To build without Make (for example, in Windows PowerShell), run `npm ci` and `npm run build` inside `web/`, then `cargo build --locked --release --manifest-path server/Cargo.toml` from the repository root.

```sh
make format             # format web/ with Prettier and server/ with rustfmt
make format-check       # check formatting without modifying files (also runs in CI)
make test               # run frontend checks and Rust tests
```

Run these commands before submitting changes. Coding agents should follow `AGENTS.md`; editor format-on-save is optional. Prettier uses its defaults, with generated output and the npm lockfile excluded.

`make test` type-checks the frontend and runs repository-view regression tests and Rust tests. `LGTM_NO_OPEN=1` prevents automatic browser launch; `LGTM_PORT=3001` overrides the default random loopback port. `LGTM_RUNTIME_DIR` and `LGTM_STATE_DIR` override the discovery and persistent-data directories, primarily for isolated development/testing; keep them private to your user.

Default locations:

| Platform | Persistent data | Runtime discovery |
| --- | --- | --- |
| Linux | `$XDG_STATE_HOME/lgtm` or `~/.local/state/lgtm` | `$XDG_RUNTIME_DIR/lgtm`, falling back to `<data>/runtime` |
| macOS | `~/Library/Application Support/lgtm` | `<data>/runtime` |
| Windows | `%LOCALAPPDATA%\lgtm` | `<data>\runtime` |

Each persistent-data directory contains `repositories.json`. Older Linux builds placed discovery files directly in `$XDG_RUNTIME_DIR`; stop the old server before upgrading. Unix runtime/data directories are mode 0700. Windows defaults use the current user's profile permissions; do not override them with a shared directory.

## Publishing a release

The `Build and release` workflow builds and tests all five native targets on pull requests, pushes to `main`, and manual runs. Only a pushed `v*` tag publishes a **draft** GitHub release, after every target passes. GitHub-hosted ARM runners require a public repository; private repositories may need compatible self-hosted runners or paid runner configuration.

1. Set the version in `server/Cargo.toml`, update `server/Cargo.lock` with `cargo check --manifest-path server/Cargo.toml`, and commit it with your changes.
2. Run `make format`, `make format-check`, and `make test` locally.
3. Push the commit and a matching tag (for example, `git tag v0.1.0 && git push origin v0.1.0`). The tag must match the Cargo package version; prerelease tags such as `v0.2.0-beta.1` are supported.
4. Review the draft release and its generated notes, download and try the binaries, then publish it. Installers cannot access draft release assets. Tags containing a prerelease suffix create a prerelease draft.

Assets are named `lgtm-v<version>-<linux|macos|windows>-<x86_64|aarch64>.<tar.gz|zip>`. Releases include both installers and a combined `SHA256SUMS`. Manual/branch builds upload the same packages as workflow artifacts without publishing a release. Signing, notarization, Homebrew, and WinGet distribution are not yet configured.

For an executable smoke test after building: `python scripts/smoke-test.py server/target/release/lgtm` (use `lgtm.exe` on Windows). Release packaging and smoke/installer tests require Python 3.11+. CI also tests fresh installs, upgrades, version pinning, and download/checksum failures without contacting a release server.
