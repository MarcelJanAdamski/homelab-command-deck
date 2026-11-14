import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)
import app  # noqa: E402  – darf beim Import weder Server noch Poller starten

INITIAL_STATE = {"ok": False, "stale": True, "error": "noch keine Daten", "fetched_at": None}
ATTRS = ("PORT", "DB", "KEY", "STATION", "STATION_NAME", "DEMO", "TZ", "POLL", "lock")


class Base(unittest.TestCase):
    """Isolierte Temp-DB, gesicherte Modulglobals, zurückgesetzter app.state."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._saved = {k: getattr(app, k) for k in ATTRS}
        app.DB = os.path.join(self.tmp.name, "prices.db")
        app.TZ = ZoneInfo("Europe/Berlin")
        self.reset_state()

    def tearDown(self):
        for k, v in self._saved.items():
            setattr(app, k, v)
        self.reset_state()
        self.tmp.cleanup()

    @staticmethod
    def reset_state():
        app.state.clear()
        app.state.update(INITIAL_STATE)

    def count(self, where="1=1"):
        with app.db() as c:
            return c.execute(f"SELECT COUNT(*) FROM prices WHERE {where}").fetchone()[0]

    def get(self, path):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), app.H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{srv.server_address[1]}{path}", timeout=5) as r:
                return json.loads(r.read())
        finally:
            srv.shutdown()
            srv.server_close()

    def import_env(self, expr, **env):
        """Importiert app in frischem Prozess mit genau diesen Umgebungsvariablen und wertet expr aus."""
        import subprocess
        keep = {k: v for k, v in os.environ.items()
                if k not in ("STATION_ID", "STATION_NAME", "TK_APIKEY", "DEMO", "DB_FILE", "POLL_SECONDS")}
        out = subprocess.run([sys.executable, "-c", f"import app; print(repr({expr}))"], cwd=ROOT,
                             env={**keep, **env}, capture_output=True, text=True, timeout=20)
        self.assertEqual(out.returncode, 0, out.stderr)
        return out.stdout.strip()
