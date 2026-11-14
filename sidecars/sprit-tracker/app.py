"""sprit-tracker – sammelt Spritpreise einer Tankstelle (Tankerkönig/MTS-K) und liefert sie als JSON.

Quelle:  https://creativecommons.tankerkoenig.de (CC BY 4.0), Endpoint prices.php
Key:     Umgebungsvariable TK_APIKEY (aus .env, verlässt den Container nie)
Station: Umgebungsvariablen STATION_ID (Pflicht, kein Standardwert) und STATION_NAME (Standard "Tankstelle")
DEMO:    DEMO=1 -> synthetische Preise (14 Tage Vorlauf + ein Punkt je Intervall), kein Netzzugriff, kein Key nötig.
         DEMO hat Vorrang vor TK_APIKEY/STATION_ID und nutzt ohne DB_FILE die getrennte Datei /data/prices-demo.db;
         in eine fremde (nicht als Demo markierte, nicht leere) DB schreibt DEMO nie.
Speicher: SQLite /data/prices.db – eine Zeile pro Abfrage (Standard alle 5 min)

Endpoints (CORS offen, nur GET):
  /health                -> {"ok": true, ...}; ohne STATION_ID/TK_APIKEY (und ohne DEMO): {"ok": false, "error": ...}
  /current               -> letzter Preis + Status (nur im DEMO zusätzlich "demo": true, Lizenz "synthetische Demo-Daten")
  /history?days=7        -> Zeitreihe [{t, e5, e10, diesel, open}] (max. 365 Tage)
  /stats?days=14&fuel=e5 -> heute min/max, Zeitraum min/max/avg, Ø je Stunde, Ø je Wochentag, Δ zum Schnitt
"""
import contextlib, functools, json, os, random, sqlite3, math, threading, time, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo


def parse_flag(v):
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def parse_poll(raw):
    """POLL_SECONDS -> (Sekunden, Hinweis oder None). Ungültig/zu klein -> 300 (Tankerkönig: nicht öfter als alle 5 min)."""
    raw = (raw or "").strip()
    if not raw:
        return 300, None
    try:
        n = int(raw)
    except ValueError:
        return 300, f"POLL_SECONDS={raw!r} ungültig, nutze 300"
    if n < 300:
        return 300, f"POLL_SECONDS={n} unter dem Minimum, nutze 300"
    return n, None


KEY = os.environ.get("TK_APIKEY", "").strip()
STATION = os.environ.get("STATION_ID", "").strip()
STATION_NAME = os.environ.get("STATION_NAME", "").strip() or "Tankstelle"
DEMO = parse_flag(os.environ.get("DEMO", ""))
POLL, POLL_NOTE = parse_poll(os.environ.get("POLL_SECONDS"))
PORT = int(os.environ.get("PORT", "").strip() or "8080")
# DEMO schreibt ohne explizites DB_FILE in eine eigene Datei und berührt so nie die Echt-DB
DB = os.environ.get("DB_FILE", "").strip() or ("/data/prices-demo.db" if DEMO else "/data/prices.db")
TZ = ZoneInfo(os.environ.get("TZ", "Europe/Berlin"))
FUELS = ("e5", "e10", "diesel")
URL = "https://creativecommons.tankerkoenig.de/json/prices.php"
MISSING = "STATION_ID/TK_APIKEY fehlt"
LICENSE = "CC BY 4.0 – Tankerkönig / MTS-K"
LICENSE_DEMO = "synthetische Demo-Daten"
STEP = 300          # Raster der Messpunkte in Sekunden
JITTER_MIN, JITTER_MAX = 7, 53   # Bereich des einmaligen Start-Versatzes in Sekunden
DEMO_DAYS = 14

state = {"ok": False, "stale": True, "error": "noch keine Daten", "fetched_at": None}
lock = threading.Lock()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


@contextlib.contextmanager
def db():
    """Verbindung, die bei Verlassen committet (bzw. zurückrollt) und wirklich geschlossen wird."""
    c = sqlite3.connect(DB, timeout=10)
    try:
        with c:
            c.execute("""CREATE TABLE IF NOT EXISTS prices(
                ts INTEGER PRIMARY KEY, e5 REAL, e10 REAL, diesel REAL, open INTEGER)""")
            yield c
    finally:
        c.close()


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def configured():
    return DEMO or bool(KEY and STATION)


def startup_messages():
    msgs = [POLL_NOTE] if POLL_NOTE else []
    if DEMO and KEY and STATION:
        msgs.append("WARNUNG: DEMO=1 ist aktiv, obwohl TK_APIKEY und STATION_ID gesetzt sind – "
                    "DEMO hat Vorrang, es werden synthetische Preise erzeugt und keine echten abgefragt. "
                    "Im Echtbetrieb DEMO=0 setzen.")
    return msgs


# ---- DEMO-Preismuster -------------------------------------------------------------------------
# Wie an echten Tankstellen: ein Preissprung pro Tag kurz nach 12 Uhr, danach Stufen nach unten bis zum
# Tagestief am späten Abend, das bis zum nächsten Mittag steht. Alles eine reine Funktion von ts;
# Tageswerte (Minute, Sprunghöhe, Tief) hängen nur vom Datum ab. Der Zyklus startet bei Vortagstief + Sprung
# (Sprung also exakt 10–14 ct) und fällt in 5 Stufen auf das eigene Tagestief.
STEP_HOURS = (1.5, 3.5, 6, 8.5, 10.5)       # Stunden nach dem Sprung, je eine Stufe nach unten


@functools.lru_cache(maxsize=1024)           # reine Funktion des Datums; spart das Neu-Seeden je Messpunkt
def _day_params(d):
    """(Sprungminute, E5-Sprung ct, E5-Tief ct, Diesel-Sprung ct, Diesel-Tief ct) für das Datum d."""
    r = random.Random(d.toordinal())
    wave = math.sin(2 * math.pi * d.toordinal() / 7)                 # langsame Wochenschwankung
    minute = r.randint(2, 7)
    jump = r.randint(10, 14)
    low = 176 + round(2 * wave) + r.randint(-1, 1)
    djump = min(14, max(10, jump - 2 + r.randint(-1, 1)))             # Diesel-Sprung ebenfalls 10–14 ct
    dlow = 166 + round(1.5 * wave) + r.randint(-1, 1)
    return minute, jump, low, djump, dlow


def _cycle_start(d):
    minute = _day_params(d)[0]
    return datetime(d.year, d.month, d.day, 12, minute, tzinfo=TZ).timestamp()


def _start(d, diesel=False):
    """Startpreis des Zyklus von Tag d in ct: Tief von gestern + Sprung von heute."""
    p = _day_params(d)
    q = _day_params(d - timedelta(days=1))
    return (q[4] + p[3]) if diesel else (q[2] + p[1])


def _cents(start, low, hours):
    """Preis in ct: fällt in 5 möglichst gleichmäßigen Stufen (je mindestens 1 ct) von start auf low.
    Die Tiefs schwanken von Tag zu Tag um höchstens 4 ct, der Sprung ist ≥ 10 ct, also start − low ≥ 6 > Stufenzahl;
    es gibt nie einen Anstieg außer dem Sprung selbst."""
    q, rest = divmod(start - low, len(STEP_HOURS))
    drops = [q + 1] * rest + [q] * (len(STEP_HOURS) - rest)
    done = sum(1 for h in STEP_HOURS if hours >= h)
    return start - sum(drops[:done])


def _eur(cents):
    return round((cents + 0.9) / 100, 3)                              # Preise enden auf ,xx9


def demo_point(ts):
    """Synthetischer Preis (e5, e10, diesel, open) für einen Zeitpunkt – deterministisch."""
    d = datetime.fromtimestamp(ts, TZ).date()
    if ts < _cycle_start(d):
        d -= timedelta(days=1)                                        # es gilt noch der Zyklus von gestern
    _, _, low, _, dlow = _day_params(d)
    hours = (ts - _cycle_start(d)) / 3600
    e5 = _cents(_start(d), low, hours)
    return _eur(e5), _eur(e5 - 6), _eur(_cents(_start(d, True), dlow, hours)), 1


def _demo_foreign(c):
    """True, wenn die DB Zeilen ohne Demo-Markierung enthält (nur lesend)."""
    if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta'").fetchone() and \
            c.execute("SELECT 1 FROM meta WHERE key='demo' AND value='1'").fetchone():
        return False
    return bool(c.execute("SELECT COUNT(*) FROM prices").fetchone()[0])


def _demo_allowed(c):
    """DEMO darf nur in leere oder als Demo markierte DBs schreiben (legt die Markierung bei Bedarf an)."""
    if _demo_foreign(c):
        return False
    if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta'").fetchone() and \
            c.execute("SELECT 1 FROM meta WHERE key='demo' AND value='1'").fetchone():
        return True
    c.execute("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)")
    c.execute("INSERT OR REPLACE INTO meta VALUES('demo','1')")
    return True


DEMO_FOREIGN_ERROR = "DEMO: Datenbank enthält Echtdaten, Demo verweigert"
DEMO_REFUSED = ("DEMO: DB enthält Zeilen ohne Demo-Markierung (meta demo=1) – "
                "es wird nichts geschrieben; für DEMO eine eigene DB_FILE verwenden")


def demo_seed(now):
    """Füllt im 5-min-Raster nach: leere DB = DEMO_DAYS Tage, sonst ab dem letzten ts bis jetzt.
    Gibt die Zahl neuer Zeilen zurück (0, wenn die DB fremde Daten enthält)."""
    with db() as c:
        if not _demo_allowed(c):
            log("WARNUNG:", DEMO_REFUSED)
            return 0
        end = int(now) // STEP * STEP
        first = end - DEMO_DAYS * 86400 + STEP
        last = c.execute("SELECT MAX(ts) FROM prices").fetchone()[0]
        if last is not None:
            first = max(first, (last // STEP + 1) * STEP)
        data = [(ts, *demo_point(ts)) for ts in range(first, end + 1, STEP)]
        c.executemany("INSERT OR REPLACE INTO prices VALUES(?,?,?,?,?)", data)
    return len(data)


def _store(ts, vals, opened):
    """Speichert einen Messpunkt und aktualisiert den state (gemeinsam für live und DEMO)."""
    with db() as c:
        if DEMO and not _demo_allowed(c):
            raise RuntimeError(DEMO_REFUSED)
        c.execute("INSERT OR REPLACE INTO prices VALUES(?,?,?,?,?)",
                  (ts, vals["e5"], vals["e10"], vals["diesel"], 1 if opened else 0))
    with lock:
        state.clear()
        state.update(ok=True, stale=False, error=None, fetched_at=iso(ts), open=bool(opened), **vals)


def poll_once():
    try:
        if DEMO:
            ts = int(time.time())
            ts -= ts % STEP                                           # 5-min-Raster wie demo_seed → keine Doppelpunkte
            e5, e10, diesel, opened = demo_point(ts)
            return _store(ts, {"e5": e5, "e10": e10, "diesel": diesel}, opened)
        if not configured():
            raise RuntimeError(MISSING)
        q = urllib.parse.urlencode({"ids": STATION, "apikey": KEY})
        req = urllib.request.Request(URL + "?" + q, headers={"User-Agent": "sprit-tracker/1.0 (homepage)"})
        d = json.loads(urllib.request.urlopen(req, timeout=20).read())
        if not d.get("ok"):
            raise RuntimeError(d.get("message") or "API-Fehler")
        p = d.get("prices", {}).get(STATION) or {}
        if p.get("status") == "no prices":
            raise RuntimeError("Station meldet keine Preise")
        vals = {f: (p.get(f) if isinstance(p.get(f), (int, float)) else None) for f in FUELS}
        _store(int(time.time()), vals, p.get("status") == "open")
    except Exception as e:  # noqa: BLE001 – Fehler nur melden, letzte Werte bleiben
        with lock:
            state.update(ok=bool(state.get("e5")), stale=True, error=str(e))
        log("Fehler:", e)


def startup():
    """Läuft vor dem Serverstart: Hinweise loggen, DEMO-Daten nachfüllen, letzten Wert laden."""
    for m in startup_messages():
        log(m)
    if DEMO:
        try:
            n = demo_seed(time.time())
            if n:
                log(f"DEMO: {n} Messpunkte erzeugt")
        except Exception as e:  # noqa: BLE001
            log("Fehler: DEMO-Seed fehlgeschlagen:", e)
    try:  # letzten gespeicherten Wert laden, damit /current sofort etwas liefert
        with db() as c:
            if DEMO and _demo_foreign(c):
                return                                                # fremde DB: keinen Echtwert als Demo ausgeben
            r = c.execute("SELECT ts,e5,e10,diesel,open FROM prices ORDER BY ts DESC LIMIT 1").fetchone()
        if r:
            with lock:
                state.update(ok=True, stale=True, error=None, fetched_at=iso(r[0]),
                             e5=r[1], e10=r[2], diesel=r[3], open=bool(r[4]))
    except Exception as e:  # noqa: BLE001
        log("Fehler: DB nicht lesbar:", e)


def start_offset():
    """Einmaliger zufälliger Versatz (s) vor der ersten Abfrage: keine runden Uhrzeiten (Tankerkönig-Empfehlung)."""
    return random.randint(JITTER_MIN, JITTER_MAX)


def poller():
    if not DEMO:                       # im DEMO-Modus gibt es keine Abfrage beim Anbieter
        off = start_offset()
        log(f"erste Abfrage in {off}s (zufälliger Versatz), danach alle {POLL}s")
        time.sleep(off)
    while True:
        poll_once()
        time.sleep(POLL)


def rows(days):
    since = int(time.time()) - days * 86400
    with db() as c:
        return c.execute("SELECT ts,e5,e10,diesel,open FROM prices WHERE ts>=? ORDER BY ts", (since,)).fetchall()


def history(days):
    return {"station": STATION_NAME, "days": days,
            "points": [{"t": iso(t), "e5": a, "e10": b, "diesel": c, "open": bool(o)} for t, a, b, c, o in rows(days)]}


def stats(days, fuel):
    i = 1 + FUELS.index(fuel)
    data = [(r[0], r[i]) for r in rows(days) if r[i]]
    if not data:
        return {"fuel": fuel, "days": days, "samples": 0}
    vals = [v for _, v in data]
    today = datetime.now(TZ).date()
    tvals = [v for t, v in data if datetime.fromtimestamp(t, TZ).date() == today]
    hours, wdays = {}, {}
    for t, v in data:
        lt = datetime.fromtimestamp(t, TZ)
        hours.setdefault(lt.hour, []).append(v)
        wdays.setdefault(lt.weekday(), []).append(v)
    avg = lambda xs: round(sum(xs) / len(xs), 4)
    hour_avg = {h: avg(v) for h, v in sorted(hours.items())}
    with lock:
        cur = dict(state).get(fuel)
    mean = avg(vals)
    best = min(hour_avg, key=hour_avg.get)
    worst = max(hour_avg, key=hour_avg.get)
    return {
        "fuel": fuel, "days": days, "samples": len(vals),
        "first": iso(data[0][0]), "current": cur,
        "today": {"min": min(tvals), "max": max(tvals)} if tvals else None,
        "range": {"min": min(vals), "max": max(vals), "avg": mean},
        "delta_to_avg": round(cur - mean, 4) if cur else None,
        "hour_avg": hour_avg, "best_hour": best, "worst_hour": worst,
        "weekday_avg": {d: avg(v) for d, v in sorted(wdays.items())},  # 0 = Montag
    }


class H(BaseHTTPRequestHandler):
    def send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        days = max(1, min(365, int((q.get("days") or ["7"])[0] or 7)))
        try:
            if u.path in ("/", "/health"):
                with db() as c:
                    n = c.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
                    foreign = DEMO and _demo_foreign(c)
                if foreign:
                    return self.send(200, {"ok": False, "error": DEMO_FOREIGN_ERROR, "demo": True,
                                           "station": STATION_NAME, "samples": n, "poll_seconds": POLL})
                if not configured():
                    return self.send(200, {"ok": False, "error": MISSING, "station": STATION_NAME,
                                           "samples": n, "poll_seconds": POLL})
                return self.send(200, {"ok": True, **({"demo": True} if DEMO else {}),
                                       "station": STATION_NAME, "samples": n, "poll_seconds": POLL})
            if u.path == "/current":
                with lock:
                    return self.send(200, {"station": STATION_NAME, **state, **({"demo": True} if DEMO else {}),
                                           "license": LICENSE_DEMO if DEMO else LICENSE})
            if u.path == "/history":
                return self.send(200, history(days))
            if u.path == "/stats":
                fuel = (q.get("fuel") or ["e5"])[0]
                if fuel not in FUELS:
                    return self.send(400, {"error": "fuel = e5|e10|diesel"})
                return self.send(200, stats(days if "days" in q else 14, fuel))
            self.send(404, {"error": "unbekannt"})
        except Exception as e:  # noqa: BLE001
            self.send(500, {"error": str(e)})

    def log_message(self, *a):
        pass


def main():
    startup()      # DEMO-Seed vor dem Serverstart, damit /history sofort gefüllt ist
    threading.Thread(target=poller, daemon=True).start()
    mode = "DEMO (synthetische Preise)" if DEMO else ("live" if configured() else "NICHT KONFIGURIERT: " + MISSING)
    print(f"sprit-tracker: {STATION_NAME} alle {POLL}s, Port {PORT}, Modus {mode}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()


if __name__ == "__main__":
    main()
