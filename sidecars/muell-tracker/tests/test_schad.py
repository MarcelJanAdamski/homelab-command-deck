"""Tests für Schadstoff-Termine und Plan-Prüfung (nur Standardbibliothek).
   python3 -m unittest discover -s tests -v
"""
import os, sys, unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import app  # noqa: E402


class Anchors(unittest.TestCase):
    def test_single_value(self):
        self.assertEqual(app.parse_anchors("2026-01-08"), [date(2026, 1, 8)])

    def test_liste_sortiert_und_ungueltige_ignoriert(self):
        self.assertEqual(app.parse_anchors(" 2027-01-14, quatsch ,2026-01-08"), [date(2026, 1, 8), date(2027, 1, 14)])

    def test_leer(self):
        self.assertEqual(app.parse_anchors(""), [])

    def test_abgedecktes_jahr(self):
        self.assertEqual(app.plan_year([date(2026, 1, 8), date(2027, 1, 14)]), 2027)
        self.assertIsNone(app.plan_year([]))


class Dates(unittest.TestCase):
    def test_2026_plan_example(self):
        d = sorted(x for x, k in app.schad_dates(2026, 2026, [date(2026, 1, 8)], 14))
        self.assertEqual(len(d), 26)
        self.assertEqual((d[0], d[-1]), ("2026-01-08", "2026-12-24"))

    def test_neuer_anker_beendet_alten_rhythmus(self):
        # 2027 beginnt der Plan eine Woche später im Jahr: Dezember 2026 bleibt, ab Anker 2027 neuer Rhythmus
        d = sorted(x for x, k in app.schad_dates(2026, 2027, [date(2026, 1, 8), date(2027, 1, 14)], 14))
        self.assertIn("2026-12-24", d)
        self.assertNotIn("2027-01-07", d)          # alter Rhythmus endet vor dem neuen Anker
        self.assertIn("2027-01-14", d)
        self.assertIn("2027-01-28", d)

    def test_ohne_anker_keine_termine(self):
        self.assertEqual(app.schad_dates(2026, 2027, [], 14), set())


class PlanState(unittest.TestCase):
    def st(self, today, covered=2026, online=None):
        return app.plan_state(today, covered, online, "11-15")

    def test_vor_dem_stichtag_nichts(self):
        self.assertFalse(app.plan_should_check(date(2026, 11, 14), 2026, "11-15"))
        self.assertEqual(self.st(date(2026, 11, 14))["state"], "ok")

    def test_ab_stichtag_pruefen(self):
        self.assertTrue(app.plan_should_check(date(2026, 11, 15), 2026, "11-15"))
        self.assertTrue(app.plan_should_check(date(2027, 2, 1), 2026, "11-15"))

    def test_plan_online_vor_neujahr_info(self):
        s = self.st(date(2026, 11, 20), online=True)
        self.assertEqual((s["state"], s["need"]), ("info", 2027))

    def test_plan_noch_nicht_online_vor_neujahr_nichts(self):
        self.assertEqual(self.st(date(2026, 12, 30), online=False)["state"], "ok")

    def test_neues_jahr_ohne_plan_due(self):
        self.assertEqual(self.st(date(2027, 1, 1), online=True)["state"], "due")
        self.assertEqual(self.st(date(2027, 1, 1), online=False)["state"], "due")

    def test_eingespielt_alles_ok(self):
        self.assertEqual(self.st(date(2027, 1, 2), covered=2027, online=None)["state"], "ok")

    def test_zwei_jahre_rueckstand_braucht_aktuelles_jahr(self):
        self.assertEqual(self.st(date(2028, 3, 1), covered=2026, online=False)["need"], 2028)

    def test_kein_anker_due(self):
        self.assertEqual(app.plan_state(date(2026, 6, 1), None, None, "11-15")["state"], "due")


if __name__ == "__main__":
    unittest.main()
