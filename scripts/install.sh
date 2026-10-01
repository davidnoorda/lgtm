#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' 'Usage: install.sh --repo OWNER/REPO [--version vX.Y.Z] [--dir PATH]' \
    'Defaults: latest published release; ~/.local/bin. Requires Git, curl and tar.'
}
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
repo="${LGTM_REPO:-}"
version=latest
install_dir="${LGTM_INSTALL_DIR:-$HOME/.local/bin}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo|--version|--dir)
      [ "$#" -ge 2 ] || fail "Missing value for $1"
      case "$1" in --repo) repo=$2 ;; --version) version=$2 ;; --dir) install_dir=$2 ;; esac
      shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail 'Set --repo OWNER/REPO (or LGTM_REPO).'
[ -n "$install_dir" ] || fail 'Installation directory cannot be empty.'
for cmd in git curl tar mktemp; do command -v "$cmd" >/dev/null || fail "Required command not found: $cmd"; done
case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  *) fail 'Supported systems: Linux and macOS. Use install.ps1 on Windows.' ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x86_64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) fail 'Supported architectures: x86_64 and ARM64.' ;;
esac
if command -v sha256sum >/dev/null; then
  checksum() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null; then
  checksum() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  fail 'Required command not found: sha256sum or shasum'
fi
fetch() { curl --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 10 --max-time 180 --retry 3 --fail --silent --show-error --location "$@"; }
if [ "$version" = latest ]; then
  resolved=$(fetch --head --output /dev/null --write-out '%{url_effective}' "https://github.com/$repo/releases/latest")
  case "$resolved" in
    "https://github.com/$repo/releases/tag/"*) version=${resolved##*/} ;;
    *) fail 'Cannot resolve the latest published release.' ;;
  esac
fi
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || fail 'Version must be a tag such as v0.1.0.'
asset="lgtm-$version-$os-$arch.tar.gz"
base="https://github.com/$repo/releases/download/$version"
tmp=$(mktemp -d)
staged=''
cleanup() { rm -rf "$tmp"; if [ -n "$staged" ]; then rm -f "$staged"; fi; }
trap cleanup EXIT
fetch --output "$tmp/$asset" "$base/$asset"
fetch --output "$tmp/SHA256SUMS" "$base/SHA256SUMS"
expected=$(awk -v asset="$asset" '$2 == asset {print $1}' "$tmp/SHA256SUMS")
[[ "$expected" =~ ^[0-9a-fA-F]{64}$ ]] || fail "Missing or invalid checksum for $asset"
actual=$(checksum "$tmp/$asset")
[ "$actual" = "$expected" ] || fail "Checksum mismatch for $asset; existing installation unchanged."
# Extract only the executable, never arbitrary archive paths.
tar -xzf "$tmp/$asset" -C "$tmp" lgtm
[ -f "$tmp/lgtm" ] && [ ! -L "$tmp/lgtm" ] || fail 'Archive does not contain a regular lgtm executable.'
chmod 755 "$tmp/lgtm"
[ "$("$tmp/lgtm" --version)" = "lgtm ${version#v}" ] || fail 'Downloaded executable has an unexpected version or cannot run.'
mkdir -p "$install_dir"
staged=$(mktemp "$install_dir/.lgtm-install.XXXXXX")
cp "$tmp/lgtm" "$staged"
chmod 755 "$staged"
mv -f "$staged" "$install_dir/lgtm"
staged=''
printf 'Installed %s to %s/lgtm\n' "$version" "$install_dir"
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) printf 'Add this directory to your PATH: %s\n' "$install_dir" ;;
esac
