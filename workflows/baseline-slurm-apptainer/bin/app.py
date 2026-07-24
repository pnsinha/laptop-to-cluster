#!/usr/bin/env python3
"""HTTP dashboard for the Compose2HPC reference workflow."""
import argparse, json, os, glob, time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HTML = """<!DOCTYPE html>
<html><head><title>Compose2HPC Dashboard</title>
<meta http-equiv="refresh" content="3">
<style>
body {{ font-family: sans-serif; margin: 40px; background: #f5f5f5; }}
h1 {{ color: #333; }}
.stats {{ display: flex; gap: 20px; }}
.card {{ background: white; padding: 20px 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
.number {{ font-size: 48px; font-weight: bold; }}
.label {{ color: #666; font-size: 14px; text-transform: uppercase; }}
.pending {{ color: #f39c12; }}
.done {{ color: #27ae60; }}
.processing {{ color: #3498db; }}
</style></head><body>
<h1>Compose2HPC Task Queue</h1>
<div class="stats">
<div class="card"><div class="number pending">{pending}</div><div class="label">Pending</div></div>
<div class="card"><div class="number processing">{processing}</div><div class="label">Processing</div></div>
<div class="card"><div class="number done">{done}</div><div class="label">Completed</div></div>
</div>
<p style="color:#999">Updated: {timestamp}</p>
</body></html>"""

class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._respond(200, "ok\n", "text/plain")
        elif path == "/" or path == "/index.html":
            html = HTML.format(**self.server.collect_stats())
            self._respond(200, html, "text/html")
        elif path == "/api/stats":
            data = json.dumps(self.server.collect_stats(), indent=2) + "\n"
            self._respond(200, data, "application/json")
        else:
            self._respond(404, '{"error":"not found"}\n', "application/json")
    def _respond(self, code, body, ct):
        self.send_response(code)
        self.send_header("Content-Type", ct)
        self.end_headers()
        self.wfile.write(body.encode())
    def log_message(self, *a): pass

class StatsServer(HTTPServer):
    def __init__(self, addr, handler, tasks_dir, results_dir):
        super().__init__(addr, handler)
        self.tasks_dir = tasks_dir
        self.results_dir = results_dir
    def collect_stats(self):
        pending = len(glob.glob(os.path.join(self.tasks_dir, "*.json")))
        proc_dir = os.path.join(os.path.dirname(self.tasks_dir), "processing")
        processing = len(glob.glob(os.path.join(proc_dir, "*.json"))) if os.path.isdir(proc_dir) else 0
        done = len(glob.glob(os.path.join(self.results_dir, "*.json")))
        return {"pending": pending, "processing": processing, "done": done, "total": pending+processing+done, "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")}

def main():
    ap = argparse.ArgumentParser(description="Compose2HPC Dashboard")
    ap.add_argument("--tasks-dir", required=True)
    ap.add_argument("--results-dir", required=True)
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()
    server = StatsServer((args.host, args.port), DashboardHandler, args.tasks_dir, args.results_dir)
    print(f"[dashboard] Listening on {args.host}:{args.port}", flush=True)
    server.serve_forever()

if __name__ == "__main__": main()
