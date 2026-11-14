"""muell-tracker – Abfuhrtermine aus einem iCal-Kalender (+ optionaler Störungshinweis) als JSON für ein Dashboard-Panel.

Alles Ortsbezogene kommt aus der Umgebung (siehe README.md / .env.example), nichts davon steht im Code.

Quellen:
  - Abfuhrtermine: iCal-Export des Entsorgers. ICS_URL (Pflicht ohne DEMO; "{year}" wird durch das Jahr ersetzt),
    optional ICS_FORM (URL-kodiertes Formular mit "{year}"-Platzhaltern -> dann POST statt GET).
    Abgerufen werden aktuelles + nächstes Jahr (das Folgejahr, sobald veröffentlicht).
    Art je Termin: KIND_MAP ("Präfix=key|Präfix=key|…", dann NUR diese Namen) – leer: Schlüsselwörter im SUMMARY.
  - Störungshinweis (optional): NOTICE_URL + NOTICE_HEAD (Überschrift, nach der im HTML gesucht wird).
  - Schadstoffsammlung (optional, stationär): meist kein iCal -> Rhythmus aus einem Tourenplan (PDF).
    SCHAD_ANCHOR = erster Termin je Planjahr, kommagetrennt (z. B. "2027-01-14,2028-01-13");
    jeder Anker gilt bis zum nächsten. Das Jahr des letzten Ankers gilt als „eingespielt“.
  - Plan-Prüfung (optional): SCHAD_PDF = URL-Muster mit "{year}". Ab SCHAD_CHECK_FROM (MM-TT, Standard 12-01)
    des eingespielten Jahres einmal am Tag nachsehen, ob der Plan fürs Folgejahr online ist.
    schad.state: "ok" | "info" (neuer Plan online, noch nicht eingespielt) | "due" (neues Jahr, Plan fehlt).
  - DEMO=1: erfundene Termine, kein Netzzugriff (Referenz/Vorschau).
Speicher: CACHE_FILE (Standard /data/termine.json; letzter guter Stand, wird beim Start geladen).

Endpoints (CORS offen, nur GET):
  /health   -> {"ok": true, "poll_seconds": ..., "events": N, "schad": "ok|info|due", ...}
  /termine  -> {"events": [{"d": "2026-10-14", "k": "bio"}, ...], "notice": {...} | null,
                "schad": {"state", "covered", "need", "online", "url", "checked", "zeit"}, "fetched_at", "stale", "error"}
  (im DEMO-Modus zusätzlich "demo": true)
"""
import html, json, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

def _env(name, default=""):
    return os.environ.get(name, default).strip()


TZ = ZoneInfo(_env("TZ", "Europe/Berlin"))
POLL = max(3600, int(_env("POLL_SECONDS", "21600")))
DEMO = _env("DEMO").lower() in ("1", "true", "yes", "on")
ICS_URL = _env("ICS_URL")      # iCal-Adresse; "{year}" = Jahr
ICS_FORM = _env("ICS_FORM")    # optional: Formular-Body mit "{year}" -> POST
NOTICE_URL = _env("NOTICE_URL")
NOTICE_HEAD = _env("NOTICE_HEAD")
LABEL = _env("LABEL")
KINDS = [k.strip() for k in _env("KINDS", "rest,bio,papier,gelb").split(",") if k.strip()]
SCHAD_ANCHOR = _env("SCHAD_ANCHOR")  # erster Schadstofftermin je Planjahr (kommagetrennt); leer = keine Schadstofftermine
SCHAD_DAYS = int(_env("SCHAD_DAYS", "14"))
SCHAD_ZEIT = _env("SCHAD_ZEIT", "9–12 Uhr")
SCHAD_CHECK_FROM = _env("SCHAD_CHECK_FROM", "12-01")  # ab wann der Plan fürs Folgejahr gesucht wird
SCHAD_PDF = _env("SCHAD_PDF")  # URL-Muster mit "{year}"; leer = keine Planprüfung
PLAN_CHECK_S = 20 * 3600  # höchstens einmal am Tag beim Anbieter nachsehen
CACHE = _env("CACHE_FILE", "/data/termine.json")
UA = {"User-Agent": "Mozilla/5.0 (muell-tracker; homepage dashboard)"}
DEMO_LABEL = "Musterstraße"


def label():
    """Im DEMO-Modus immer die Muster-Beschriftung (nie eine echte LABEL-Adresse in Vorschau/Screenshots)."""
    return DEMO_LABEL if DEMO else LABEL


def parse_kind_map(s):
    """"Präfix=key|Präfix=key" -> [(Präfix, key), …]; kaputte Einträge werden übersprungen."""
    out = []
    for part in (s or "").split("|"):
        pre, sep, key = part.rpartition("=")
        pre, key = pre.strip(), key.strip()
        if sep and pre and key:
            out.append((pre, key))
    return out


KIND_MAP = parse_kind_map(_env("KIND_MAP"))
KNOWN_KINDS = ("rest", "bio", "papier", "gelb")  # Arten, die das Panel kennt (+ eigene aus KINDS)


def kind_map_problems(kind_map, kinds):
    """Meldungen zu KIND_MAP-Schlüsseln, die weder zu KINDS noch zu rest/bio/papier/gelb gehören (Tippfehler)."""
    ok = set(KNOWN_KINDS) | set(kinds or [])
    return [f"KIND_MAP: unbekannter Schlüssel \"{key}\" bei \"{pre}\" (erlaubt: {', '.join(sorted(ok))}) – diese Termine fehlen"
            for pre, key in (kind_map or []) if key not in ok]

# Schlüsselwörter für den Fallback ohne KIND_MAP (Reihenfolge zählt; Kleinschreibung)
KEYWORDS = [
    ("bio", ("bio",)),
    ("papier", ("papier", "pappe")),
    ("gelb", ("gelb", "wertstoff", "leichtverpack")),
    ("rest", ("restmüll", "restmuell", "restabfall", "hausmüll", "hausmuell")),
]
AFFECT = {"restmüll": "rest", "bioabfall": "bio", "biomüll": "bio", "altpapier": "papier", "papier": "papier", "gelbe": "gelb"}
WARN_RE = re.compile(r"verschieb|verzöger|ausfall|ausfälle|störung|entfällt|nicht geleert|nachleerung|später", re.I)

state = {"ok": False, "stale": True, "error": "noch keine Daten", "fetched_at": None, "events": [], "notice": None, "schad": None}
lock = threading.Lock()


def http(url, form=None):
    """GET, oder POST wenn form (URL-kodierter Body als str) gesetzt ist."""
    body = form.encode("utf-8") if form else None
    headers = dict(UA)
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def _unfold(text):
    return re.sub(r"\r?\n[ \t]", "", text)


def _ics_unescape(v):
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), v)


def _dtstart_date(params, value):
    """Kalenderdatum aus DTSTART: DATE, DATE-TIME lokal/mit TZID (Datumsteil), UTC ("…Z") -> in TZ umgerechnet."""
    v = value.strip()
    m = re.fullmatch(r"(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?", v)
    if not m:
        return None
    y, mo, d, hh, mi, ss, z = m.groups()
    try:
        if z:
            utc = datetime(int(y), int(mo), int(d), int(hh), int(mi), int(ss or 0), tzinfo=timezone.utc)
            return utc.astimezone(TZ).date().isoformat()
        return date(int(y), int(mo), int(d)).isoformat()
    except ValueError:
        return None


def _kind_of(name, kind_map):
    """Art zu einem Terminnamen. Mit kind_map NUR dessen Präfixe (Sondertonnen etc. fallen so heraus), sonst Schlüsselwörter."""
    low = name.lower()
    if kind_map:
        for pre, key in kind_map:
            if low.startswith(pre.lower()):
                return key
        return None
    for key, words in KEYWORDS:
        if any(w in low for w in words):
            return key
    return None


def parse_ics(text, kind_map=None):
    """iCal-Text -> {(iso_date, kind)}. Datum aus DTSTART, Art aus SUMMARY (nur der Anfang zählt; Anhängsel wie ein Datum stören nicht).
    kind_map: [(Präfix, key), …] (oder Text "Präfix=key|…"); leer/None = Schlüsselwort-Fallback. Unbekanntes wird ignoriert."""
    if isinstance(kind_map, str):
        kind_map = parse_kind_map(kind_map)
    out, ev, depth = set(), None, 0  # depth = verschachtelte Komponenten im VEVENT (z. B. VALARM mit eigenem SUMMARY)
    for line in _unfold(text).splitlines():
        u = line.strip().upper()
        if u == "BEGIN:VEVENT":  # auch mitten in einem Event: der offene (ohne END) wird verworfen
            ev, depth = {}, 0
        elif ev is None:
            continue
        elif u.startswith("BEGIN:"):
            depth += 1
        elif u == "END:VEVENT" and depth == 0:
            if ev.get("d") and ev.get("s") is not None:
                k = _kind_of(ev["s"].strip(), kind_map)
                if k:
                    out.add((ev["d"], k))
            ev = None
        elif u.startswith("END:"):
            depth -= 1
        elif depth == 0:
            m = re.match(r"(DTSTART|SUMMARY)((?:;[^:]*)?):(.*)$", line, re.I)
            if m:
                if m.group(1).upper() == "DTSTART":
                    ev["d"] = _dtstart_date(m.group(2), m.group(3))
                else:
                    ev["s"] = _ics_unescape(m.group(3))
    return out


def fetch_year(y):
    """Termine eines Jahres aus ICS_URL (GET) bzw. ICS_URL + ICS_FORM (POST), gefiltert auf KINDS."""
    form = ICS_FORM.replace("{year}", str(y)) if ICS_FORM else None
    ics = http(ICS_URL.replace("{year}", str(y)), form)
    if "BEGIN:VCALENDAR" not in ics:
        raise RuntimeError(f"Kalender {y}: keine iCal-Antwort")
    return {(d, k) for d, k in parse_ics(ics, KIND_MAP) if k in KINDS}


def demo_events(today, kinds=None):
    """Erfundene Termine für DEMO (kein Netz): Rest 14 d, Bio 14 d, Papier 28 d, Gelb 14 d, Schadstoff 14 d – je anderer Wochentag."""
    kinds = KINDS if kinds is None else kinds
    rhythm = (("rest", 14, 1), ("bio", 14, 2), ("papier", 28, 3), ("gelb", 14, 4), ("schad", 14, 5))  # (Art, Tage, Versatz)
    out = set()
    for i in range(-30, 431):
        d = today + timedelta(days=i)
        for k, step, off in rhythm:
            if (d.toordinal() - off) % step == 0 and (k == "schad" or k in kinds):
                out.add((d.isoformat(), k))
    return out


def parse_anchors(s):
    out = []
    for part in (s or "").split(","):
        try:
            out.append(date.fromisoformat(part.strip()))
        except ValueError:
            pass
    return sorted(set(out))


def plan_year(anchors):
    return anchors[-1].year if anchors else None


def schad_dates(y0, y1, anchors=None, days=None):
    """Termine je Anker im Rhythmus; ein Anker gilt bis zum nächsten (neues Planjahr)."""
    anchors = parse_anchors(SCHAD_ANCHOR) if anchors is None else anchors
    days = days or SCHAD_DAYS
    end = date(y1, 12, 31)
    out = set()
    for i, d in enumerate(anchors):
        if i + 1 < len(anchors):
            nx = anchors[i + 1]  # neues Planjahr: alter Rhythmus endet am 31.12. davor
            stop = date(nx.year, 1, 1) if nx.year > d.year else nx
        else:
            stop = end + timedelta(days=1)
        while d < stop and d <= end:
            if d.year >= y0:
                out.add((d.isoformat(), "schad"))
            d += timedelta(days=days)
    return out


def _check_from(year, mmdd):
    try:
        m, d = (int(x) for x in mmdd.split("-"))
        return date(year, m, d)
    except (ValueError, TypeError):
        return date(year, 12, 1)


def plan_should_check(today, covered, mmdd):
    """Ab dem Stichtag im eingespielten Jahr (und danach immer) nach dem nächsten Plan suchen."""
    return covered is None or today >= _check_from(covered, mmdd)


def plan_state(today, covered, online, mmdd):
    """ok = nichts zu tun · info = neuer Plan online, noch nicht eingespielt · due = Jahr ohne eingespielten Plan."""
    late = covered is None or today.year > covered
    need = today.year if late else covered + 1
    if late:
        st = "due"
    elif plan_should_check(today, covered, mmdd) and online:
        st = "info"
    else:
        st = "ok"
    return {"state": st, "covered": covered, "need": need}


def pdf_online(url):
    """True, wenn unter url ein PDF liegt (fehlende Jahre beantworten viele Server mit 3xx/404 + HTML)."""
    req = urllib.request.Request(url, headers=dict(UA, Range="bytes=0-1023"))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status in (200, 206) and r.read(5).startswith(b"%PDF")
    except urllib.error.HTTPError:
        return False


def schad_info(now):
    """Plan-Status für das Panel; prüft höchstens alle PLAN_CHECK_S Sekunden, ob der Plan online ist (nur mit SCHAD_PDF)."""
    today = now.date()
    anchors = parse_anchors(SCHAD_ANCHOR)
    covered = plan_year(anchors)
    if not anchors:  # keine Schadstofftermine konfiguriert -> nichts zu pflegen
        return {"state": "ok", "covered": None, "need": today.year, "online": None, "url": "", "checked": None, "zeit": SCHAD_ZEIT}
    with lock:
        old = dict(state.get("schad") or {})
    need = plan_state(today, covered, None, SCHAD_CHECK_FROM)["need"]
    url = SCHAD_PDF.replace("{year}", str(need)) if SCHAD_PDF else ""
    online, checked = old.get("online"), old.get("checked")
    same = old.get("need") == need and old.get("covered") == covered
    if not same:
        online, checked = None, None
    if url and plan_should_check(today, covered, SCHAD_CHECK_FROM):
        last = datetime.fromisoformat(checked) if checked else None
        if not last or (datetime.now(timezone.utc) - last).total_seconds() >= PLAN_CHECK_S:
            try:
                online = pdf_online(url)
                checked = datetime.now(timezone.utc).isoformat()
            except Exception as e:  # Netzfehler: alten Stand behalten, beim nächsten Poll erneut
                print(f"Plan-Prüfung {need}: {e}", flush=True)
    s = plan_state(today, covered, online, SCHAD_CHECK_FROM)
    s.update({"online": online, "url": url, "checked": checked, "zeit": SCHAD_ZEIT})
    return s


def fetch_notice():
    """Hinweis unter der Überschrift NOTICE_HEAD auf NOTICE_URL; ohne beides kein Hinweis (und kein Abruf)."""
    if not NOTICE_URL or not NOTICE_HEAD:
        return None
    t = http(NOTICE_URL)
    i = t.find(NOTICE_HEAD)
    if i < 0:
        return None
    head_m = re.search(re.escape(NOTICE_HEAD) + r"\s*(\(([^)]*)\))?", t[i:i + 300])
    j = t.find("</p>", i)  # Ende des Überschrift-Absatzes
    seg = t[j + 4:j + 4000] if j > 0 else ""
    paras = re.findall(r"<p[^>]*>(.*?)</p>", seg, re.S)
    texts = []
    for p in paras:
        if re.search(r"<strong>\s*<u>", p):  # nächste Überschrift (z. B. Gelbe Tonne)
            break
        s = html.unescape(re.sub(r"<[^>]+>", " ", p)).replace("\xa0", " ")
        s = re.sub(r"\s+", " ", s).strip()
        if not s:
            if texts:
                break
            continue
        texts.append(s)
    text = " ".join(texts).strip()
    if not text:
        return None
    scope = head_m.group(2) if head_m and head_m.group(2) else ""
    affects = sorted({v for w, v in AFFECT.items() if w in scope.lower()})
    return {"head": NOTICE_HEAD, "scope": scope, "affects": affects,
            "text": text[:400], "warn": bool(WARN_RE.search(text))}


def poll_demo(now):
    """DEMO: erfundene Termine, kein Netz, kein Cache."""
    ev = demo_events(now.date())
    year = now.year
    schad = {"state": "ok", "covered": year, "need": year + 1, "online": None, "url": "", "checked": None, "zeit": SCHAD_ZEIT}
    with lock:
        state.update({"ok": True, "stale": False, "error": None, "label": label(),
                      "fetched_at": datetime.now(timezone.utc).isoformat(),
                      "events": [{"d": d, "k": k} for d, k in sorted(ev)], "notice": None, "schad": schad})
    print(f"[{now:%Y-%m-%d %H:%M}] DEMO: {len(ev)} erfundene Termine", flush=True)
    return True


def poll_once():
    now = datetime.now(TZ)
    y = now.year
    if DEMO:
        return poll_demo(now)
    if not ICS_URL:  # Fehlkonfiguration: melden statt abstürzen, kein Netzabruf
        with lock:
            state.update({"ok": False, "stale": True, "error": "ICS_URL fehlt", "events": [], "notice": None, "schad": None})
        print(f"[{now:%Y-%m-%d %H:%M}] Fehler: ICS_URL fehlt", flush=True)
        return False
    try:
        ev = fetch_year(y)
        if not ev:
            raise RuntimeError(f"Kalender {y}: keine Termine gefunden")
        try:
            ev |= fetch_year(y + 1)  # Folgejahr erst ab ca. Dezember vollständig
        except Exception as e:  # Folgejahr ist optional – aber nicht still schlucken
            print(f"[{now:%Y-%m-%d %H:%M}] Folgejahr {y + 1}: {e}", flush=True)
        ev |= schad_dates(y, y + 1)
        try:
            notice = fetch_notice()
            nerr = None
        except Exception as e:  # Hinweis ist optional – Termine trotzdem übernehmen
            with lock:
                notice = state.get("notice")
            nerr = f"Hinweis: {e}"
        try:
            schad = schad_info(now)
        except Exception as e:  # Plan-Status ist optional
            with lock:
                schad = state.get("schad")
            nerr = (nerr + " · " if nerr else "") + f"Schadstoffplan: {e}"
        with lock:
            old = state.get("notice")
            if notice and old and old.get("text") == notice.get("text"):
                notice["seen"] = old.get("seen")
            elif notice:
                notice["seen"] = datetime.now(timezone.utc).isoformat()
            state.update({
                "ok": True, "stale": False, "error": nerr, "label": LABEL,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "events": [{"d": d, "k": k} for d, k in sorted(ev)], "notice": notice, "schad": schad,
            })
            snap = dict(state)
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        with open(CACHE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(snap, f, ensure_ascii=False)
        os.replace(CACHE + ".tmp", CACHE)
        print(f"[{now:%Y-%m-%d %H:%M}] ok: {len(ev)} Termine, Hinweis: {'ja' if notice else 'nein'}"
              f"{' (Warnung)' if notice and notice.get('warn') else ''}, Schadstoffplan: {(schad or {}).get('state')}", flush=True)
        return True
    except Exception as e:
        with lock:
            state.update({"stale": True, "error": str(e)})
        print(f"[{now:%Y-%m-%d %H:%M}] Fehler: {e}", flush=True)
        return False


def poller():
    while True:
        ok = poll_once()
        time.sleep(POLL if ok else 900)  # bei Fehler nach 15 min erneut


def load_cache():
    try:
        with open(CACHE, encoding="utf-8") as f:
            d = json.load(f)
        d.update({"stale": True, "error": "Stand aus Cache"})
        state.update(d)
    except Exception:
        pass


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path.rstrip("/") or "/"
        with lock:
            s = dict(state)
        if p in ("/", "/health"):
            err = " · ".join([e for e in [s["error"]] + kind_map_problems(KIND_MAP, KINDS) if e]) or None
            return self._send(200, {"ok": s["ok"], "stale": s["stale"], "error": err, "fetched_at": s["fetched_at"],
                                    "events": len(s["events"]), "notice": bool(s["notice"]), "poll_seconds": POLL, "label": label(),
                                    "schad": (s.get("schad") or {}).get("state"), **({"demo": True} if DEMO else {})})
        if p == "/termine":
            return self._send(200, dict(s, poll_seconds=POLL, label=label(), **({"demo": True} if DEMO else {})))
        self._send(404, {"error": "unbekannt", "endpoints": ["/health", "/termine"]})

    def log_message(self, *a):
        pass


def make_server(port, host="0.0.0.0"):
    return ThreadingHTTPServer((host, port), H)


def main():
    for w in kind_map_problems(KIND_MAP, KINDS):
        print(f"WARNUNG {w}", flush=True)
    if not DEMO and ICS_URL:
        load_cache()
    threading.Thread(target=poller, daemon=True).start()
    port = int(_env("PORT", "8080"))
    mode = "DEMO" if DEMO else ("ICS_URL fehlt!" if not ICS_URL else "live")
    print(f"muell-tracker auf :{port} · {label() or '-'} · {mode} · Poll alle {POLL} s", flush=True)
    make_server(port).serve_forever()


if __name__ == "__main__":
    main()
