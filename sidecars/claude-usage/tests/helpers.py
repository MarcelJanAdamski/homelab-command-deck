import importlib
import os
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Shape the panel reads (custom.js): both windows plus the status fields.
TOP_KEYS = {"ok", "stale", "error", "fetched_at", "server_time", "demo", "session", "week", "week_opus", "week_sonnet"}
WINDOW_KEYS = {"used", "resets_at"}


def load_app(test, port=None):
    """Imports app fresh; env and sys.modules['app'] are restored after the test."""
    env = mock.patch.dict(os.environ)
    env.start()
    test.addCleanup(env.stop)
    old = sys.modules.pop("app", None)

    def restore():
        sys.modules.pop("app", None)
        if old is not None:
            sys.modules["app"] = old
    test.addCleanup(restore)

    os.environ.pop("PORT", None)
    if port is not None:
        os.environ["PORT"] = port
    return importlib.import_module("app")


def serve(test, app):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), app.H)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    def stop():
        srv.shutdown()
        srv.server_close()
        t.join(5)
    test.addCleanup(stop)
    return srv.server_address[1]
