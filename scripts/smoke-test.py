#!/usr/bin/env python3
"""Exercise a built executable without touching the user's LGTM data."""

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

binary = str(pathlib.Path(sys.argv[1]).resolve())
subprocess.run([binary, "--version"], check=True)
subprocess.run([binary, "--help"], check=True, stdout=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix="lgtm-smoke-") as temporary:
    root = pathlib.Path(temporary)
    repo = root / "repo"
    repo.mkdir()
    subprocess.run(["git", "-c", "init.templateDir=", "init", "-q", str(repo)], check=True)
    (repo / "hello.txt").write_text("hello\n")
    env = dict(os.environ, LGTM_RUNTIME_DIR=str(root / "runtime"), LGTM_STATE_DIR=str(root / "state"), LGTM_NO_OPEN="1", LGTM_PORT="0")
    log = (root / "server.log").open("w+")
    server = subprocess.Popen([binary, "serve"], env=env, stdout=log, stderr=log)
    try:
        discovery = root / "runtime/lgtm-server.json"
        deadline = time.monotonic() + 20
        while True:
            if server.poll() is not None:
                log.seek(0)
                raise RuntimeError(log.read())
            try:
                info = json.loads(discovery.read_text())
                break
            except (OSError, ValueError):
                if time.monotonic() > deadline:
                    raise RuntimeError("Server did not become ready")
                time.sleep(0.1)
        # Ignore environment proxies for local smoke tests, as the app itself does.
        http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with http.open(info["url"]) as response:
            assert response.status == 200
            assert b"<html" in response.read()
        request = urllib.request.Request(info["url"] + "/api/register", data=str(repo).encode())
        try:
            http.open(request)
            raise AssertionError("Unauthenticated registration succeeded")
        except urllib.error.HTTPError as error:
            assert error.code == 401
        for _ in range(2):
            opened = subprocess.run([binary, "open", str(repo), "--changes"], env=env, capture_output=True, text=True, timeout=10, check=True)
            assert opened.stdout.strip() == info["url"] + "/r/repo/files?changed=1", opened.stdout
        with http.open(info["url"] + "/api/r/repo/contents/hello.txt") as response:
            assert json.load(response)["new"] == "hello\n"
        duplicate = subprocess.run([binary, "serve"], env=env, capture_output=True, text=True, timeout=10)
        assert duplicate.returncode != 0, "Second server acquired the same lock"
        assert "already running" in duplicate.stderr
        print("Executable smoke tests passed")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
        log.close()
