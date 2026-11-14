"""Tests für den generischen iCal-Abholer, DEMO-Modus und Konfiguration (nur Standardbibliothek).
   python3 -W error::ResourceWarning -m unittest discover -s tests -v
"""
import http.client, io, json, os, subprocess, sys, tempfile, threading, unittest, urllib.error, urllib.request
from datetime import date, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)
import app  # noqa: E402

SAMPLE = os.path.join(HERE, "fixtures", "sample.ics")
MAP = "Restmüll (Standardtonne)=rest|Biotonne=bio|Papier=papier|Wertstoffe=gelb"
FOUR = {("2027-01-05", "rest"), ("2027-01-12", "bio"), ("2027-01-19", "papier"), ("2027-02-01", "gelb")}


def sample():
    with open(SAMPLE, encoding="utf-8", newline="") as f:
        return f.read()


class FakeResp(io.BytesIO):
    """Antwort-Attrappe für urlopen (Kontextmanager, schließt sauber)."""


def fake_urlopen(body, seen):
    def _open(req, timeout=None):
        seen.append(req)
        return FakeResp(body.encode("utf-8"))
    return _open


class ParseIcs(unittest.TestCase):
    def test_parse_ics_dtstart_and_kind(self):
        # VALUE=DATE, DATE-TIME mit TZID, UTC (-> Berlin), gefaltete Zeilen, Parameter an SUMMARY
        got = app.parse_ics(sample(), app.parse_kind_map(MAP))
        self.assertEqual(got, FOUR)

    def test_unknown_kind_ignored(self):
        got = app.parse_ics(sample(), None)
        self.assertNotIn("2027-01-07", {d for d, k in got})        # Sperrmüll
        self.assertNotIn("2027-01-08", {d for d, k in got})        # Event ohne DTSTART
        self.assertTrue(all(k in ("rest", "bio", "papier", "gelb") for d, k in got))
        self.assertEqual(app.parse_ics("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", None), set())

    def test_kind_map_only_when_set(self):
        # Mit KIND_MAP: nur gelistete Namen; Sondertonne ("Restmüll Sondertonne …") wird ignoriert.
        with_map = app.parse_ics(sample(), app.parse_kind_map(MAP))
        self.assertNotIn(("2027-01-06", "rest"), with_map)
        # Ohne KIND_MAP: Schlüsselwort-Fallback erkennt auch die Sondertonne.
        without = app.parse_ics(sample(), None)
        self.assertEqual(without, FOUR | {("2027-01-06", "rest")})
        self.assertEqual(app.parse_ics(sample(), []), without)     # leer = nicht gesetzt

    def test_trailing_text_after_name_is_ignored(self):
        # Nur der Anfang des SUMMARY zählt (KIND_MAP-Präfix bzw. Schlüsselwort): ein angehängtes Datum ändert nichts.
        def one(summary, km):
            ics = f"BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270105\r\nSUMMARY:{summary}\r\nEND:VEVENT\r\n"
            return app.parse_ics(ics, km)
        for km in (app.parse_kind_map(MAP), None):
            self.assertEqual(one("Biotonne", km), {("2027-01-05", "bio")})
            self.assertEqual(one("Biotonne – Abholung 12.03.2027", km), {("2027-01-05", "bio")})
            self.assertEqual(one("Biotonne am 12.03.2027  ", km), {("2027-01-05", "bio")})

    def test_parse_kind_map(self):
        self.assertEqual(app.parse_kind_map(""), [])
        self.assertEqual(app.parse_kind_map(" A b = rest | C=bio |kaputt| =x"), [("A b", "rest"), ("C", "bio")])

    def test_new_vevent_discards_unterminated_one(self):
        # Event ohne END:VEVENT darf den nächsten nicht verschlucken oder dessen Felder erben
        ics = ("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270105\r\nSUMMARY:Biotonne – Abholung 05.01.2027\r\n"
               "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270112\r\nSUMMARY:Altpapier – Abholung 12.01.2027\r\nEND:VEVENT\r\n"
               "BEGIN:VEVENT\r\nSUMMARY:Biotonne – Abholung 19.01.2027\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270126\r\n"
               "SUMMARY:Biotonne – Abholung 26.01.2027\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
        self.assertEqual(app.parse_ics(ics, None), {("2027-01-12", "papier"), ("2027-01-26", "bio")})

    def test_utc_conversion_at_day_edge(self):
        def one(dtstart):
            ics = f"BEGIN:VEVENT\r\nDTSTART:{dtstart}\r\nSUMMARY:Biotonne\r\nEND:VEVENT\r\n"
            return {d for d, k in app.parse_ics(ics, None)}
        self.assertEqual(one("20261130T233000Z"), {"2026-12-01"})   # Winter: 23:30Z = 00:30 am Folgetag (UTC+1)
        self.assertEqual(one("20261130T223000Z"), {"2026-11-30"})   # 22:30Z = 23:30 am selben Tag
        self.assertEqual(one("20270630T213000Z"), {"2027-06-30"})   # Sommer (UTC+2): 21:30Z = 23:30 selber Tag
        self.assertEqual(one("20270630T220000Z"), {"2027-07-01"})   # 22:00Z = 00:00 Folgetag
        self.assertEqual(one("20261231T233000Z"), {"2027-01-01"})   # Jahreswechsel
        with mock.patch.object(app, "TZ", ZoneInfo("America/New_York")):
            self.assertEqual(one("20270115T013000Z"), {"2027-01-14"})  # westlich von UTC: Vortag


class MissingUrl(unittest.TestCase):
    def test_missing_ics_url_health_error(self):
        saved = dict(app.state)
        self.addCleanup(lambda: (app.state.clear(), app.state.update(saved)))
        with mock.patch.object(app, "ICS_URL", ""), mock.patch.object(app, "DEMO", False), \
                mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("Netzabruf trotz fehlender ICS_URL")):
            self.assertFalse(app.poll_once())
            h = http_json("/health")
        self.assertIs(h["ok"], False)
        self.assertEqual(h["error"], "ICS_URL fehlt")
        self.assertNotIn("demo", h)


def http_json(path):
    srv = app.make_server(0, "127.0.0.1")
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)  # unabhängig vom urlopen-Mock
        try:
            c.request("GET", path)
            return json.loads(c.getresponse().read().decode("utf-8"))
        finally:
            c.close()
    finally:
        srv.shutdown()
        srv.server_close()
        t.join(5)


class Demo(unittest.TestCase):
    def test_demo_has_all_kinds_next_30_days(self):
        for off in range(0, 60):
            today = date(2027, 3, 1) + timedelta(days=off)
            ev = app.demo_events(today)
            window = {k for d, k in ev if today <= date.fromisoformat(d) <= today + timedelta(days=30)}
            self.assertEqual(window, {"rest", "bio", "papier", "gelb", "schad"}, today)

    def test_demo_rhythms(self):
        ev = app.demo_events(date(2027, 3, 1))
        for kind, step in (("rest", 14), ("bio", 14), ("papier", 28), ("gelb", 14), ("schad", 14)):
            ds = sorted(date.fromisoformat(d) for d, k in ev if k == kind)
            self.assertTrue(all((b - a).days == step for a, b in zip(ds, ds[1:])), kind)

    def test_demo_poll_without_network(self):
        saved = dict(app.state)
        self.addCleanup(lambda: (app.state.clear(), app.state.update(saved)))
        with mock.patch.object(app, "DEMO", True), mock.patch.object(app, "ICS_URL", ""), mock.patch.object(app, "LABEL", ""), \
                mock.patch.object(app, "CACHE", "/nonexistent/x/termine.json"), \
                mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("Netzabruf im DEMO")):
            self.assertTrue(app.poll_once())
            t, h = http_json("/termine"), http_json("/health")
        self.assertIs(t["demo"], True)
        self.assertIs(h["demo"], True)
        self.assertIs(t["ok"], True)
        self.assertEqual(t["label"], "Musterstraße")
        self.assertIsNone(t["notice"])
        self.assertEqual(t["schad"]["state"], "ok")
        self.assertTrue({e["k"] for e in t["events"]} >= {"rest", "bio", "papier", "gelb", "schad"})
        for key in ("ok", "stale", "error", "label", "fetched_at", "events", "notice", "schad"):
            self.assertIn(key, t)
        for key in ("state", "covered", "need", "online", "url", "checked", "zeit"):
            self.assertIn(key, t["schad"])


class DemoLabel(unittest.TestCase):
    def test_demo_always_uses_demo_label(self):
        with mock.patch.object(app, "DEMO", True), mock.patch.object(app, "LABEL", "Echte Straße 1"):
            self.assertEqual(app.label(), "Musterstraße")
            saved = dict(app.state)
            self.addCleanup(lambda: (app.state.clear(), app.state.update(saved)))
            with mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("Netzabruf im DEMO")):
                app.poll_once()
            self.assertEqual(http_json("/termine")["label"], "Musterstraße")
            self.assertEqual(http_json("/health")["label"], "Musterstraße")
        with mock.patch.object(app, "DEMO", False), mock.patch.object(app, "LABEL", "Echte Straße 1"):
            self.assertEqual(app.label(), "Echte Straße 1")
        with mock.patch.object(app, "DEMO", False), mock.patch.object(app, "LABEL", ""):
            self.assertEqual(app.label(), "")


class KindMapCheck(unittest.TestCase):
    def test_unknown_key_is_reported(self):
        km = app.parse_kind_map("Restmüll=rest|Biotonne=biio|Wertstoffe=gelb")
        probs = app.kind_map_problems(km, ["rest", "bio", "papier", "gelb"])
        self.assertEqual(len(probs), 1)
        self.assertIn("biio", probs[0])
        self.assertIn("Biotonne", probs[0])
        self.assertEqual(app.kind_map_problems(app.parse_kind_map(MAP), ["rest", "bio", "papier", "gelb"]), [])
        self.assertEqual(app.kind_map_problems([], ["rest"]), [])
        # eigene KINDS erweitern die erlaubten Schlüssel
        self.assertEqual(app.kind_map_problems([("Glas", "glas")], ["rest", "glas"]), [])

    def test_health_shows_hint_and_start_logs_warning(self):
        saved = dict(app.state)
        self.addCleanup(lambda: (app.state.clear(), app.state.update(saved)))
        app.state.update({"ok": True, "stale": False, "error": None, "events": [], "notice": None, "schad": None})
        with mock.patch.object(app, "KIND_MAP", app.parse_kind_map("Biotonne=biio")):
            h = http_json("/health")
            buf = io.StringIO()
            with mock.patch("sys.stdout", buf), mock.patch.object(app, "make_server", side_effect=KeyboardInterrupt), \
                    mock.patch.object(app, "poller"), mock.patch.object(app, "ICS_URL", ""):
                with self.assertRaises(KeyboardInterrupt):
                    app.main()
        self.assertIs(h["ok"], True)                        # Warnung macht den Dienst nicht „kaputt“
        self.assertIn("KIND_MAP", h["error"])
        self.assertIn("biio", h["error"])
        self.assertIn("KIND_MAP", buf.getvalue())
        self.assertIn("biio", buf.getvalue())
        with mock.patch.object(app, "KIND_MAP", []):
            self.assertIsNone(http_json("/health")["error"])

    def test_health_joins_poll_error_and_hint(self):
        saved = dict(app.state)
        self.addCleanup(lambda: (app.state.clear(), app.state.update(saved)))
        app.state.update({"ok": False, "stale": True, "error": "ICS_URL fehlt", "events": [], "notice": None, "schad": None})
        with mock.patch.object(app, "KIND_MAP", [("X", "zzz")]):
            err = http_json("/health")["error"]
        self.assertTrue(err.startswith("ICS_URL fehlt"))
        self.assertIn("zzz", err)


class PollErrors(unittest.TestCase):
    def setUp(self):
        self._saved = dict(app.state)
        self.addCleanup(lambda: (app.state.clear(), app.state.update(self._saved)))
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _poll(self, fetch_year, notice):
        out = io.StringIO()
        with mock.patch.object(app, "DEMO", False), mock.patch.object(app, "ICS_URL", "https://cal.example.invalid/x"), \
                mock.patch.object(app, "CACHE", os.path.join(self.tmp.name, "t.json")), \
                mock.patch.object(app, "fetch_year", side_effect=fetch_year), mock.patch.object(app, "fetch_notice", side_effect=notice), \
                mock.patch.object(app, "schad_dates", return_value=set()), mock.patch.object(app, "schad_info", return_value=None), \
                mock.patch("sys.stdout", out):
            ok = app.poll_once()
        return ok, out.getvalue()

    def test_notice_error_keeps_events_and_old_notice(self):
        old = {"head": "H", "text": "alt", "warn": False, "seen": "x"}
        app.state.update({"notice": old})
        ok, log = self._poll(lambda y: {("2027-01-05", "rest")}, urllib.error.URLError("boom"))
        self.assertTrue(ok)
        self.assertIs(app.state["ok"], True)
        self.assertIs(app.state["stale"], False)
        self.assertTrue(app.state["error"].startswith("Hinweis:"), app.state["error"])
        self.assertIn("boom", app.state["error"])
        self.assertEqual(app.state["notice"], old)
        self.assertEqual(app.state["events"], [{"d": "2027-01-05", "k": "rest"}])

    def test_fetch_notice_http_error_propagates(self):
        with mock.patch.object(app, "NOTICE_URL", "https://x.example.invalid/"), mock.patch.object(app, "NOTICE_HEAD", "Hinweis"), \
                mock.patch.object(urllib.request, "urlopen", side_effect=urllib.error.URLError("down")):
            with self.assertRaises(urllib.error.URLError):
                app.fetch_notice()

    def test_next_year_error_is_logged_not_swallowed(self):
        def fy(y):
            if y == app.datetime.now(app.TZ).year + 1:
                raise RuntimeError("Folgejahr kaputt")
            return {("2027-01-05", "rest")}
        ok, log = self._poll(fy, lambda: None)
        self.assertTrue(ok)                                   # Termine des Jahres bleiben gültig
        self.assertIn("Folgejahr", log)
        self.assertIn("Folgejahr kaputt", log)


class Fetch(unittest.TestCase):
    def test_form_post_uses_year(self):
        seen = []
        with mock.patch.object(app, "ICS_URL", "https://cal.example.invalid/ical"), \
                mock.patch.object(app, "ICS_FORM", "year={year}&start=01.01.{year}&end=31.12.{year}&all=1"), \
                mock.patch.object(app, "KIND_MAP", app.parse_kind_map(MAP)), \
                mock.patch.object(urllib.request, "urlopen", fake_urlopen(sample(), seen)):
            got = app.fetch_year(2027)
        self.assertEqual(got, FOUR)
        req = seen[0]
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(req.full_url, "https://cal.example.invalid/ical")
        self.assertEqual(req.data, b"year=2027&start=01.01.2027&end=31.12.2027&all=1")
        self.assertEqual(req.get_header("Content-type"), "application/x-www-form-urlencoded")

    def test_get_without_form_replaces_year_in_url(self):
        seen = []
        with mock.patch.object(app, "ICS_URL", "https://cal.example.invalid/{year}.ics"), mock.patch.object(app, "ICS_FORM", ""), \
                mock.patch.object(app, "KIND_MAP", []), mock.patch.object(urllib.request, "urlopen", fake_urlopen(sample(), seen)):
            app.fetch_year(2028)
        self.assertEqual(seen[0].get_method(), "GET")
        self.assertEqual(seen[0].full_url, "https://cal.example.invalid/2028.ics")
        self.assertIsNone(seen[0].data)

    def test_kinds_filter_applies(self):
        with mock.patch.object(app, "ICS_URL", "https://cal.example.invalid/x"), mock.patch.object(app, "ICS_FORM", ""), \
                mock.patch.object(app, "KIND_MAP", []), mock.patch.object(app, "KINDS", ["bio"]), \
                mock.patch.object(urllib.request, "urlopen", fake_urlopen(sample(), [])):
            self.assertEqual(app.fetch_year(2027), {("2027-01-12", "bio")})

    def test_no_ical_in_answer_raises(self):
        with mock.patch.object(app, "ICS_URL", "https://cal.example.invalid/x"), mock.patch.object(app, "ICS_FORM", ""), \
                mock.patch.object(urllib.request, "urlopen", fake_urlopen("<html>nix</html>", [])):
            with self.assertRaises(RuntimeError):
                app.fetch_year(2027)


NOTICE_HTML = ('<p><strong>Allgemeine Infos</strong></p><p><strong><u>Wertstoffe</u></strong></p>'
               '<p><strong>Neuigkeiten (Restmüll, Bioabfall)</strong></p>'
               '<p>Es kommt wegen Glätte&nbsp;zu Verzögerungen.</p><p>&nbsp;</p><p>Anderes</p>')


class Notice(unittest.TestCase):
    def test_empty_config_means_no_notice_and_no_request(self):
        with mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("Netzabruf")):
            for url, head in (("", ""), ("https://x.example.invalid/", ""), ("", "Neuigkeiten")):
                with mock.patch.object(app, "NOTICE_URL", url), mock.patch.object(app, "NOTICE_HEAD", head):
                    self.assertIsNone(app.fetch_notice())

    def test_head_is_configurable(self):
        with mock.patch.object(app, "NOTICE_URL", "https://x.example.invalid/"), mock.patch.object(app, "NOTICE_HEAD", "Neuigkeiten"), \
                mock.patch.object(urllib.request, "urlopen", fake_urlopen(NOTICE_HTML, [])):
            n = app.fetch_notice()
        self.assertEqual(n["head"], "Neuigkeiten")
        self.assertEqual((n["scope"], n["affects"]), ("Restmüll, Bioabfall", ["bio", "rest"]))
        self.assertEqual(n["text"], "Es kommt wegen Glätte zu Verzögerungen.")
        self.assertIs(n["warn"], True)

    def test_head_with_scope(self):
        html = '<p>Hinweis (Restmüll, Altpapier)</p><p>Es kommt zu Verzögerungen.</p>'
        with mock.patch.object(app, "NOTICE_URL", "https://x.example.invalid/"), mock.patch.object(app, "NOTICE_HEAD", "Hinweis"), \
                mock.patch.object(urllib.request, "urlopen", fake_urlopen(html, [])):
            n = app.fetch_notice()
        self.assertEqual((n["scope"], n["affects"]), ("Restmüll, Altpapier", ["papier", "rest"]))


class SchadInfo(unittest.TestCase):
    def test_without_pdf_no_network_and_no_anchor_ok(self):
        with mock.patch.object(app, "SCHAD_PDF", ""), mock.patch.object(app, "SCHAD_ANCHOR", ""), \
                mock.patch.object(urllib.request, "urlopen", side_effect=AssertionError("Netzabruf")):
            from datetime import datetime
            s = app.schad_info(datetime(2027, 6, 1, 12, 0, tzinfo=app.TZ))
        self.assertEqual(s["state"], "ok")
        self.assertEqual(s["url"], "")
        self.assertIsNone(s["online"])

    def test_defaults_have_no_region_values(self):
        env = {k: v for k, v in os.environ.items() if k.startswith(("ICS_", "KIND_", "NOTICE_", "SCHAD_", "LABEL", "DEMO"))}
        code = ("import sys; sys.path.insert(0, %r); import app, threading; "
                "print(repr((app.ICS_URL, app.ICS_FORM, app.KIND_MAP, app.NOTICE_URL, app.NOTICE_HEAD, app.SCHAD_PDF, app.LABEL, app.SCHAD_ANCHOR, app.DEMO, threading.active_count())))") % os.path.abspath(ROOT)
        clean = {k: v for k, v in os.environ.items() if k not in env}
        out = subprocess.run([sys.executable, "-c", code], env=clean, capture_output=True, text=True, timeout=30)
        self.assertEqual(out.stdout.strip(), "('', '', [], '', '', '', '', '', False, 1)", out.stderr)


if __name__ == "__main__":
    unittest.main()
