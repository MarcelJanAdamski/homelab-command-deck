import os
import time
import unittest
from collections import Counter
from datetime import datetime, timedelta
from unittest import mock
from zoneinfo import ZoneInfo

from tests.base import Base, app

NOW = 1_800_000_000          # 2027-01-15 09:00 Berlin
NOW_DST = 1_901_700_000      # 2030-04-05 – Fenster enthält die Zeitumstellung (31.03.2030)
STATS_KEYS = {"fuel", "days", "samples", "first", "current", "today", "range",
              "delta_to_avg", "hour_avg", "best_hour", "worst_hour", "weekday_avg"}


def lt(ts):
    return datetime.fromtimestamp(ts, ZoneInfo("Europe/Berlin"))


class DemoSeed(Base):
    def test_seed_fills_exactly_14_days_on_empty_db(self):
        self.assertEqual(app.demo_seed(NOW), 14 * 288)
        self.assertEqual(self.count(), 4032)
        for f in app.FUELS:
            self.assertEqual(self.count(f"{f} IS NOT NULL"), 4032, f)

    def test_seed_marks_db_as_demo(self):
        app.demo_seed(NOW)
        with app.db() as c:
            self.assertEqual(c.execute("SELECT value FROM meta WHERE key='demo'").fetchone()[0], "1")

    def test_seed_fills_gap_from_last_ts(self):
        app.demo_seed(NOW)
        self.assertEqual(app.demo_seed(NOW), 0)
        self.assertEqual(app.demo_seed(NOW + 3600), 12)
        self.assertEqual(self.count(), 4032 + 12)
        with app.db() as c:
            ts = [r[0] for r in c.execute("SELECT ts FROM prices ORDER BY ts")]
        self.assertEqual({b - a for a, b in zip(ts, ts[1:])}, {300})

    def test_seed_after_long_pause_is_capped_at_14_days(self):
        app.demo_seed(NOW)
        app.demo_seed(NOW + 30 * 86400)
        self.assertEqual(self.count(), 4032 + 14 * 288)

    def test_seed_is_deterministic(self):
        app.demo_seed(NOW)
        with app.db() as c:
            a = c.execute("SELECT * FROM prices ORDER BY ts").fetchall()
        os.remove(app.DB)
        app.demo_seed(NOW)
        with app.db() as c:
            b = c.execute("SELECT * FROM prices ORDER BY ts").fetchall()
        self.assertEqual(a, b)

    def test_stats_shape(self):
        app.demo_seed(int(time.time()))
        s = app.stats(7, "e5")
        self.assertEqual(set(s), STATS_KEYS)
        self.assertEqual((s["fuel"], s["days"]), ("e5", 7))
        self.assertGreater(s["samples"], 1000)
        self.assertEqual(set(s["range"]), {"min", "max", "avg"})
        self.assertEqual(set(s["today"]), {"min", "max"})
        self.assertLess(s["hour_avg"][s["best_hour"]], s["hour_avg"][s["worst_hour"]])


class DemoPattern(Base):
    def series(self, now=NOW):
        app.demo_seed(now)
        with app.db() as c:
            return c.execute("SELECT ts,e5,e10,diesel FROM prices ORDER BY ts").fetchall()

    @staticmethod
    def changes(rows, col):
        """[(ts, Änderung in ct)] für jeden Wechsel zwischen aufeinanderfolgenden Zeilen."""
        return [(b[0], round((b[col] - a[col]) * 100)) for a, b in zip(rows, rows[1:])
                if round((b[col] - a[col]) * 1000) != 0]

    def test_demo_point_is_pure_function_of_ts(self):
        for ts in (NOW, NOW + 12345, NOW_DST):
            self.assertEqual(app.demo_point(ts), app.demo_point(ts))
        self.assertEqual(app.demo_point(NOW)[3], 1)

    def test_demo_pattern_noon_jump(self):
        rows = self.series()
        first_day = lt(rows[0][0]).date()
        expected_days = {first_day + timedelta(days=k) for k in range(14)}
        for col in (1, 2, 3):
            ups = [(t, d) for t, d in self.changes(rows, col) if d > 0]
            days = [lt(t).date() for t, _ in ups]
            self.assertEqual(len(ups), 14, col)
            self.assertEqual(set(days), expected_days, col)      # genau ein Anstieg je Tag
            for t, d in ups:
                x = lt(t)
                self.assertEqual(x.hour, 12, (col, x))
                self.assertTrue(5 <= x.minute <= 10, (col, x))    # Sprung 12:02–12:07, im 5-min-Raster sichtbar
                self.assertTrue(10 <= d <= 14, (col, d))          # Sprung exakt 10–14 ct (E5, E10, Diesel)

    def test_demo_pattern_steps_down_to_evening_low(self):
        rows = self.series()
        downs = Counter(lt(t).date() for t, d in self.changes(rows, 1) if d < 0)
        first_day = lt(rows[0][0]).date()
        for k in range(14):
            self.assertEqual(downs[first_day + timedelta(days=k)], 5, k)
        for t, d in self.changes(rows, 1):
            if d < 0:
                self.assertTrue(13 <= lt(t).hour <= 22, lt(t))
        # Tagestief steht von ~23 Uhr bis 12 Uhr unverändert
        by_day = {}
        for t, e5, *_ in rows:
            x = lt(t)
            if x.hour >= 23 or x.hour < 12:
                by_day.setdefault((x - timedelta(hours=12)).date(), set()).add(e5)
        for d, vals in list(by_day.items())[1:-1]:
            self.assertEqual(len(vals), 1, d)

    def test_demo_jump_is_10_to_14ct_over_400_days(self):
        """Der Tagessprung (Startpreis − Vortagstief) liegt für E5 und Diesel an jedem Tag in [10, 14] ct;
        dazwischen nur Stufen nach unten (5 je Tag), Anstiege nur mittags."""
        start = int(datetime(2027, 1, 1, tzinfo=lt(0).tzinfo).timestamp())
        ts_all = range(start, start + 400 * 86400, 300)
        for col in (0, 2):                                             # e5, diesel
            vals = [round(app.demo_point(t)[col] * 1000) for t in ts_all]
            ups, downs = Counter(), Counter()
            for i in range(1, len(vals)):
                dv, x = vals[i] - vals[i - 1], lt(ts_all[i - 1] + 300)
                if dv > 0:
                    self.assertEqual(x.hour, 12, (col, x))
                    self.assertEqual(dv % 10, 0)
                    self.assertTrue(10 <= dv // 10 <= 14, (col, x, dv))
                    ups[x.date()] += 1
                elif dv < 0:
                    downs[x.date()] += 1
            self.assertEqual(set(ups.values()), {1}, col)
            self.assertGreaterEqual(len(ups), 399, col)
            inner = sorted(downs)[1:-1]                                # erster/letzter Tag sind angeschnitten
            self.assertGreaterEqual(len(inner), 397, col)
            self.assertEqual({downs[d] for d in inner}, {5}, col)

    def test_demo_params_drop_always_reaches_low_monotonically(self):
        """Start → Tief fällt über mindestens 5 Stufen, auch wenn das Tief gegenüber gestern steigt."""
        for k in range(5000):
            d = datetime(2020, 1, 1).date() + timedelta(days=k)
            for start, low in ((app._start(d, 0), app._day_params(d)[2]),
                               (app._start(d, 1), app._day_params(d)[4])):
                self.assertGreaterEqual(start - low, len(app.STEP_HOURS), (d, start, low))

    def test_demo_prices_end_in_9(self):
        for ts, e5, e10, diesel in self.series():
            for p in (e5, e10, diesel):
                self.assertEqual(round(p * 1000) % 10, 9, (ts, p))
                self.assertAlmostEqual(p * 1000, round(p * 1000), places=6)

    def test_demo_only_noon_increases(self):
        rows = self.series()
        for col in (1, 2, 3):
            for t, d in self.changes(rows, col):
                if d > 0:
                    self.assertEqual(lt(t).hour, 12, (col, lt(t)))

    def test_e10_is_e5_minus_6ct_and_diesel_cheaper(self):
        for ts, e5, e10, diesel in self.series():
            self.assertEqual(round((e5 - e10) * 1000), 60, ts)
            self.assertLess(diesel, e5)

    def test_day_variation_comes_from_date_not_ts(self):
        rows = self.series()
        lows = {}
        for t, e5, *_ in rows:
            x = lt(t)
            if x.hour == 23:
                lows.setdefault(x.date(), set()).add(e5)
        self.assertTrue(all(len(v) == 1 for v in lows.values()))
        vals = [next(iter(v)) for v in lows.values()]
        self.assertGreaterEqual(len(set(vals)), 3)                 # Tag-zu-Tag-Variation
        self.assertLessEqual(max(vals) - min(vals), 0.08)
        # gleiches Datum, anderes Jahr/andere ts → unabhängig vom ts-Seed
        a = app.demo_point(int(datetime(2027, 1, 10, 23, 0, tzinfo=lt(0).tzinfo).timestamp()))
        b = app.demo_point(int(datetime(2027, 1, 10, 23, 55, tzinfo=lt(0).tzinfo).timestamp()))
        self.assertEqual(a, b)

    def test_pattern_holds_across_dst_change(self):
        rows = self.series(NOW_DST)
        days = {lt(r[0]).date() for r in rows}
        self.assertIn(datetime(2030, 3, 31).date(), days)
        self.assertEqual(len({lt(r[0]).utcoffset() for r in rows}), 2)
        ups = [lt(t) for t, d in self.changes(rows, 1) if d > 0]
        self.assertEqual(len(ups), 14)
        self.assertTrue(all(x.hour == 12 and 5 <= x.minute <= 10 for x in ups), ups)


class DemoSafety(Base):
    def setUp(self):
        super().setUp()
        app.DEMO, app.KEY, app.STATION = True, "", ""

    def real_db(self):
        with app.db() as c:
            c.execute("INSERT INTO prices VALUES(1,1.8,1.7,1.6,1)")

    def test_demo_never_writes_into_db_with_real_rows(self):
        self.real_db()
        with mock.patch("builtins.print") as pr:
            self.assertEqual(app.demo_seed(NOW), 0)
            app.poll_once()
        self.assertEqual(self.count(), 1)
        with app.db() as c:
            self.assertIsNone(c.execute("SELECT 1 FROM sqlite_master WHERE name='meta'").fetchone())
        self.assertTrue(any("DEMO" in str(a) for call in pr.call_args_list for a in call.args))
        self.assertFalse(app.state["ok"])

    def test_startup_with_refused_db_loads_no_value_and_health_reports_error(self):
        self.real_db()
        with mock.patch("builtins.print"):
            app.startup()
        self.assertIsNone(app.state.get("e5"))
        self.assertFalse(app.state["ok"])
        h = self.get("/health")
        self.assertIs(h["ok"], False)
        self.assertEqual(h["error"], "DEMO: Datenbank enthält Echtdaten, Demo verweigert")
        self.assertIs(h["demo"], True)
        self.assertEqual(h["samples"], 1)
        c = self.get("/current")
        self.assertIsNone(c.get("e5"))
        self.assertIs(c["ok"], False)

    def test_health_ok_for_marked_demo_db(self):
        app.demo_seed(NOW)
        h = self.get("/health")
        self.assertIs(h["ok"], True)
        self.assertNotIn("error", h)

    def test_poller_aligns_ts_to_5min_grid_and_does_not_duplicate(self):
        with mock.patch("time.time", return_value=NOW + 123):
            app.poll_once()
        with mock.patch("time.time", return_value=NOW + 250):         # gleiches Raster-Intervall
            app.poll_once()
        with app.db() as c:
            ts = [r[0] for r in c.execute("SELECT ts FROM prices")]
        self.assertEqual(ts, [NOW])
        self.assertEqual(app.state["fetched_at"], app.iso(NOW))

    def test_poller_does_not_duplicate_seeded_point(self):
        app.demo_seed(NOW)
        with mock.patch("time.time", return_value=NOW + 100):
            app.poll_once()
        self.assertEqual(self.count(), 4032)

    def test_demo_writes_into_empty_db_and_marks_it(self):
        app.poll_once()
        self.assertEqual(self.count(), 1)
        self.assertTrue(app.state["ok"])
        with app.db() as c:
            self.assertEqual(c.execute("SELECT value FROM meta WHERE key='demo'").fetchone()[0], "1")

    def test_demo_continues_in_marked_db(self):
        app.demo_seed(NOW)
        app.poll_once()
        self.assertEqual(self.count(), 4033)

    def test_poll_without_network(self):
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("kein Netz erlaubt")) as net:
            app.poll_once()
            net.assert_not_called()
        self.assertIsNotNone(app.state["e5"])

    def test_startup_seeds_before_serving_and_survives_errors(self):
        app.startup()
        self.assertEqual(self.count(), 4032)
        self.assertTrue(app.state["ok"] and app.state["stale"])      # /current sofort gefüllt
        with mock.patch.object(app, "demo_seed", side_effect=OSError("disk")), mock.patch("builtins.print") as pr:
            app.startup()                                              # kein Crash
        self.assertTrue(any("disk" in str(a) for call in pr.call_args_list for a in call.args))


class DemoApi(Base):
    def test_demo_is_flagged_in_health_and_current(self):
        app.DEMO, app.KEY, app.STATION = True, "", ""
        app.demo_seed(int(time.time()))
        app.startup()
        h, c = self.get("/health"), self.get("/current")
        self.assertIs(h["ok"], True)
        self.assertIs(h["demo"], True)
        self.assertGreater(h["samples"], 4000)
        self.assertIs(c["demo"], True)
        self.assertEqual(c["license"], "synthetische Demo-Daten")
        self.assertNotIn("Tankerkönig", c["license"])
        pts = self.get("/history?days=14")["points"]
        self.assertGreater(len(pts), 4000)

    def test_real_mode_responses_unchanged(self):
        app.DEMO, app.KEY, app.STATION = False, "k", "sid"
        h, c = self.get("/health"), self.get("/current")
        self.assertEqual(set(h), {"ok", "station", "samples", "poll_seconds"})
        self.assertIs(h["ok"], True)
        self.assertNotIn("demo", c)
        self.assertEqual(c["license"], "CC BY 4.0 – Tankerkönig / MTS-K")
        self.assertEqual(set(c), {"station", "ok", "stale", "error", "fetched_at", "license"})


if __name__ == "__main__":
    unittest.main()
