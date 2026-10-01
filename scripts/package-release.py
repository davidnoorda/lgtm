#!/usr/bin/env python3
"""Package a native release binary and record its SHA-256 checksum."""

import argparse
import hashlib
import pathlib
import re
import tarfile
import tomllib
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--version", required=True)
parser.add_argument("--target", required=True)
parser.add_argument("--os", choices=["linux", "macos", "windows"], required=True)
parser.add_argument("--arch", choices=["x86_64", "aarch64"], required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
version = tomllib.loads((root / "server/Cargo.toml").read_text())["package"]["version"]
if not re.fullmatch(r"v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", args.version) or args.version != f"v{version}":
    parser.error("Release tag must match the version in server/Cargo.toml")
name = "lgtm.exe" if args.os == "windows" else "lgtm"
binary = root / "server/target" / args.target / "release" / name
output = root / "release"
output.mkdir(exist_ok=True)
extension = "zip" if args.os == "windows" else "tar.gz"
archive = output / f"lgtm-{args.version}-{args.os}-{args.arch}.{extension}"
if args.os == "windows":
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        bundle.write(binary, name)
else:
    with tarfile.open(archive, "w:gz") as bundle:
        bundle.add(binary, arcname=name)
with archive.open("rb") as source:
    digest = hashlib.file_digest(source, "sha256").hexdigest()
(output / f"SHA256SUMS-{args.os}-{args.arch}.txt").write_text(f"{digest}  {archive.name}\n")
print(archive)
