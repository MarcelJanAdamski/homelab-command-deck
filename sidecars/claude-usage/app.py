"""claude-usage (demo) - synthetic data source for the AI-usage panel ("KI-Kontingent"). Python standard library only.

This service ALWAYS serves made-up numbers. It reads no sign-in data, calls no external service and
needs no network. A real data source is intentionally not included (see README.md).

Endpoints
  GET /usage (or /)  ->  {"ok", "stale", "error", "fetched_at", "server_time", "demo": true,
                          "session": {"used", "resets_at"}, "week": {"used", "resets_at"},
                          "week_opus": null, "week_sonnet": null}
  GET /health        ->  {"ok": true, "demo": true, "poll_seconds": 180}

"used" is a percentage (0-100), "resets_at" an ISO-8601 timestamp with UTC offset - the shape the
panel in custom.js reads. The numbers move with the clock: the 5-hour session window and the 7-day
week window are aligned to fixed UTC blocks, usage grows inside a block and starts over in the next
one. Every block ends below the 70 % warning threshold (use #cldemo=warn|crit for the warning states).
"""
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8080") or "8080")
POLL = 180            # only reported in /health, nothing is polled
SESSION_S = 5 * 3600  # length of the session window
WEEK_S = 7 * 86400    # length of the week window


def _h(tag, block):
    return int.from_bytes(hashlib.sha256(("%s:%d" % (tag, block)).encode()).digest()[:4], "big")


def _window(now, length, tag, start, span, curve):
    """Window aligned to UTC blocks of `length` seconds -> {"used", "resets_at"}."""
    t = now.timestamp()
    block = int(t // length)
    progress = (t - block * length) / length
    final = start + _h(tag, block) % span                  # where this block ends up (always < 70)
    used = 4 + (final - 4) * progress ** curve
    reset = datetime.fromtimestamp((block + 1) * length, timezone.utc)
    return {"used": round(used, 1), "resets_at": reset.isoformat()}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def demo_state(now=None):
    now = now or datetime.now(timezone.utc)
    return {"ok": True, "stale": False, "error": None, "fetched_at": now.isoformat(),
            "session": _window(now, SESSION_S, "session", 35, 30, 0.9),
            "week": _window(now, WEEK_S, "week", 40, 25, 1.1),
            "week_opus": None, "week_sonnet": None}


def build_usage_response():
    return dict(demo_state(), server_time=now_iso(), demo=True)


class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        b = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/usage", "/"):
            self._send(200, build_usage_response())
        elif p == "/health":
            self._send(200, {"ok": True, "demo": True, "poll_seconds": POLL})
        else:
            self._send(404, {"error": "not found"})

    def log_message(self, *a):
        pass


def main():
    print("claude-usage (demo data only) listening on :%d" % PORT, flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()


if __name__ == "__main__":
    main()
