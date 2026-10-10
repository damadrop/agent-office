#!/usr/bin/env python3
"""lt-bridge: one localtunnel wire slot.
Opens a TCP connection to the localtunnel server THROUGH the egress HTTP proxy
(manual CONNECT, since some tools don't use the proxy), connects to the local
service port, and bidirectionally pipes bytes until either side closes, then
reconnects forever. localtunnel's wire protocol is a plain pipe — no handshake.
Usage: lt-bridge.py <local_port> <remote_host> <remote_port>
"""
import socket
import select
import sys
import os
import base64
import urllib.parse
import time


def parse_proxy():
    u = urllib.parse.urlparse(os.environ.get("HTTPS_PROXY", ""))
    return (
        u.hostname,
        u.port or 3128,
        urllib.parse.unquote(u.username or ""),
        urllib.parse.unquote(u.password or ""),
    )


def connect_via_proxy(target_host, target_port):
    phost, pport, puser, ppass = parse_proxy()
    s = socket.create_connection((phost, pport), timeout=20)
    auth = base64.b64encode(f"{puser}:{ppass}".encode()).decode()
    req = (
        f"CONNECT {target_host}:{target_port} HTTP/1.1\r\n"
        f"Host: {target_host}:{target_port}\r\n"
        f"Proxy-Authorization: Basic {auth}\r\n"
        f"Proxy-Connection: Keep-Alive\r\n"
        f"\r\n"
    )
    s.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = s.recv(4096)
        if not chunk:
            s.close()
            raise Exception("proxy closed during CONNECT")
        resp += chunk
        if len(resp) > 16384:
            s.close()
            raise Exception("proxy response too large")
    status = resp.split(b"\r\n", 1)[0]
    if b" 200" not in status:
        s.close()
        raise Exception(f"CONNECT failed: {status!r}")
    return s


def run_slot(local_port, remote_host, remote_port):
    tag = f"{local_port}<->{remote_host}:{remote_port}"
    backoff = 3
    while True:
        upstream = None
        local = None
        try:
            upstream = connect_via_proxy(remote_host, remote_port)
            local = socket.create_connection(("127.0.0.1", local_port), timeout=15)
            print(f"[bridge] {tag} connected", flush=True)
            for sock in (upstream, local):
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
                sock.setblocking(False)
            backoff = 3  # reset on success
            pair = {upstream: local, local: upstream}
            while True:
                r, _, _ = select.select([upstream, local], [], [], 120)
                for sock in r:
                    data = sock.recv(65536)
                    if not data:
                        raise Exception("peer closed")
                    pair[sock].sendall(data)
        except Exception as e:
            print(f"[bridge] {tag}: {e} — reconnecting in {backoff}s", flush=True)
        finally:
            for sock in (upstream, local):
                try:
                    if sock:
                        sock.close()
                except Exception:
                    pass
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    run_slot(int(sys.argv[1]), sys.argv[2], int(sys.argv[3]))
