#!/usr/bin/env python3
"""
Reel timeline visualizer — Python server (standard library only, no deps).

Serves the web UI and a tiny API that runs the `ReelToJson` listener on a
.reel file and returns its JSON timeline, so the editor/montazhnik sees the
structure of the video as a timeline.

    GET /                          -> index.html
    GET /app.js  /style.css ...    -> static assets (from this folder)
    GET /api/examples              -> ["examples/minecraft/01_speedrun.reel", ...]
    GET /api/parse?file=PATH       -> JSON timeline produced by ReelToJson

Run:   python3 viz/server.py        (then open http://localhost:8000)
Env:   PORT (default 8000), ANTLR_JAR (override auto-detected jar)
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))         # viz/
REPO_ROOT = os.path.dirname(HERE)                          # project root
EXAMPLES_ROOT = os.path.join(REPO_ROOT, "examples")
PORT = int(os.environ.get("PORT", "8000"))

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json",
}


def find_antlr_jar() -> str | None:
    cands = []
    if os.environ.get("ANTLR_JAR"):
        cands.append(os.environ["ANTLR_JAR"])
    cands += glob.glob("/opt/homebrew/Cellar/antlr/*/antlr-*-complete.jar")
    cands += glob.glob("/usr/local/lib/antlr-*-complete.jar")
    cands += glob.glob(os.path.expanduser("~/antlr-*-complete.jar"))
    return next((c for c in cands if os.path.isfile(c)), None)


ANTLR_JAR = find_antlr_jar()


def ensure_built() -> None:
    """Compile the parser + listener if not already built."""
    if os.path.isfile(os.path.join(REPO_ROOT, "ReelToJson.class")):
        return
    subprocess.run(["make", "-C", REPO_ROOT], capture_output=True, timeout=120)


def parse_reel(rel_path: str) -> tuple[bool, object]:
    """Run `java -cp JAR:ROOT ReelToJson <file>`; return (ok, data)."""
    ensure_built()
    abs_path = rel_path if os.path.isabs(rel_path) else os.path.join(REPO_ROOT, rel_path)
    if not os.path.isfile(abs_path):
        return False, {"error": f"file not found: {rel_path}"}
    if not ANTLR_JAR:
        return False, {"error": "ANTLR jar not found — set ANTLR_JAR env var"}

    proc = subprocess.run(
        ["java", "-cp", f"{ANTLR_JAR}:{REPO_ROOT}", "ReelToJson", abs_path],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0:
        return False, {"error": "ReelToJson failed",
                       "stderr": (proc.stderr or "")[-2000:].strip()}
    try:
        return True, json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return False, {"error": f"invalid JSON from listener: {exc}",
                       "stdout": proc.stdout[-2000:]}


def list_examples() -> list[str]:
    out = []
    for root, _dirs, files in os.walk(EXAMPLES_ROOT):
        if os.path.basename(root) == "broken":
            continue
        for f in files:
            if f.endswith(".reel"):
                out.append(os.path.relpath(os.path.join(root, f), REPO_ROOT))
    return sorted(out)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode(),
                   "application/json; charset=utf-8")

    def _static(self, name: str):
        # serve only flat files from viz/ (no traversal, no subdirs)
        if "/" in name or ".." in name or name.startswith("."):
            return self._send(403, b"forbidden", "text/plain")
        fpath = os.path.join(HERE, name)
        if not os.path.isfile(fpath):
            return self._send(404, b"not found", "text/plain")
        with open(fpath, "rb") as fh:
            self._send(200, fh.read(), _MIME.get(os.path.splitext(name)[1],
                       "application/octet-stream"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path, q = parsed.path, urllib.parse.parse_qs(parsed.query)

        if path in ("/", "/index.html"):
            return self._static("index.html")
        if path == "/api/examples":
            return self._json(list_examples())
        if path == "/api/parse":
            files = q.get("file", [])
            if not files:
                return self._json({"error": "missing ?file="}, 400)
            ok, data = parse_reel(files[0])
            return self._json(data, 200 if ok else 500)
        return self._static(path.lstrip("/"))

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()}  {fmt % args}")


def main():
    print(f"Reel visualizer  →  http://localhost:{PORT}")
    print(f"  repo:   {REPO_ROOT}")
    print(f"  jar:    {ANTLR_JAR or '(NOT FOUND — set ANTLR_JAR)'}")
    print(f"  examples: {len(list_examples())} .reel files")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
