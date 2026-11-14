import json
import os
import sqlite3
import unittest
from unittest import mock

from tests.base import ROOT, Base, app


class MissingConfig(Base):
    def test_missing_station_reports_error(self):
        app.KEY, app.STATION, app.DEMO = "", "", False
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("kein Netz erlaubt")) as net:
            app.poll_once()
            net.assert_not_called()
        body = self.get("/health")
        self.assertIs(body["ok"], False)
        self.assertEqual(body["error"], "STATION_ID/TK_APIKEY fehlt")
        self.assertNotIn("demo", body)

    def test_missing_key_only_reports_error(self):
        app.KEY, app.STATION, app.DEMO = "", "irgendeine-id", False
        self.assertEqual(self.get("/health")["error"], "STATION_ID/TK_APIKEY fehlt")

    def test_defaults_contain_no_personal_values(self):
        self.assertEqual(self.import_env("(app.STATION, app.STATION_NAME, app.DEMO)"),
                         repr(("", "Tankstelle", False)))


class Env(Base):
    def test_demo_flag_values(self):
        for v in ("1", "true", "TRUE", " yes ", "on", "On"):
            self.assertIs(app.parse_flag(v), True, v)
        for v in ("", "0", "false", "no", "off", "2", "demo"):
            self.assertIs(app.parse_flag(v), False, v)

    def test_demo_uses_separate_db_by_default(self):
        self.assertEqual(self.import_env("app.DB", DEMO="1"), repr("/data/prices-demo.db"))
        self.assertEqual(self.import_env("app.DB"), repr("/data/prices.db"))
        self.assertEqual(self.import_env("app.DB", DEMO="1", DB_FILE="/x/y.db"), repr("/x/y.db"))
        self.assertEqual(self.import_env("app.DB", DEMO="0", DB_FILE="/x/y.db"), repr("/x/y.db"))

    def test_poll_seconds_parsing(self):
        self.assertEqual(app.parse_poll("600"), (600, None))
        self.assertEqual(app.parse_poll(""), (300, None))
        for bad in ("abc", "1.5", "-5", "0", "60"):
            v, msg = app.parse_poll(bad)
            self.assertEqual(v, 300, bad)
            self.assertTrue(msg and "POLL_SECONDS" in msg, bad)

    def test_invalid_poll_seconds_does_not_crash_import(self):
        self.assertEqual(self.import_env("app.POLL", POLL_SECONDS="abc"), "300")

    def test_poll_seconds_problem_is_logged_at_startup(self):
        app.POLL_NOTE = "POLL_SECONDS ungültig"
        self.addCleanup(setattr, app, "POLL_NOTE", None)
        self.assertTrue(any("POLL_SECONDS" in m for m in app.startup_messages()))

    def test_demo_warns_when_real_credentials_present(self):
        app.DEMO, app.KEY, app.STATION = True, "k", "s"
        msgs = app.startup_messages()
        self.assertTrue(any("DEMO" in m and "Vorrang" in m for m in msgs), msgs)
        app.KEY = ""
        self.assertFalse(any("Vorrang" in m for m in app.startup_messages()))
        app.DEMO, app.KEY = False, "k"
        self.assertEqual(app.startup_messages(), [])


class EnvExample(Base):
    def test_demo_line_is_commented_out_with_hint(self):
        with open(os.path.join(ROOT, ".env.example"), encoding="utf-8") as f:
            txt = f.read()
        lines = [l.strip() for l in txt.splitlines()]
        self.assertIn("# DEMO=1", lines)
        self.assertFalse([l for l in lines if l.startswith("DEMO=")], "DEMO darf nicht aktiv sein")
        self.assertIn("Demo only, without an API key", txt)
        self.assertNotRegex(txt, r"[äöüÄÖÜß]")          # Kommentare englisch


class Port(Base):
    def test_port_default_and_env(self):
        self.assertEqual(self.import_env("app.PORT"), "8080")
        self.assertEqual(self.import_env("app.PORT", PORT=""), "8080")
        self.assertEqual(self.import_env("app.PORT", PORT="9123"), "9123")

    def test_main_binds_configured_port(self):
        app.PORT = 9123
        with mock.patch.object(app, "ThreadingHTTPServer") as srv, mock.patch.object(app, "startup"), \
                mock.patch.object(app.threading, "Thread"), mock.patch("builtins.print"):
            app.main()
        srv.assert_called_once_with(("0.0.0.0", 9123), app.H)
        srv.return_value.serve_forever.assert_called_once_with()


class Storage(Base):
    def test_db_closes_connection(self):
        with app.db() as c:
            c.execute("INSERT INTO prices VALUES(1,1,1,1,1)")
        with self.assertRaises(sqlite3.ProgrammingError):
            c.execute("SELECT 1")
        self.assertEqual(self.count(), 1)  # committed

    def test_db_rolls_back_on_error(self):
        with self.assertRaises(RuntimeError):
            with app.db() as c:
                c.execute("INSERT INTO prices VALUES(1,1,1,1,1)")
                raise RuntimeError("x")
        self.assertEqual(self.count(), 0)

    def test_live_poll_stores_via_shared_helper(self):
        app.DEMO, app.KEY, app.STATION = False, "k", "sid"
        payload = {"ok": True, "prices": {"sid": {"status": "open", "e5": 1.859, "e10": 1.799, "diesel": "x"}}}
        resp = mock.Mock()
        resp.read.return_value = json.dumps(payload).encode()
        with mock.patch("urllib.request.urlopen", return_value=resp):
            app.poll_once()
        self.assertEqual(self.count(), 1)
        with app.db() as c:
            row = c.execute("SELECT e5,e10,diesel,open FROM prices").fetchone()
        self.assertEqual(row, (1.859, 1.799, None, 1))
        self.assertTrue(app.state["ok"])
        self.assertIs(app.state["open"], True)
        self.assertIsNone(app.state["diesel"])
        with app.db() as c:  # Echtbetrieb legt keine meta-Tabelle an
            self.assertIsNone(c.execute("SELECT 1 FROM sqlite_master WHERE name='meta'").fetchone())

    def test_stats_reads_state_under_lock(self):
        with app.db() as c:
            c.execute("INSERT INTO prices VALUES(?,?,?,?,1)", (int(__import__("time").time()) - 60, 1.8, 1.7, 1.6))
        entered = []

        class SpyLock:
            def __enter__(self_):
                entered.append(1)

            def __exit__(self_, *a):
                return False

        app.lock = SpyLock()
        app.state.update(e5=1.85)
        self.assertEqual(app.stats(7, "e5")["current"], 1.85)
        self.assertTrue(entered)


if __name__ == "__main__":
    unittest.main()
