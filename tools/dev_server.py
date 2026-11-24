"""
Local dev server that tells the browser never to cache, so a normal refresh
always shows the latest files (plain `python3 -m http.server` lets browsers
keep old copies of pages and CSS).

Usage (from repo root):  python3 tools/dev_server.py [port]   -> http://127.0.0.1:8080
"""

import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        # Never serve hidden files/folders (.git, .secrets, .env, ...)
        if any(part.startswith(".") for part in self.path.split("?")[0].split("/") if part):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    print(f"Serving {ROOT} at http://127.0.0.1:{port} (no caching)")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
