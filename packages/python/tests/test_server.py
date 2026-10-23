import base64
import gzip
import http.server
import json
import socket
import threading
import time
import urllib.parse
import zlib
from typing import Any, Dict, Optional, Tuple


class LocalHttpServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


class LocalHandler(http.server.BaseHTTPRequestHandler):
    retry_counts: Dict[str, int] = {}

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_GET(self) -> None:
        self.handle_any_method()

    def do_POST(self) -> None:
        self.handle_any_method()

    def do_PUT(self) -> None:
        self.handle_any_method()

    def do_PATCH(self) -> None:
        self.handle_any_method()

    def do_DELETE(self) -> None:
        self.handle_any_method()

    def do_HEAD(self) -> None:
        self.handle_any_method()

    def do_OPTIONS(self) -> None:
        self.handle_any_method()

    def handle_any_method(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        if path == "/echo":
            headers_dict = {k: v for k, v in self.headers.items()}
            payload = json.dumps(
                {
                    "method": self.command,
                    "url": self.path,
                    "headers": headers_dict,
                    "body": body.decode("utf-8", errors="replace"),
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
            return

        if path == "/json":
            parsed_json = json.loads(body.decode("utf-8")) if body else None
            payload = json.dumps({"received": parsed_json}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
            return

        if path == "/cookies":
            req_cookie = self.headers.get("Cookie", "")
            payload = json.dumps({"receivedCookie": req_cookie}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", "session_id=py123xyz; Path=/; HttpOnly")
            self.send_header("Set-Cookie", "theme=light; Path=/; Domain=127.0.0.1")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
            return

        if path == "/redirect-start":
            target = query.get("target", ["/redirect-target"])[0]
            status = int(query.get("status", ["302"])[0])
            self.send_response(status)
            self.send_header("Location", target)
            self.end_headers()
            return

        if path == "/redirect-target":
            payload = json.dumps({"success": True, "method": self.command}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
            return

        if path == "/redirect-loop":
            self.send_response(302)
            self.send_header("Location", "/redirect-loop")
            self.end_headers()
            return

        if path == "/slow":
            delay = float(query.get("delay", ["2.0"])[0])
            time.sleep(delay)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"slow finished")
            return

        if path == "/flaky":
            key = query.get("key", ["default"])[0]
            count = self.retry_counts.get(key, 0) + 1
            self.retry_counts[key] = count

            if count < 3:
                self.send_response(503)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Retry-After", "0")
                self.end_headers()
                self.wfile.write(b"temporary failure")
            else:
                payload = json.dumps({"attempts": count, "recovered": True}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            return

        if path == "/gzip":
            raw_payload = json.dumps({"message": "python gzip payload", "valid": True}).encode("utf-8")
            compressed = gzip.compress(raw_payload)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(compressed)))
            self.end_headers()
            self.wfile.write(compressed)
            return

        if path == "/deflate":
            raw_payload = json.dumps({"message": "python deflate payload"}).encode("utf-8")
            compressed = zlib.compress(raw_payload)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Encoding", "deflate")
            self.send_header("Content-Length", str(len(compressed)))
            self.end_headers()
            self.wfile.write(compressed)
            return

        if path == "/large":
            size = int(query.get("size", ["1048576"])[0])
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.end_headers()
            chunk = b"A" * 8192
            sent = 0
            while sent < size:
                to_send = min(len(chunk), size - sent)
                self.wfile.write(chunk[:to_send])
                sent += to_send
            return

        if path == "/truncated":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", "1000")
            self.end_headers()
            self.wfile.write(b"short payload")
            self.close_connection = True
            return

        self.send_response(404)
        self.end_headers()


class LocalProxyHandler(http.server.BaseHTTPRequestHandler):
    expected_auth: Optional[Tuple[str, str]] = None
    captured_requests = []

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_CONNECT(self) -> None:
        self.captured_requests.append(
            {"method": "CONNECT", "path": self.path, "headers": dict(self.headers)}
        )

        if self.expected_auth:
            proxy_auth = self.headers.get("Proxy-Authorization")
            cred = f"{self.expected_auth[0]}:{self.expected_auth[1]}"
            expected = f"Basic {base64.b64encode(cred.encode()).decode()}"
            if proxy_auth != expected:
                self.send_response(407)
                self.send_header("Proxy-Authenticate", 'Basic realm="Test"')
                self.end_headers()
                return

        host, port_str = self.path.split(":")
        port = int(port_str)

        try:
            upstream = socket.create_connection((host, port))
        except Exception:
            self.send_error(502)
            return

        self.send_response(200, "Connection Established")
        self.end_headers()

        def forward(source: socket.socket, destination: socket.socket) -> None:
            try:
                while True:
                    data = source.recv(8192)
                    if not data:
                        break
                    destination.sendall(data)
            except Exception:
                pass
            finally:
                source.close()
                destination.close()

        client_sock = self.connection
        t1 = threading.Thread(target=forward, args=(client_sock, upstream), daemon=True)
        t2 = threading.Thread(target=forward, args=(upstream, client_sock), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

    def handle_forward(self) -> None:
        self.captured_requests.append(
            {"method": self.command, "path": self.path, "headers": dict(self.headers)}
        )

        if self.expected_auth:
            proxy_auth = self.headers.get("Proxy-Authorization")
            cred = f"{self.expected_auth[0]}:{self.expected_auth[1]}"
            expected = f"Basic {base64.b64encode(cred.encode()).decode()}"
            if proxy_auth != expected:
                self.send_response(407)
                self.send_header("Proxy-Authenticate", 'Basic realm="Test"')
                self.end_headers()
                return

        parsed = urllib.parse.urlparse(self.path)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 80

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        req_headers = {k: v for k, v in self.headers.items() if k.lower() != "proxy-authorization"}
        req_headers["Host"] = host

        conn = http.client.HTTPConnection(host, port)
        rel_path = parsed.path
        if parsed.query:
            rel_path = f"{rel_path}?{parsed.query}"

        conn.request(self.command, rel_path, body=body, headers=req_headers)
        upstream_resp = conn.getresponse()

        self.send_response(upstream_resp.status, upstream_resp.reason)
        for h_k, h_v in upstream_resp.getheaders():
            self.send_header(h_k, h_v)
        self.end_headers()
        self.wfile.write(upstream_resp.read())
        conn.close()

    def do_GET(self) -> None:
        self.handle_forward()

    def do_POST(self) -> None:
        self.handle_forward()


class ServerRunner:
    """Helper to start and stop local HTTP test servers."""

    def __init__(self, is_proxy: bool = False, auth: Optional[Tuple[str, str]] = None) -> None:
        self.is_proxy = is_proxy
        self.auth = auth
        handler_cls = LocalProxyHandler if is_proxy else LocalHandler
        if is_proxy and auth:
            handler_cls.expected_auth = auth
        if is_proxy:
            handler_cls.captured_requests = []

        self.server = LocalHttpServer(("127.0.0.1", 0), handler_cls)
        self.port = self.server.server_address[1]
        self.url = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self) -> "ServerRunner":
        self.thread.start()
        return self

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()
