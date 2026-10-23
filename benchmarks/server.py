"""Minimal high-throughput local benchmark HTTP server."""

import http.server
import json
from typing import Any


class BenchmarkHandler(http.server.BaseHTTPRequestHandler):
    payload = json.dumps({"status": "ok", "message": "benchmark response", "size": 64}).encode("utf-8")

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.payload)))
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.wfile.write(self.payload)


def run_benchmark_server(port: int = 8999) -> None:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), BenchmarkHandler)
    print(f"Benchmark server listening on http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_benchmark_server()
