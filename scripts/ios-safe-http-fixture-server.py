"""Synthetic HTTPS response fixture for an isolated Safe HTTP test network.

DNS64, private/mixed answers, certificate trust and proxy routing are set up
separately by the lab. No wallet data or payment endpoints are involved.
"""

import argparse
import gzip
import socket
import ssl
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Fixture URLs and request paths need not enter device/build logs.

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "https://localhost.invalid/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path in ("/timeout", "/slow"):
            time.sleep(2)
        if path == "/gzip":
            body = gzip.compress(b'{"ok":true}')
        elif path == "/text":
            body = "café".encode("utf-8")
        elif path in ("/oversized-no-length", "/oversized-false-length"):
            body = b"x" * 128
        elif path == "/malformed-length":
            body = b"x"
        else:
            body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "text/plain" if path == "/text" else "application/json")
        if path == "/gzip":
            self.send_header("Content-Encoding", "gzip")
        if path == "/oversized-false-length":
            self.send_header("Content-Length", "1")
        elif path == "/malformed-length":
            self.send_header("Content-Length", "100")
        elif path != "/oversized-no-length":
            self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(body)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        self.close_connection = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="::")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    args = parser.parse_args()
    class FixtureServer(ThreadingHTTPServer):
        address_family = socket.AF_INET6 if ":" in args.bind else socket.AF_INET

    server = FixtureServer((args.bind, args.port), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert, args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
