import unittest
from unittest import mock

from tests.base import Base, app


class Stop(Exception):
    pass


class PollerOffset(Base):
    """Zufälliger Start-Versatz vor der ersten Abfrage (Tankerkönig: keine runden Uhrzeiten). Zeit und Sleep gemockt."""

    def run_poller(self, demo, offsets=None, loops=3, poll=300):
        app.DEMO, app.POLL = demo, poll
        events, n = [], [0]

        def fake_sleep(s):
            events.append(("sleep", s))
            n[0] += 1
            if n[0] > loops:
                raise Stop

        with mock.patch.object(app.time, "sleep", fake_sleep), \
                mock.patch.object(app, "poll_once", lambda: events.append(("poll",))), \
                mock.patch.object(app, "log", lambda *a: None), \
                mock.patch.object(app, "start_offset", (lambda: offsets) if offsets is not None else app.start_offset):
            with self.assertRaises(Stop):
                app.poller()
        return events

    def test_live_sleeps_offset_before_first_poll_then_interval(self):
        ev = self.run_poller(False, offsets=23)
        self.assertEqual(ev, [("sleep", 23), ("poll",), ("sleep", 300), ("poll",), ("sleep", 300), ("poll",), ("sleep", 300)])

    def test_offset_applied_once_interval_never_below_300(self):
        ev = self.run_poller(False, offsets=7, loops=6, poll=450)
        sleeps = [e[1] for e in ev if e[0] == "sleep"]
        self.assertEqual(sleeps[0], 7)
        self.assertTrue(all(s == 450 and s >= 300 for s in sleeps[1:]), sleeps)

    def test_demo_has_no_offset_and_polls_immediately(self):
        ev = self.run_poller(True)
        self.assertEqual(ev[0], ("poll",))
        self.assertEqual([e for e in ev if e[0] == "sleep"][0], ("sleep", 300))

    def test_start_offset_range_7_to_53_and_varies(self):
        vals = {app.start_offset() for _ in range(3000)}
        self.assertEqual((min(vals), max(vals)), (7, 53))
        self.assertGreater(len(vals), 30)
        self.assertEqual((app.JITTER_MIN, app.JITTER_MAX), (7, 53))

    def test_start_offset_uses_random_randint(self):
        with mock.patch.object(app.random, "randint", return_value=41) as r:
            self.assertEqual(app.start_offset(), 41)
            r.assert_called_once_with(7, 53)

    def test_real_poller_uses_real_offset_in_range(self):
        app.DEMO, app.POLL = False, 300
        got = []

        def fake_sleep(s):
            got.append(s)
            raise Stop

        with mock.patch.object(app.time, "sleep", fake_sleep), mock.patch.object(app, "log", lambda *a: None), \
                mock.patch.object(app, "poll_once", side_effect=AssertionError("vor dem Versatz keine Abfrage")):
            with self.assertRaises(Stop):
                app.poller()
        self.assertTrue(7 <= got[0] <= 53, got)


if __name__ == "__main__":
    unittest.main()
