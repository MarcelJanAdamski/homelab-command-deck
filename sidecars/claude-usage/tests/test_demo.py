import http.client
import json
import re
import subprocess
import sys
import threading
import time
import unittest
import urllib.request
from datetime import datetime, timedelta, timezone
from unittest import mock

from helpers import ROOT, TOP_KEYS, WINDOW_KEYS, load_app, serve

T0 = datetime(2030, 3, 5, 14, 20, tzinfo=timezone.utc)   # fixed instant for the time-dependent tests


class ShapeTest(unittest.TestCase):
    def test_usage_shape(self):
        app = load_app(self)
        body = app.build_usage_response()
        self.assertEqual(set(body), TOP_KEYS)
        for w in ("session", "week"):
            self.assertEqual(set(body[w]), WINDOW_KEYS, w)
            self.assertIsInstance(body[w]["used"], float)
            self.assertIsInstance(body[w]["resets_at"], str)
            self.assertIsNotNone(datetime.fromisoformat(body[w]["resets_at"]).tzinfo, w)   # ISO with offset
        self.assertIs(body["ok"], True)
        self.assertIs(body["stale"], False)
        self.assertIsNone(body["error"])
        self.assertIs(body["demo"], True)
        self.assertIsNone(body["week_opus"])
        self.assertIsNone(body["week_sonnet"])
        for k in ("fetched_at", "server_time"):
            self.assertIsNotNone(datetime.fromisoformat(body[k]).tzinfo, k)


class ValuesTest(unittest.TestCase):
    def test_reset_lies_in_the_future_within_one_window(self):
        app = load_app(self)
        for step in range(0, 14 * 24 * 4):                       # two weeks in 15-minute steps
            now = T0 + timedelta(minutes=15 * step)
            s = app.demo_state(now)
            for w, length in (("session", 5 * 3600), ("week", 7 * 86400)):
                left = (datetime.fromisoformat(s[w]["resets_at"]) - now).total_seconds()
                self.assertGreater(left, 0, (w, now))
                self.assertLessEqual(left, length, (w, now))

    def test_values_stay_in_the_normal_range(self):
        """Below the 70 % warning threshold, always above 0 (the panel shows the warning states via #cldemo=)."""
        app = load_app(self)
        seen = {"session": set(), "week": set()}
        for step in range(0, 30 * 24 * 4):
            s = app.demo_state(T0 + timedelta(minutes=15 * step))
            for w in seen:
                u = s[w]["used"]
                self.assertGreater(u, 0, w)
                self.assertLess(u, 70, w)
                seen[w].add(int(u))
        self.assertGreater(len(seen["session"]), 20)   # values really wander
        self.assertGreater(len(seen["week"]), 20)

    def test_usage_grows_inside_a_window_and_restarts_in_the_next(self):
        app = load_app(self)
        t = datetime(2030, 3, 5, 0, 0, tzinfo=timezone.utc)
        vals = []
        for m in range(0, 24 * 60, 10):
            s = app.demo_state(t + timedelta(minutes=m))
            vals.append((s["session"]["resets_at"], s["session"]["used"]))
        by_window = {}
        for reset, used in vals:
            by_window.setdefault(reset, []).append(used)
        self.assertGreaterEqual(len(by_window), 4)             # a day holds 4-5 session windows
        for reset, us in by_window.items():
            self.assertEqual(us, sorted(us), reset)             # never decreases inside a window
        firsts = [us[0] for us in list(by_window.values())[1:]]   # the first window of the sample is entered mid-way
        self.assertLess(max(firsts), 20)                        # a new window starts low again

    def test_blocks_differ_from_each_other(self):
        app = load_app(self)
        finals = set()
        for i in range(30):
            now = T0 + timedelta(hours=5 * i, minutes=-1)
            finals.add(app.demo_state(now)["session"]["used"] // 3)
        self.assertGreater(len(finals), 3)

    def test_is_fresh_on_every_call(self):
        app = load_app(self)
        first = app.build_usage_response()
        time.sleep(0.01)
        second = app.build_usage_response()
        self.assertNotEqual(first["fetched_at"], second["fetched_at"])
        self.assertNotEqual(first["server_time"], second["server_time"])


class HttpTest(unittest.TestCase):
    def get(self, port, path):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        self.addCleanup(conn.close)
        conn.request("GET", path)
        r = conn.getresponse()
        return r.status, r.getheader("Content-Type"), json.loads(r.read())

    def test_endpoints(self):
        app = load_app(self)
        port = serve(self, app)
        for path in ("/usage", "/", "/usage?x=1"):
            status, ctype, d = self.get(port, path)
            self.assertEqual(status, 200, path)
            self.assertIn("application/json", ctype)
            self.assertEqual(set(d), TOP_KEYS)
        status, _, d = self.get(port, "/health")
        self.assertEqual((status, d), (200, {"ok": True, "demo": True, "poll_seconds": 180}))

    def test_unknown_path_is_404(self):
        app = load_app(self)
        port = serve(self, app)
        self.assertEqual(self.get(port, "/nope")[0], 404)

    def test_no_outgoing_requests(self):
        app = load_app(self)
        with mock.patch("urllib.request.urlopen") as net:
            port = serve(self, app)
            self.assertEqual(self.get(port, "/usage")[0], 200)
            self.assertEqual(self.get(port, "/health")[0], 200)
        net.assert_not_called()
        self.assertFalse({"urllib", "socket", "requests"} & set(vars(app)))   # no network client in the module


class StartTest(unittest.TestCase):
    def test_main_starts_server_once_and_no_thread(self):
        app = load_app(self)
        with mock.patch.object(app, "ThreadingHTTPServer") as srv, mock.patch.object(threading, "Thread") as thread:
            app.main()
        srv.assert_called_once_with(("0.0.0.0", 8080), app.H)
        srv.return_value.serve_forever.assert_called_once_with()
        thread.assert_not_called()

    def test_port_is_read_from_environment(self):
        for port, want in (("9124", 9124), (None, 8080), ("", 8080)):
            self.assertEqual(load_app(self, port).PORT, want, port)

    def test_import_has_no_side_effects(self):
        before = threading.active_count()
        load_app(self)
        self.assertEqual(threading.active_count(), before)

    def test_runs_as_a_script(self):
        out = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, %r); import app; print(app.demo_state()['ok'])" % str(ROOT)],
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(out.stdout.strip(), "True", out.stderr)


class SourceHygieneTest(unittest.TestCase):
    """The service is a pure demo: no sign-in data, no vendor endpoints, no network client in the code."""

    def test_app_py_has_no_credential_or_vendor_code(self):
        src = (ROOT / "app.py").read_text(encoding="utf-8")
        bad = ["o" + "auth", "refresh", "tok" + "en", "credential", "client" + "_id", "anthro" + "pic", "claude" + r"\.ai",
               "urllib" + r"\.request", "import " + "socket", "http" + r"\.client", "AUTH" + "_FILE", "/clau" + "de/"]
        for pat in bad:
            self.assertIsNone(re.search(pat, src, re.I), pat)

    def test_no_secret_files_or_mounts_in_the_sidecar_folder(self):
        df = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("USER app", df)
        self.assertNotIn("VOLUME", df)
        self.assertNotRegex(df, r"(?i)mkdir[^\n]*clau" + "de")


if __name__ == "__main__":
    unittest.main()
