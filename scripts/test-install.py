#!/usr/bin/env python3
"""Test the Unix installer against local release fixtures, with no network."""

import hashlib
import os
import pathlib
import platform
import subprocess
import sys
import tempfile
import tomllib

root = pathlib.Path(__file__).resolve().parent.parent
version = "v" + tomllib.loads((root / "server/Cargo.toml").read_text())["package"]["version"]
os_name = "macos" if platform.system() == "Darwin" else "linux"
arch = "aarch64" if platform.machine() in ("aarch64", "arm64") else "x86_64"
asset = f"lgtm-{version}-{os_name}-{arch}.tar.gz"
archive = root / "release" / asset
assert archive.is_file(), f"Package the native release first: {archive}"
with tempfile.TemporaryDirectory(prefix="lgtm-install-test-") as directory:
    temp = pathlib.Path(directory)
    mocks = temp / "mock-bin"
    mocks.mkdir()
    curl = mocks / "curl"
    curl.write_text(f"#!{sys.executable}\n" + '''import os, pathlib, sys
args = sys.argv[1:]
assert '--proto' in args and args[args.index('--proto') + 1] == '=https'
if os.environ.get('TEST_FAILED_DOWNLOAD'):
    sys.exit(22)
if '--head' in args:
    print('https://github.com/test/lgtm/releases/tag/' + os.environ['TEST_VERSION'], end='')
    sys.exit(0)
url = args[-1]
assert url.startswith('https://github.com/test/lgtm/releases/download/' + os.environ['TEST_VERSION'] + '/')
out = pathlib.Path(args[args.index('--output') + 1])
if url.endswith('/SHA256SUMS'):
    out.write_text('' if os.environ.get('TEST_MISSING_CHECKSUM') else os.environ['TEST_CHECKSUM'])
else:
    out.write_bytes(b'corrupted' if os.environ.get('TEST_CORRUPT_DOWNLOAD') else pathlib.Path(os.environ['TEST_ARCHIVE']).read_bytes())
''')
    curl.chmod(0o755)
    install_dir = temp / "installation with spaces"
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    env = dict(os.environ, PATH=str(mocks) + os.pathsep + os.environ["PATH"], TEST_VERSION=version, TEST_ARCHIVE=str(archive), TEST_CHECKSUM=f"{digest}  {asset}\n")
    command = ["bash", str(root / "scripts/install.sh"), "--repo", "test/lgtm", "--dir", str(install_dir)]
    for options in ([], ["--version", version]):
        subprocess.run(command + options, env=env, check=True)
        installed = install_dir / "lgtm"
        assert subprocess.check_output([str(installed), "--version"], text=True).strip() == "lgtm " + version[1:]
    before = installed.read_bytes()
    for failure in ("TEST_CORRUPT_DOWNLOAD", "TEST_MISSING_CHECKSUM", "TEST_FAILED_DOWNLOAD"):
        result = subprocess.run(command, env=dict(env, **{failure: "1"}), capture_output=True, text=True)
        assert result.returncode != 0, f"Installer accepted {failure}"
        assert installed.read_bytes() == before, f"Installer damaged existing binary for {failure}"
        assert not list(install_dir.glob(".lgtm-install.*"))
    print("Unix installer tests passed")
