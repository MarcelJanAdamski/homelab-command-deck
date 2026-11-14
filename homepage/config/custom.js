/* ==============================================================
   KONFIG – standortbezogene Einstellungen
   ============================================================== */
/* KONFIG-START */
window.GX_CFG = window.GX_CFG || {
  /* Site-specific settings – edit here. Demo values: a neutral big city and made-up devices. */
  ort: { name: "Berlin", lat: 52.52, lon: 13.41, tz: "Europe/Berlin" },
  /* DWD pollen region (s31fg.json): region_id + partregion_id. Berlin = region 50, no sub-region (-1). */
  dwd: { region: 50, teilregion: -1 },
  muell: {
    label: "Musterstraße",
    quelle: "Stadtwerke",
    quelleLang: "Stadtwerke · Abfuhrkalender",
    schadOrt: "Wertstoffhof",
    schadOrtKurz: "Wertstoffhof",
    pdf: ""
  },
  tanken: { station: "Demo-Tankstelle" },
  /* Label of the UV card in the air panel ("is it pleasant to sit outside?") */
  luft: { uvOrt: "Balkon" },
  /* Host notch: IP -> short name (n), long name (l), icon (pi | pc | router | server) */
  hosts: {
    "10.0.0.10": { n: "Server", l: "Home server", i: "pi" },
    "10.0.0.11": { n: "Mini-PC", l: "Mini-PC", i: "pc" },
    "10.0.0.20": { n: "NAS", l: "NAS", i: "server" },
    "10.0.0.1": { n: "Router", l: "Router", i: "router" }
  },
  /* No own domain in the demo: service links use plain IPs */
  domains: { suffix: "", standard: "10.0.0.10", ausnahmen: {} }
};
/* KONFIG-ENDE */

/* ==============================================================
   HINWEIS – Bezeichnungen in den Blockköpfen
   Bezeichnungen wie „Variante A/B/H2“ in den Kommentaren stammen aus der
   Mock-up-Phase (verglichene Gestaltungsentwürfe) und haben keine Funktion.
   ============================================================== */

/* ==============================================================
   Hintergrund "Sternbilder" (Variante D)
   - Driftendes Sternennetz: Knoten verbunden durch Haarlinien (Stil der Deck-Trenner)
   - Datenpakete wandern über die Verbindungen
   - Cursor hellt Knoten + Linien in der Nähe auf
   - Leises Hintergrund-Sternfeld mit Parallaxe
   - Spotlight-Koordinaten für Panels/Karten (Styles in custom.css)
   Läuft bewusst auch, wenn das System Animationen abschaltet (prefers-reduced-motion).
   ============================================================== */
(function () {
  if (window.__gxGalaxy) return;
  window.__gxGalaxy = true;

  /* ---------- Spotlight: Mausposition relativ zu Panel & Karte ---------- */
  document.addEventListener("pointermove", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var els = [t.closest(".service-card"), t.closest(".services-group"), t.closest(".bookmark > a"), t.closest(".bookmark-group")];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el) continue;
      var r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX - r.left) + "px");
      el.style.setProperty("--my", (e.clientY - r.top) + "px");
    }
  }, { passive: true });

  function start() {
    var TAU = Math.PI * 2;
    var cv = document.createElement("canvas");
    cv.id = "gx-canvas";
    var vig = document.createElement("div");
    vig.id = "gx-vignette";
    vig.style.opacity = ".55";   /* schwächere Vignette, sonst verschwindet das Netz an den Seiten */
    document.body.prepend(vig);
    document.body.prepend(cv);

    var x = cv.getContext("2d");
    var W = 0, H = 0, DPR = 1;
    /* Handy (≤700px): Netzdichte wie PC, ~30 Bilder/s, kein Neuaufbau beim Scrollen */
    var MQ = window.matchMedia ? window.matchMedia("(max-width: 700px)") : null;
    function mob() { return !!(MQ && MQ.matches); }

    function R(a, b) { return a + Math.random() * (b - a); }
    function sprite(size, stops) {
      var c = document.createElement("canvas"); c.width = c.height = size;
      var g = c.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
      g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
    }
    var CG = { a: [122, 162, 255], b: [197, 139, 255], c: [255, 155, 230], w: [215, 222, 255] };
    var GL = {};
    ["a", "b", "c"].forEach(function (k) { var c = CG[k];
      GL[k] = sprite(64, [[0, "rgba(255,255,255,1)"], [.15, "rgba(" + c + ",.85)"], [.45, "rgba(" + c + ",.2)"], [1, "rgba(" + c + ",0)"]]); });
    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

    /* ---------- Maus ---------- */
    var mx = 0, my = 0, px = 0, py = 0, MX = -9999, MY = -9999, mIn = false;
    window.addEventListener("pointermove", function (e) {
      mx = (e.clientX / W - .5) * 2; my = (e.clientY / H - .5) * 2; MX = e.clientX; MY = e.clientY; mIn = true;
    }, { passive: true });
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget) { mIn = false; mx = my = 0; } });

    /* ---------- Szene ---------- */
    var ST = [], N = [], PK = [], L = 150, nextPk = 0;
    function build() {
      ST = [];
      var ns = Math.round(W * H / 6500);
      for (var i = 0; i < ns; i++) {
        var r = Math.random(), c = r < .72 ? "w" : r < .84 ? "a" : r < .94 ? "b" : "c", z = Math.pow(Math.random(), 1.6);
        ST.push({ x: Math.random(), y: Math.random(), z: z, s: .5 + z * 1.4, b: .25 + z * .55, ph: R(0, TAU), f: R(.6, 1.9) / 1000, c: c });
      }
      ST.sort(function (p, q) { return p.c < q.c ? -1 : p.c > q.c ? 1 : 0; });
      var n = mob() ? Math.max(30, Math.min(60, Math.round(W * H / 11000)))
                    : Math.max(90, Math.min(340, Math.round(W * H / 11000)));
      cv.__n = n; cv.__b = (cv.__b || 0) + 1;
      N = []; PK = [];
      for (i = 0; i < n; i++) { var a = R(0, TAU), v = R(.004, .012);
        N.push({ x: R(0, W), y: R(0, H), vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: R(.8, 2), ph: R(0, TAU), c: ["a", "b", "c", "a"][i % 4], hi: 0 }); }
      L = 150 * Math.max(1, Math.min(1.3, W / 1920));
    }
    function resize() {
      /* Handy: Adressleiste ein/aus ändert nur die Höhe → Szene behalten, Leinwand nur wachsen lassen */
      if (mob() && W > 0 && window.innerWidth === W) {
        if (window.innerHeight <= H) return;
        H = window.innerHeight; cv.height = Math.round(H * DPR); x.setTransform(DPR, 0, 0, DPR, 0, 0);
        return;
      }
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }
    window.addEventListener("resize", resize);
    resize();

    var last = performance.now();
    function frame(ts) {
      var dt = Math.min(50, Math.max(0, ts - last)); last = ts;
      px += (mx - px) * .035; py += (my - py) * .035;
      x.setTransform(DPR, 0, 0, DPR, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#02030c"); g.addColorStop(1, "#05061c");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = "lighter";

      /* Sternfeld (Parallaxe) */
      var cur = "", i, j, a, b;
      for (i = 0; i < ST.length; i++) {
        var s = ST[i];
        if (s.c !== cur) { cur = s.c; x.fillStyle = rgba(CG[cur], 1); }
        x.globalAlpha = s.b * (.55 + .45 * Math.sin(ts * s.f + s.ph)) * .55;
        x.fillRect(s.x * W - px * 8 * (.3 + s.z), s.y * H - py * 5.6 * (.3 + s.z), s.s, s.s);
      }

      /* Knoten bewegen, Cursor-Nähe */
      var L2 = L * L;
      for (i = 0; i < N.length; i++) { a = N[i]; a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < -20) a.x += W + 40; else if (a.x > W + 20) a.x -= W + 40;
        if (a.y < -20) a.y += H + 40; else if (a.y > H + 20) a.y -= H + 40;
        var dm = Math.hypot(a.x - MX, a.y - MY), want = mIn && dm < 220 ? 1 - dm / 220 : 0;
        a.hi += (want - a.hi) * .08; }

      /* Linien: nach Stärke in 5 Stufen gebündelt, Cursor-Linien extra */
      var B = [[], [], [], [], []], HI = [];
      for (i = 0; i < N.length; i++) for (j = i + 1; j < N.length; j++) {
        a = N[i]; b = N[j]; var dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 > L2) continue;
        var k = 1 - Math.sqrt(d2) / L, h = Math.max(a.hi, b.hi);
        if (h > .15) HI.push([a, b, k * h]); else B[Math.min(4, Math.floor(k * k * 5))].push(a, b);
      }
      x.strokeStyle = "rgb(160,178,255)"; x.lineWidth = .9;
      for (var q = 0; q < 5; q++) { if (!B[q].length) continue; x.globalAlpha = .08 + q * .07; x.beginPath();
        for (i = 0; i < B[q].length; i += 2) { x.moveTo(B[q][i].x, B[q][i].y); x.lineTo(B[q][i + 1].x, B[q][i + 1].y); } x.stroke(); }
      x.strokeStyle = "rgb(214,170,255)"; x.lineWidth = 1;
      for (i = 0; i < HI.length; i++) { x.globalAlpha = .1 + .45 * HI[i][2]; x.beginPath();
        x.moveTo(HI[i][0].x, HI[i][0].y); x.lineTo(HI[i][1].x, HI[i][1].y); x.stroke(); }

      /* Datenpakete */
      if (ts > nextPk && !document.hidden) { nextPk = ts + R(250, 700);
        for (var t = 0; t < 12; t++) { i = Math.floor(Math.random() * N.length); j = Math.floor(Math.random() * N.length);
          if (i !== j && Math.hypot(N[i].x - N[j].x, N[i].y - N[j].y) < L * .9) { PK.push({ a: N[i], b: N[j], t0: ts, d: R(1400, 2400), c: N[i].c }); break; } } }
      for (i = PK.length - 1; i >= 0; i--) { var p = PK[i], u = Math.max(0, (ts - p.t0) / p.d);
        if (u >= 1 || Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y) > L) { PK.splice(i, 1); continue; }
        var e = u * u * (3 - 2 * u), qx = p.a.x + (p.b.x - p.a.x) * e, qy = p.a.y + (p.b.y - p.a.y) * e;
        x.globalAlpha = Math.sin(Math.PI * u) * .9; x.drawImage(GL[p.c], qx - 6, qy - 6, 12, 12); }

      /* Knoten */
      for (i = 0; i < N.length; i++) { a = N[i]; var tw = .6 + .4 * Math.sin(ts / 1400 + a.ph), gs = (a.s * 4.5 + a.hi * 9) * (.8 + .2 * tw);
        x.globalAlpha = .5 + .3 * tw + .2 * a.hi; x.drawImage(GL[a.c], a.x - gs / 2, a.y - gs / 2, gs, gs);
        x.globalAlpha = .7 + .3 * a.hi; x.fillStyle = "#e9ecff"; x.fillRect(a.x - a.s / 4, a.y - a.s / 4, a.s / 2, a.s / 2); }
      x.globalAlpha = 1;
    }
    /* Ein fehlerhafter Frame darf die Animation nie dauerhaft stoppen */
    var lastF = -1e9;
    function draw(ts) {
      if (mob() && ts - lastF < 30) { requestAnimationFrame(draw); return; }   /* Handy: ~30 Bilder/s */
      lastF = ts; cv.__f = (cv.__f || 0) + 1;
      try { frame(ts); }
      catch (e) {
        console.warn("gx-bg frame", e);
        x.setTransform(DPR, 0, 0, DPR, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();

/* ==============================================================
   Wetter-Deck (Open-Meteo, kein API-Key nötig)
   - Jetzt: Zustand, Temperatur, gefühlt, Luftfeuchte, Wind (Richtungspfeil),
     Regenrisiko, UV, Luftdruck, Bewölkung
   - 24-h-Verlauf: animierte Temperaturkurve, Regenbalken, Nachtbänder
   - 7-Tage-Vorschau mit Temperaturspannen
   - Sonnenbogen mit Auf-/Untergang
   Panel #gx-wx sitzt im Kopf-Grid (grid-area: deck), Styles in custom.css.
   Daten: alle 15 min neu, Zwischenspeicher in localStorage.
   ============================================================== */
(function () {
  if (window.__gxWx) return;
  window.__gxWx = true;

  function cfg(p, d) { var o = window.GX_CFG, k = p.split("."); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== "object") return d; o = o[k[i]]; } return o == null ? d : o; }
  /* Zahl aus der Konfiguration: nur echte Zahlen oder nicht-leere Zahlen-Strings, sonst NaN */
  function cnum(v) { return typeof v === "number" || (typeof v === "string" && /\S/.test(v)) ? Number(v) : NaN; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* Standard-Ort (Berlin) nur, wenn ort.lat/ort.lon FEHLEN; ungültige Werte starten keinen Abruf (LOK) */
  var LAT = cnum(cfg("ort.lat", 52.52)), LON = cnum(cfg("ort.lon", 13.41)), PLACE = String(cfg("ort.name", "Ort"));
  var LOK = isFinite(LAT) && isFinite(LON) && Math.abs(LAT) <= 90 && Math.abs(LON) <= 180;
  var TZ = encodeURIComponent(String(cfg("ort.tz", "Europe/Berlin")));
  var CACHE = "gxWx.v1", FETCH_MS = 15 * 60 * 1000, TICK_MS = 5 * 60 * 1000, RETRY_MS = 2 * 60 * 1000;
  var API = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day" +
    "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max" +
    "&timezone=" + TZ + "&forecast_days=8";  /* 8. Tag nur für den 24-Uhr-Punkt am 7. Tag */

  var DATA = null, ROOT = null, introDone = false, chartSize = "";
  /* Tagesauswahl: -1 = nächste 24 h, sonst Index im daily-Block; springt nach 60 s ohne Aktivität zurück */
  var SEL = -1, selTimer = 0, lastArm = 0, RESET_MS = 60 * 1000;
  /* Ruhiges Auffrischen: Inhalt nur tauschen, wenn sich das HTML wirklich geändert hat
     (sonst laufen Dauer-Animationen ungestört weiter); force = immer neu (Intro/Tagesklick) */
  function setH(el, h, force) { if (!force && el.__h === h) return false; el.innerHTML = h; el.__h = h; return true; }
  var playT = 0;
  /* Einstiegs-Effekte freigeben (Intro + Tab-Wechsel zum Wetter), danach wieder ruhig */
  function play() { if (!ROOT) return; ROOT.classList.add("gx-wx-play"); clearTimeout(playT); playT = setTimeout(function () { ROOT.classList.remove("gx-wx-play"); }, 2600); }
  var WDL = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

  var TXT = { 0: "Klar", 1: "Überwiegend klar", 2: "Teils bewölkt", 3: "Bedeckt", 45: "Nebel", 48: "Reifnebel",
    51: "Leichter Niesel", 53: "Nieselregen", 55: "Starker Niesel", 56: "Gefrierender Niesel", 57: "Gefrierender Niesel",
    61: "Leichter Regen", 63: "Regen", 65: "Starker Regen", 66: "Gefrierender Regen", 67: "Gefrierender Regen",
    71: "Leichter Schnee", 73: "Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
    80: "Leichte Schauer", 81: "Regenschauer", 82: "Heftige Schauer", 85: "Schneeschauer", 86: "Starke Schneeschauer",
    95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Gewitter mit Hagel" };
  var WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

  function kind(c) {
    if (c <= 1) return "clear";
    if (c === 2) return "partly";
    if (c === 3) return "cloud";
    if (c === 45 || c === 48) return "fog";
    if (c >= 95) return "storm";
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
    return "rain";
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function deg(n) { var v = Math.round(n); return (v === 0 ? 0 : v) + "°"; }
  function nf(v, dg) { return Number(v).toLocaleString("de-DE", { maximumFractionDigits: dg || 0 }); }
  function dirName(d) { return DIRS[Math.round((((d % 360) + 360) % 360) / 45) % 8]; }
  function dur(ms) {
    var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
    m -= h * 60;
    return (h ? h + " h " : "") + m + " min";
  }

  /* ---------- Wetter-Symbole (animiert über CSS) ---------- */
  var CLOUD_D = "M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 17.7 9.1 4.5 4.5 0 0 1 17 18z";
  var CLOUD = '<path class="gx-i-cloud" d="' + CLOUD_D + '"/>';
  var CLOUD_FILL = '<path class="gx-i-cloud" fill="#151741" d="' + CLOUD_D + '"/>';
  var MOON = '<path class="gx-i-moon" d="M14.5 3.6A8.5 8.5 0 1 0 20.4 15 7 7 0 0 1 14.5 3.6z" fill="currentColor" fill-opacity=".18"/>';
  var DROP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c3.4 4.4 6 7.6 6 10.8a6 6 0 0 1-12 0C6 10.6 8.6 7.4 12 3z"/></svg>';

  function sun(cx, cy, r, l) {
    var s = '<g class="gx-i-sun"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="currentColor" fill-opacity=".22"/><g class="gx-i-rays">';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, c = Math.cos(a), sn = Math.sin(a), r1 = r + 1.6, r2 = r + 1.6 + l;
      s += '<line x1="' + f1(cx + c * r1) + '" y1="' + f1(cy + sn * r1) + '" x2="' + f1(cx + c * r2) + '" y2="' + f1(cy + sn * r2) + '"/>';
    }
    return s + "</g></g>";
  }
  function icon(k, night, cls, attrs) {
    var b = "";
    if (k === "clear") b = night ? MOON : sun(12, 12, 4.4, 2.6);
    else if (k === "partly") b = (night ? '<g transform="translate(-1.5 -2.5) scale(.72)">' + MOON + "</g>" : sun(8, 8, 3, 1.8)) +
      '<g transform="translate(2.2 3.2) scale(.86)"><g class="gx-i-drift">' + CLOUD_FILL + "</g></g>";
    else if (k === "cloud") b = '<g transform="translate(0 -.5)"><g class="gx-i-drift">' + CLOUD + "</g></g>";
    else {
      b = '<g transform="translate(0 -4)"><g class="gx-i-drift">' + CLOUD + "</g></g>";
      if (k === "fog") b += '<line class="gx-i-fog" x1="5" y1="18" x2="19" y2="18"/><line class="gx-i-fog gx-i-fog2" x1="7" y1="21.5" x2="17" y2="21.5"/>';
      if (k === "rain") b += '<line class="gx-i-drop" x1="8.5" y1="17" x2="7.5" y2="20"/><line class="gx-i-drop" x1="12.5" y1="17" x2="11.5" y2="20"/><line class="gx-i-drop" x1="16.5" y1="17" x2="15.5" y2="20"/>';
      if (k === "snow") b += '<circle class="gx-i-flake" cx="8" cy="18.5" r=".9" fill="currentColor"/><circle class="gx-i-flake" cx="12" cy="20.5" r=".9" fill="currentColor"/><circle class="gx-i-flake" cx="16" cy="18.5" r=".9" fill="currentColor"/>';
      if (k === "storm") b += '<path class="gx-i-bolt" d="M13 13.5l-2.6 4.6h3.2L11.5 22.5"/>';
    }
    return '<svg class="gx-ico gx-ico-' + k + (night ? " gx-ico-night" : "") + (cls ? " " + cls : "") + '" ' + (attrs || "") +
      ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + b + "</svg>";
  }

  /* ---------- Gerüst ---------- */
  function build() {
    var s = document.createElement("section");
    s.id = "gx-wx";
    s.setAttribute("aria-label", "Wetter " + PLACE);
    s.innerHTML =
      '<header class="gx-wx-head"><span class="gx-wx-title"><i></i>Wetter · ' + esc(PLACE) + '</span><span class="gx-wx-upd">' + (LOK ? "lädt …" : "Ort nicht konfiguriert") + '</span></header>' +
      '<div class="gx-wx-grid">' +
      '<div class="gx-wx-col gx-wx-now"></div>' +
      '<div class="gx-wx-col gx-wx-hours"><div class="gx-wx-hhead"><div class="gx-wx-sub">Nächste 24 Stunden</div></div><div class="gx-wx-chart"></div></div>' +
      '<div class="gx-wx-col gx-wx-days"><div class="gx-wx-sub">7 Tage</div><ul></ul></div>' +
      "</div>";
    /* Klick auf einen Tag → Tagesverlauf 00–24 Uhr; gleicher Tag / ↺ / Esc → zurück */
    s.addEventListener("click", function (e) {
      if (e.target.closest(".gx-back")) { if (SEL >= 0) select(SEL); return; }
      var li = e.target.closest(".gx-wx-days li[data-i]");
      if (li) select(+li.getAttribute("data-i"));
    });
    s.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && SEL >= 0) { select(SEL); return; }
      var li = e.target.closest && e.target.closest(".gx-wx-days li[data-i]");
      if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); select(+li.getAttribute("data-i")); }
    });
    s.addEventListener("pointermove", function () { if (SEL >= 0 && Date.now() - lastArm > 1000) arm(); }, { passive: true });
    return s;
  }

  function hourIndex(d) {
    var t = d.hourly.time, now = Date.now(), i;
    for (i = 0; i < t.length; i++) {
      var s = new Date(t[i]).getTime();
      if (now >= s && now < s + 3600000) return i;
    }
    var key = d.current.time.slice(0, 13);
    for (i = 0; i < t.length; i++) if (t[i].slice(0, 13) === key) return i;
    return 0;
  }

  /* ---------- Jetzt ---------- */
  function renderNow(el, d, i0) {
    var c = d.current, dl = d.daily, h = d.hourly, k = kind(c.weather_code);
    var p3 = 0;
    for (var i = i0; i < Math.min(i0 + 3, h.time.length); i++) p3 = Math.max(p3, h.precipitation_probability[i] || 0);
    var na = Math.max(-100, Math.min(100, (c.pressure_msl - 1013) * 3.3)) * Math.PI / 180;
    var nx = f1(12 + 5.2 * Math.sin(na)), ny = f1(13.8 - 5.2 * Math.cos(na));
    var I = {
      hum: '<path d="M12 3.5c3.2 4.2 5.6 7.2 5.6 10.2a5.6 5.6 0 0 1-11.2 0C6.4 10.7 8.8 7.7 12 3.5z"/><path class="gx-t-wave" d="M9 14.5c1 .8 2 .8 3 0s2-.8 3 0"/>',
      wind: '<g transform="rotate(' + Math.round(c.wind_direction_10m + 180) + ' 12 12)"><g class="gx-t-wobble"><path d="M12 3.5l5.5 16-5.5-3.6-5.5 3.6z" fill="currentColor" fill-opacity=".25"/></g></g>',
      rain: '<path d="M3.5 12.5a8.5 8.5 0 0 1 17 0z"/><path d="M12 12.5v6a2 2 0 0 1-4 0"/><path d="M12 2.5v1.5"/>',
      uv: sun(12, 12, 3.6, 2.2),
      press: '<path d="M4.4 16.3a8 8 0 1 1 15.2 0"/><line class="gx-t-needle" x1="12" y1="13.8" x2="' + nx + '" y2="' + ny + '"/><circle cx="12" cy="13.8" r="1.2" fill="currentColor"/>',
      cloud: '<g class="gx-i-drift">' + CLOUD + "</g>"
    };
    var T = [
      ["hum", nf(c.relative_humidity_2m), "%", "Luftfeuchte"],
      ["wind", nf(c.wind_speed_10m), "km/h", "aus " + dirName(c.wind_direction_10m) + " · Böen " + nf(c.wind_gusts_10m)],
      ["rain", p3, "%", "Regen · 3 h"],
      ["uv", nf(c.uv_index, 1), "", "UV · max " + nf(dl.uv_index_max[0], 1)],
      ["press", nf(c.pressure_msl), "hPa", "Luftdruck"],
      ["cloud", nf(c.cloud_cover), "%", "Bewölkung"]
    ];
    var tiles = "";
    for (i = 0; i < T.length; i++) {
      tiles += '<div class="gx-wx-tile gx-t-' + T[i][0] + '" style="--d:' + i + '"><span class="gx-wx-ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        I[T[i][0]] + '</svg></span><span class="gx-wx-tv"><b>' + T[i][1] + (T[i][2] ? "<small>" + T[i][2] + "</small>" : "") + "</b><em>" + T[i][3] + "</em></span></div>";
    }
    setH(el,
      '<div class="gx-wx-sub">Jetzt</div>' +
      '<div class="gx-wx-hero">' + icon(k, !c.is_day, "gx-ico-xl") +
      '<div class="gx-wx-temp">' + deg(c.temperature_2m) + "</div>" +
      '<div class="gx-wx-heroinfo"><div class="gx-wx-cond">' + (TXT[c.weather_code] || "–") + "</div>" +
      '<div class="gx-wx-feel">Gefühlt <b>' + deg(c.apparent_temperature) + '</b><span class="gx-hi">↑ ' + deg(dl.temperature_2m_max[0]) +
      '</span><span class="gx-lo">↓ ' + deg(dl.temperature_2m_min[0]) + "</span></div></div></div>" +
      '<div class="gx-wx-tiles">' + tiles + '</div><div class="gx-wx-sun"></div>');
    var sw = el.querySelector(".gx-wx-sun");
    setH(sw, sunArc(sw.clientWidth || 300, d));
  }

  /* ---------- Sonnenbogen ---------- */
  function sunArc(W, d) {
    var dl = d.daily, now = new Date(), rise = new Date(dl.sunrise[0]), set = new Date(dl.sunset[0]);
    var H = 80, base = 54, x0 = 20, x1 = W - 20, cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, ry = 42;
    var f = (now - rise) / (set - rise), day = f > 0 && f < 1, ff = Math.max(0, Math.min(1, f));
    var th = Math.PI * (1 - ff), sx = cx + rx * Math.cos(th), sy = base - ry * Math.sin(th);
    var arc = "M" + x0 + " " + base + " A" + f1(rx) + " " + ry + " 0 0 1 " + x1 + " " + base;
    var info;
    if (day) info = "noch " + dur(set - now) + " Tageslicht";
    else if (now < rise) info = "Sonnenaufgang in " + dur(rise - now);
    else info = dl.sunrise[1] ? "Aufgang morgen " + hm(new Date(dl.sunrise[1])) : "Tageslänge " + dur(set - rise);
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true" data-g="' + [x0, base, f1(cx), f1(rx), ry, ff, W, day ? 1 : 0].join(",") + '"><defs>' +
      '<linearGradient id="gxSunG" x1="0" x2="1"><stop offset="0" stop-color="#ffb46b"/><stop offset=".55" stop-color="#ffd59a"/><stop offset="1" stop-color="#ff9be6"/></linearGradient>' +
      '<linearGradient id="gxSunA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc58a" stop-opacity=".26"/><stop offset="1" stop-color="#ffc58a" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="gxSunC"><rect class="gx-sun-cr" x="0" y="0" width="' + f1(sx) + '" height="' + base + '"/></clipPath>' +
      '<clipPath id="gxSunT"><rect class="gx-sun-tr" x="0" y="-20" width="' + W + '" height="' + (base + 24) + '"/></clipPath></defs>' +
      '<line class="gx-sun-hz" x1="4" x2="' + (W - 4) + '" y1="' + base + '" y2="' + base + '"/>' +
      '<path class="gx-sun-track" clip-path="url(#gxSunT)" d="' + arc + '"/>';
    if (ff > 0) s += '<g clip-path="url(#gxSunC)"><path class="gx-sun-area" d="' + arc + 'Z" fill="url(#gxSunA)"/><path class="gx-sun-done" d="' + arc + '" stroke="url(#gxSunG)"/></g>';
    if (day) {
      s += '<circle class="gx-sun-halo" cx="' + f1(sx) + '" cy="' + f1(sy) + '" r="6"><animate attributeName="r" values="6;17" dur="2.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2.8s" repeatCount="indefinite"/></circle>' +
        '<circle class="gx-sun-dot" cx="' + f1(sx) + '" cy="' + f1(sy) + '" r="5.5"/>';
    } else {
      var mx = now < rise ? x0 : x1;
      s += '<circle class="gx-sun-night" cx="' + mx + '" cy="' + base + '" r="3.5"/>';
    }
    s += '<text class="gx-sun-l" x="' + x0 + '" y="' + (H - 4) + '">↑ ' + hm(rise) + "</text>" +
      '<text class="gx-sun-r" x="' + x1 + '" y="' + (H - 4) + '">↓ ' + hm(set) + "</text>" +
      '<text class="gx-sun-info" x="' + f1(cx) + '" y="' + (H - 4) + '">' + info + "</text></svg>";
    return s;
  }

  /* Sonnenbogen einzeichnen (Variante B · Sonne läuft mit): Sonne startet am
     Horizont und läuft zur aktuellen Position, Linie entsteht hinter ihr.
     Nachts: Bahn zeichnet sich links→rechts, dann erscheint der Nachtpunkt. */
  function sunPlay() {
    var svg = ROOT && ROOT.querySelector(".gx-wx-sun svg[data-g]");
    if (!svg) return;
    var g = svg.getAttribute("data-g").split(",").map(Number);
    var x0 = g[0], base = g[1], cx = g[2], rx = g[3], ry = g[4], F = g[5], W = g[6], day = g[7] === 1;
    var q = function (c) { return svg.querySelector(c); };
    var tr = q(".gx-sun-tr"), trk = q(".gx-sun-track"), cr = q(".gx-sun-cr"), area = q(".gx-sun-area"),
      dn = q(".gx-sun-done"), dot = q(".gx-sun-dot"), halo = q(".gx-sun-halo"), nd = q(".gx-sun-night");
    function pt(f) { var th = Math.PI * (1 - f); return [cx + rx * Math.cos(th), base - ry * Math.sin(th)]; }
    function tw(ms, fn, done) {
      var t0 = performance.now();
      (function st(n) {
        if (!svg.isConnected) return;
        var t = Math.max(0, Math.min(1, (n - t0) / ms)), e = 1 - Math.pow(1 - t, 3);
        fn(e);
        if (t < 1) requestAnimationFrame(st); else if (done) done();
      })(t0);
    }
    if (day && dot) {
      if (halo) halo.style.display = "none";
      trk.style.opacity = 0;
      tw(400, function (e) { trk.style.opacity = e; });
      tw(1300, function (e) {
        var f = F * e, p = pt(f);
        if (dn) dn.setAttribute("d", f > 0.001 ? "M" + x0 + " " + base + " A" + rx + " " + ry + " 0 0 1 " + f1(p[0]) + " " + f1(p[1]) : "M0 0");
        dot.setAttribute("cx", f1(p[0])); dot.setAttribute("cy", f1(p[1]));
        if (cr) cr.setAttribute("width", f1(p[0]));
        if (area) area.style.opacity = e;
      }, function () { if (halo) halo.style.display = ""; });
    } else if (nd) {
      nd.setAttribute("r", 0); tr.setAttribute("width", 0);
      tw(700, function (e) { tr.setAttribute("width", f1(W * e)); }, function () {
        tw(380, function (e) { nd.setAttribute("r", f1(3.5 * Math.min(1, e * 1.4))); });
      });
    }
  }

  /* Monotone kubische Glättung (kein Überschwingen) für Regenkurven */
  function mono(P) {
    var n = P.length, dx = [], m = [], tg = [], i;
    for (i = 0; i < n - 1; i++) { dx.push(P[i + 1][0] - P[i][0]); m.push((P[i + 1][1] - P[i][1]) / dx[i]); }
    tg[0] = m[0]; tg[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
      var a = tg[i] / m[i], b = tg[i + 1] / m[i], q = a * a + b * b;
      if (q > 9) { var k = 3 / Math.sqrt(q); tg[i] = k * a * m[i]; tg[i + 1] = k * b * m[i]; }
    }
    var s = "M" + f1(P[0][0]) + " " + f1(P[0][1]);
    for (i = 0; i < n - 1; i++) s += " C" + f1(P[i][0] + dx[i] / 3) + " " + f1(P[i][1] + tg[i] * dx[i] / 3) + " " +
      f1(P[i + 1][0] - dx[i] / 3) + " " + f1(P[i + 1][1] - tg[i + 1] * dx[i] / 3) + " " + f1(P[i + 1][0]) + " " + f1(P[i + 1][1]);
    return s;
  }
  /* Regenfenster: zusammenhängende Stunden mit ≥ 40 % */
  function rainWin(P) {
    var w = [], a = -1;
    for (var i = 0; i < P.length; i++) {
      if (P[i] >= 40) { if (a < 0) a = i; } else if (a >= 0) { w.push([a, i - 1]); a = -1; }
    }
    if (a >= 0) w.push([a, P.length - 1]);
    return w;
  }
  /* Regen-Box (Variante C): nur Stunden mit ≥ 40 % UND ≥ 0,2 mm – echte Regenstunden statt bloßer Wahrscheinlichkeit */
  function rainWet(P, M) {
    var Q = [];
    for (var i = 0; i < P.length; i++) Q.push(P[i] >= 40 && (M[i] || 0) >= 0.2 ? 100 : 0);
    return rainWin(Q);
  }
  function rainWord(mm) { return mm < 0.3 ? "kaum" : mm < 5 ? "leicht" : mm < 15 ? "mäßig" : "kräftig"; }
  var RCOL = ["#4d528f", "#7aa2ff", "#b9a8ff"];
  function rcol(v) { return v >= 50 ? RCOL[2] : v >= 20 ? RCOL[1] : RCOL[0]; }
  /* Unwetter-Stufen (wie KI-Kontingent): 2 = Gewitter (Code ≥ 95 bei ≥ 40 %) oder ≥ 10 mm/h, 1 = Starkregen ≥ 4 mm/h bzw. ≥ 25 mm/Tag */
  var SEV = [null, { c1: "#ffb547", c2: "#ff7ad9" }, { c1: "#ff4d6d", c2: "#ff8a5c" }];
  function sevH(p, m, c) { return (c >= 95 && p >= 40) || m >= 10 ? 2 : m >= 4 ? 1 : 0; }
  function sevRange(d, s0, n) {
    var h = d.hourly, r = { lv: 0, a: -1, b: -1, mx: 0, sum: 0, storm: false };
    if (s0 < 0) return r;
    for (var i = 0; i < n && s0 + i < h.time.length; i++) {
      var p = h.precipitation_probability[s0 + i] || 0, m = h.precipitation[s0 + i] || 0, c = h.weather_code[s0 + i], l = sevH(p, m, c);
      r.sum += m; r.mx = Math.max(r.mx, m);
      if (l) { r.lv = Math.max(r.lv, l); if (r.a < 0) r.a = i; r.b = i; if (c >= 95 && p >= 40) r.storm = true; }
    }
    if (!r.lv && r.sum >= 25) r.lv = 1;
    return r;
  }
  function sevName(r) { return r.storm ? "⚡ Gewitter" : "⚠ Starkregen"; }
  /* Vorschau ohne echtes Unwetter: URL-Hash #wxdemo=warn oder #wxdemo=crit (in ca. 5 h, nächste 24 h + Tagesansicht) */
  function wxDemo(d) {
    var m = /wxdemo=(warn|crit)/.exec(location.hash);
    if (!m) return d;
    d = JSON.parse(JSON.stringify(d));
    var h = d.hourly, b = hourIndex(d) + 5, cr = m[1] === "crit", j;
    var MM = cr ? [1, 4.5, 12.4, 18.2, 8.6, 2.4, .4] : [.6, 2.2, 5.4, 7.1, 5.8, 2.6, .8], PP = [45, 55, 68, 80, 90, 92, 88, 78, 65, 50];
    for (j = 0; j < PP.length; j++) if (b - 2 + j < h.time.length) h.precipitation_probability[b - 2 + j] = Math.max(h.precipitation_probability[b - 2 + j] || 0, PP[j]);
    for (j = 0; j < MM.length; j++) if (b + j < h.time.length) { h.precipitation[b + j] = MM[j]; h.weather_code[b + j] = j >= 1 && j <= 4 ? (cr ? 95 : 81) : 61; }
    for (var k = 0; k < d.daily.time.length; k++) {
      var s0 = dayStart(d, k), sm = 0, mx = 0, st = false;
      for (j = 0; j < 24 && s0 >= 0 && s0 + j < h.time.length; j++) { sm += h.precipitation[s0 + j] || 0; mx = Math.max(mx, h.precipitation_probability[s0 + j] || 0); if (h.weather_code[s0 + j] >= 95) st = true; }
      d.daily.precipitation_sum[k] = Math.round(sm * 10) / 10; d.daily.precipitation_probability_max[k] = mx;
      if (st) d.daily.weather_code[k] = 95; else if (sm >= 25 || mx >= 80) d.daily.weather_code[k] = Math.max(d.daily.weather_code[k], 63);
    }
    return d;
  }

  /* ---------- 24-h-Verlauf ---------- */
  function renderChart(el, d, i0, anim, day, mk) {
    if (!day) mk = 0;
    var W = Math.max(260, el.clientWidth), H = Math.max(200, el.clientHeight);
    chartSize = W + "x" + H;
    var h = d.hourly, N = Math.min(25, h.time.length - i0), i;
    if (N < 2) { setH(el, "", true); return; }
    var T = [], P = [], C = [], DY = [], TM = [], M = [];
    for (i = 0; i < N; i++) {
      T.push(h.temperature_2m[i0 + i]); P.push(h.precipitation_probability[i0 + i] || 0);
      C.push(h.weather_code[i0 + i]); DY.push(h.is_day[i0 + i]); TM.push(h.time[i0 + i]); M.push(h.precipitation[i0 + i] || 0);
    }
    var padX = 18, step = (W - 2 * padX) / (N - 1), yTop = 56, yBot = H - 86, barB = H - 22;
    var tmin = Math.min.apply(null, T), tmax = Math.max.apply(null, T), sp = Math.max(tmax - tmin, 5), lo = (tmax + tmin) / 2 - sp / 2;
    function X(n) { return padX + n * step; }
    function Y(v) { return yBot - ((v - lo) / sp) * (yBot - yTop); }
    var pts = [];
    for (i = 0; i < N; i++) pts.push([X(i), Y(T[i])]);
    var dd = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    for (i = 0; i < N - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      dd += " C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) + " " +
        f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) + " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    var s = '<svg class="gx-wx-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><defs>' +
      '<linearGradient id="gxwxLine" gradientUnits="userSpaceOnUse" x1="0" y1="' + yTop + '" x2="0" y2="' + yBot + '"><stop offset="0" stop-color="#ff9be6"/><stop offset=".5" stop-color="#c58bff"/><stop offset="1" stop-color="#7aa2ff"/></linearGradient>' +
      '<linearGradient id="gxwxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c58bff" stop-opacity=".32"/><stop offset="1" stop-color="#7aa2ff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="gxwxRain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fdcff"/><stop offset="1" stop-color="#4b6bff" stop-opacity=".35"/></linearGradient>' +
      '<filter id="gxwxGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>';
    /* Tag & Nacht (Variante C · Sternennacht, ohne Uhrzeiten): Grenzen minutengenau aus Sonnenauf-/-untergang,
       Nacht dunkel mit funkelnden Sternen (Positionen stabil je Nacht), Tag mit warmem Licht von oben */
    var dnT0 = new Date(TM[0]).getTime(), dnDays = [], dnN = [], dnA = 0, dnK, dl0 = d.daily;
    function XT(t) { return X(0) + (t - dnT0) / 3600000 * step; }
    if (dl0 && dl0.sunrise && dl0.sunrise.length) {
      for (dnK = 0; dnK < dl0.sunrise.length; dnK++) {
        var dnR = XT(new Date(dl0.sunrise[dnK]).getTime()), dnS = XT(new Date(dl0.sunset[dnK]).getTime());
        if (dnS > 0 && dnR < W) dnDays.push([Math.max(0, dnR), Math.min(W, dnS)]);
      }
    } else {
      for (i = 0; i < N; i++) {
        if (!DY[i]) continue;
        var dnJ = i;
        while (dnJ + 1 < N && DY[dnJ + 1]) dnJ++;
        dnDays.push([Math.max(0, X(i) - step / 2), Math.min(W, X(dnJ) + step / 2)]);
        i = dnJ;
      }
    }
    for (dnK = 0; dnK < dnDays.length; dnK++) { if (dnDays[dnK][0] > dnA + 1) dnN.push([dnA, dnDays[dnK][0]]); dnA = dnDays[dnK][1]; }
    if (dnA < W - 1) dnN.push([dnA, W]);
    s += '<defs><radialGradient id="gxwxDay" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#ffd59a" stop-opacity=".20"/><stop offset=".55" stop-color="#ff9be6" stop-opacity=".06"/><stop offset="1" stop-color="#ff9be6" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="gxwxNg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03041a" stop-opacity=".62"/><stop offset="1" stop-color="#0a0b3a" stop-opacity=".38"/></linearGradient></defs>';
    for (dnK = 0; dnK < dnN.length; dnK++) {
      var na = dnN[dnK][0], nb = dnN[dnK][1], nw = nb - na, fe = step * 0.9;
      if (nw < 2) continue;
      var fl = na > 1 ? Math.min(.5, fe / nw) : 0, fr = nb < W - 1 ? Math.min(.5, fe / nw) : 0;
      s += '<defs><linearGradient id="gxwxNe' + dnK + '" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="' + (fl ? 0 : 1) + '"/><stop offset="' + fl.toFixed(3) + '" stop-color="#fff"/><stop offset="' + (1 - fr).toFixed(3) + '" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="' + (fr ? 0 : 1) + '"/></linearGradient>' +
        '<mask id="gxwxNm' + dnK + '"><rect x="' + f1(na) + '" y="0" width="' + f1(nw) + '" height="' + H + '" fill="url(#gxwxNe' + dnK + ')"/></mask></defs>' +
        '<g class="gx-wx-night" mask="url(#gxwxNm' + dnK + ')"><rect x="' + f1(na) + '" y="0" width="' + f1(nw) + '" height="' + (H - 16) + '" rx="12" fill="url(#gxwxNg)"/>';
      var seed = Math.round((dnT0 + (na - X(0)) / step * 3600000) / 3600000) % 233280;
      var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (var sn = Math.round(nw / 9); sn > 0; sn--) {
        var sx = na + 6 + rnd() * (nw - 12), sy = 30 + rnd() * (barB - 90), sr = .5 + rnd() * .9;
        s += '<circle class="gx-wx-star" cx="' + f1(sx) + '" cy="' + f1(sy) + '" r="' + sr.toFixed(2) + '" style="--d:' + (2.2 + rnd() * 3).toFixed(1) + "s;--l:" + (rnd() * 3).toFixed(1) + 's"/>';
      }
      s += "</g>";
    }
    for (dnK = 0; dnK < dnDays.length; dnK++)
      s += '<rect class="gx-wx-dayglow" x="' + f1(dnDays[dnK][0]) + '" y="0" width="' + f1(dnDays[dnK][1] - dnDays[dnK][0]) + '" height="' + (H - 16) + '" rx="12" fill="url(#gxwxDay)"/>';
    s += '<line class="gx-wx-base" x1="' + padX + '" x2="' + (W - padX) + '" y1="' + barB + '" y2="' + barB + '"/>';
    /* Regen (K3): Fenster, Risiko-Kurve 0–100 %, Mengen-Hügel – Farbe je Stunde nach Wahrscheinlichkeit */
    var LH = 44, PY = function (v) { return barB - v / 100 * LH; }, q, z;
    s += '<defs><linearGradient id="gxwxPg" gradientUnits="userSpaceOnUse" x1="' + f1(X(0)) + '" x2="' + f1(X(N - 1)) + '" y1="0" y2="0">';
    var LV = 0, SH = [];
    for (i = 0; i < N; i++) { SH.push(sevH(P[i], M[i], C[i])); if (i < N - 1) LV = Math.max(LV, SH[i]); }
    var SR = sevRange(d, i0, N - 1);
    if (!LV && SR.lv) LV = SR.lv;
    el.__sev = SR; SR.lv = LV;
    for (i = 0; i < N; i++) s += '<stop offset="' + f1(i / (N - 1) * 1000) / 1000 + '" stop-color="' + (SH[i] ? SEV[SH[i]].c1 : rcol(P[i])) + '"/>';
    s += '</linearGradient>' +
      '<linearGradient id="gxwxZg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9a8ff" stop-opacity=".02"/><stop offset=".6" stop-color="#b9a8ff" stop-opacity=".07"/><stop offset="1" stop-color="#b9a8ff" stop-opacity=".13"/></linearGradient>' +
      '<linearGradient id="gxwxHf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>' +
      '<mask id="gxwxHm"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#gxwxHf)"/></mask>' +
      (LV ? '<linearGradient id="gxwxRz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + SEV[LV].c1 + '" stop-opacity=".03"/><stop offset=".55" stop-color="' + SEV[LV].c1 + '" stop-opacity=".12"/><stop offset="1" stop-color="' + SEV[LV].c2 + '" stop-opacity=".24"/></linearGradient>' : "") + '</defs>';
    /* Zonen-Label (D4): zweizeilig am Zonenfuß über der Regenspur – Art + Uhrzeit / max. Wahrscheinlichkeit · mm/h.
       Läuft die Temperaturkurve dort zu tief, weicht das Label nach oben aus. */
    /* Gestaffelt (Variante C): kollidiert ein Label mit einem schon gesetzten, rutscht es eine Etage höher
       (max. 3) und bekommt eine gestrichelte Leitlinie zum Zonenfuß */
    var zPl = [];
    function zHit(x, y, w, h) {
      for (var k = 0; k < zPl.length; k++) { var b = zPl[k]; if (x < b[0] + b[2] + 4 && x + w + 4 > b[0] && y < b[1] + b[3] + 4 && y + h + 4 > b[1]) return true; }
      return false;
    }
    function zLabel(cls, cx0, head, pp, mmh, stroke) {
      var t2 = pp + " %" + (mmh ? " · " + mmh : ""), h = 32, w = Math.max(head.length, t2.length) * 5.7 + 18;
      var cx = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, cx0)), x = cx - w / 2, y0 = barB - LH - 8 - h, y = y0, lv = 0, lead = "";
      for (var k = 0; k < pts.length; k++) if (pts[k][0] > x - 14 && pts[k][0] < x + w + 14 && pts[k][1] > y - 6) { y = 30; break; }
      while (zHit(x, y, w, h) && lv < 3) { lv++; y = y === 30 ? 30 + lv * (h + 8) : y0 - lv * (h + 8); }
      zPl.push([x, y, w, h]);
      if (y + h < barB - LH - 12 && lv) {
        var lx = f1(Math.min(x + w - 8, Math.max(x + 8, cx0))), lc = stroke || "rgba(197,180,255,.55)";
        lead = '<line x1="' + lx + '" x2="' + lx + '" y1="' + f1(y + h) + '" y2="' + (barB - LH - 4) + '" style="stroke:' + lc + ';stroke-width:1;stroke-dasharray:2 3;opacity:.8"/>' +
          '<circle cx="' + lx + '" cy="' + (barB - LH - 4) + '" r="2" style="fill:' + (stroke || "#c9c2ff") + '"/>';
      }
      return '<g class="' + cls + '">' + lead + '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(w) + '" height="' + h + '" rx="9"' + (stroke ? ' stroke="' + stroke + '"' : "") + "/>" +
        '<text x="' + f1(cx) + '" y="' + f1(y + 13) + '">' + head + '</text><text class="gx-l2" x="' + f1(cx) + '" y="' + f1(y + 26) + '">' + t2 + "</text></g>";
    }
    var win = rainWet(P, M), zl = "", zmxM = Math.max(1.5, Math.max.apply(null, M));
    for (q = 0; q < win.length; q++) {
      var r = win[q], xa = Math.max(4, X(r[0]) - step / 2), xb = Math.min(W - 4, X(r[1]) + step / 2);
      var e = Math.min(N - 1, r[1] + 1), hA = new Date(TM[r[0]]).getHours(), hB = new Date(TM[e]).getHours();
      if (day && e > 0 && hB === 0) hB = 24;
      var lab = "☂ " + (r[0] === 0 && !day ? "Jetzt" : pad(hA)) + "–" + pad(hB) + " Uhr";
      var lw = lab.length * 5.6 + 16, cx = Math.min(W - lw / 2 - 6, Math.max(lw / 2 + 6, (xa + xb) / 2));
      /* Helligkeit der Box folgt stundenweise der Regenmenge */
      var zst = "";
      for (z = r[0]; z <= r[1]; z++) zst += '<stop offset="' + f1((X(z) - xa) / Math.max(1, xb - xa) * 1000) / 1000 + '" stop-color="#b9a8ff" stop-opacity="' + (0.06 + 0.32 * Math.min(1, M[z] / zmxM)).toFixed(3) + '"/>';
      s += '<defs><linearGradient id="gxwxZc' + q + '" gradientUnits="userSpaceOnUse" x1="' + f1(xa) + '" x2="' + f1(xb) + '" y1="0" y2="0">' + zst + '</linearGradient></defs>' +
        '<rect class="gx-wx-zone" x="' + f1(xa) + '" y="26" width="' + f1(xb - xa) + '" height="' + (H - 42) + '" rx="12" fill="url(#gxwxZc' + q + ')"/>';
      var zpp = 0;
      var zsm = 0;
      for (z = r[0]; z <= r[1]; z++) { zpp = Math.max(zpp, P[z]); zsm += M[z] || 0; }
      zl += zLabel("gx-wx-zl", (xa + xb) / 2, lab, zpp, zsm >= 0.05 ? nf(zsm, 1) + " mm" : "", "");
    }
    if (LV) {
      zl = ""; zPl = [];
      for (i = 0; i < N - 1; i++) {
        if (!SH[i]) continue;
        var a2 = i, st = false;
        while (i + 1 < N - 1 && SH[i + 1]) i++;
        var zmx = 0, zpp2 = 0;
        for (z = a2; z <= i; z++) { if (C[z] >= 95 && P[z] >= 40) st = true; zmx = Math.max(zmx, M[z]); zpp2 = Math.max(zpp2, P[z]); }
        var dxa = Math.max(4, X(a2) - step / 2), dxb = Math.min(W - 4, X(i) + step * 1.5), e2 = Math.min(N - 1, i + 1);
        var dhB = new Date(TM[e2]).getHours(); if (day && dhB === 0) dhB = 24;
        var dlab = (st ? "⚡ Gewitter " : "⚠ Starkregen ") + pad(new Date(TM[a2]).getHours()) + "–" + pad(dhB) + " Uhr";
        var dlw = dlab.length * 5.7 + 18, dcx = Math.min(W - dlw / 2 - 6, Math.max(dlw / 2 + 6, (dxa + dxb) / 2));
        s += '<rect class="gx-wx-dz" x="' + f1(dxa) + '" y="26" width="' + f1(dxb - dxa) + '" height="' + (H - 42) + '" rx="12" fill="url(#gxwxRz)" stroke="' + SEV[LV].c1 + '"/>';
        zl += zLabel("gx-wx-dl gx-sev" + LV, (dxa + dxb) / 2, dlab, zpp2, nf(zmx, 1) + " mm/h", SEV[LV].c1);
      }
    }
    var pp = [], hp = [], mxr = Math.max(1.5, Math.max.apply(null, M));
    for (i = 0; i < N; i++) { pp.push([X(i), PY(P[i])]); hp.push([X(i), barB - Math.min(1, M[i] / mxr) * (LV ? 40 : 30)]); }
    var pd = mono(pp), hd = mono(hp), foot = " L" + f1(X(N - 1)) + " " + barB + " L" + f1(X(0)) + " " + barB + "Z";
    s += '<path class="gx-wx-riskarea" d="' + pd + foot + '" fill="url(#gxwxPg)"/>' +
      '<line class="gx-wx-r50" x1="' + padX + '" x2="' + (W - padX) + '" y1="' + f1(PY(50)) + '" y2="' + f1(PY(50)) + '"/>' +
      '<path class="gx-wx-risk" d="' + pd + '" stroke="url(#gxwxPg)"/>' +
      '<g mask="url(#gxwxHm)"><path class="gx-wx-hill" d="' + hd + foot + '" fill="url(#gxwxPg)"/></g>' +
      '<path class="gx-wx-hilll" d="' + hd + '" stroke="url(#gxwxPg)"/>';
    /* Fläche + Kurve */
    s += '<path class="gx-wx-area" fill="url(#gxwxArea)" d="' + dd + " L" + f1(X(N - 1)) + " " + (yBot + 16) + " L" + f1(X(0)) + " " + (yBot + 16) + 'Z"/>' +
      '<path class="gx-wx-glowline" stroke="url(#gxwxLine)" filter="url(#gxwxGlow)" d="' + dd + '"/>' +
      '<path class="gx-wx-line" stroke="url(#gxwxLine)" d="' + dd + '"/>';
    /* Beschriftung alle 3 Stunden */
    var U = '<tspan class="gx-u"> Uhr</tspan>';
    for (i = 0; i < N; i += 3) {
      var x = X(i), y = Y(T[i]), dt = new Date(TM[i]);
      s += '<line class="gx-wx-tick" x1="' + f1(x) + '" x2="' + f1(x) + '" y1="' + f1(y + 7) + '" y2="' + barB + '"/>' +
        icon(kind(C[i]), !DY[i], "gx-ico-chart", 'x="' + f1(x - 10) + '" y="4" width="20" height="20"') +
        '<text class="gx-wx-t" x="' + f1(x) + '" y="' + f1(y - 11) + '">' + deg(T[i]) + "</text>" +
        '<text class="gx-wx-h' + (i || day ? "" : " now") + '" x="' + f1(x) + '" y="' + (H - 4) + '">' +
        (day ? pad(i ? dt.getHours() || 24 : 0) + U : i ? pad(dt.getHours()) + U : "Jetzt") + "</text>";
    }
    /* Spitze der Regenwahrscheinlichkeit + Zonen-Label */
    var pk = 0, pv = 0;
    for (i = 0; i < N; i++) if (P[i] > pv) { pv = P[i]; pk = i; }
    if (LV) {
      var mk2 = 0, mv = 0;
      for (i = 0; i < N - 1; i++) if (M[i] > mv) { mv = M[i]; mk2 = i; }
      var kx = X(mk2), ky = hp[mk2][1], kc = SEV[LV].c1;
      s += '<circle class="gx-wx-warn" cx="' + f1(kx) + '" cy="' + f1(ky) + '" r="7" stroke="' + kc + '"/><circle class="gx-wx-warn gx-w2" cx="' + f1(kx) + '" cy="' + f1(ky) + '" r="7" stroke="' + kc + '"/>' +
        '<circle class="gx-wx-pkd" cx="' + f1(kx) + '" cy="' + f1(ky) + '" r="3.2" style="filter:drop-shadow(0 0 5px ' + kc + ')"/>';
    } else if (pv >= 15) s += '<text class="gx-wx-pk" x="' + f1(Math.min(X(pk), W - 24)) + '" y="' + f1(PY(pv) - 5) + '" fill="' + rcol(pv) + '">' + pv + " %</text>";
    s += zl;
    /* Jetzt-Marker + wandernder Lichtpunkt */
    if (mk >= 0 && mk < N) s += '<circle class="gx-wx-ring" cx="' + f1(pts[mk][0]) + '" cy="' + f1(pts[mk][1]) + '" r="5"><animate attributeName="r" values="5;16" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="2.4s" repeatCount="indefinite"/></circle>' +
      '<circle class="gx-wx-dot" cx="' + f1(pts[mk][0]) + '" cy="' + f1(pts[mk][1]) + '" r="4.2"/>';
    s += '<circle class="gx-wx-comet" r="3"><animateMotion dur="9s" repeatCount="indefinite" path="' + dd + '"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="9s" repeatCount="indefinite"/></circle>' +
      "</svg>";
    if (!setH(el, s, anim)) return;
    el.classList.toggle("gx-wx-intro", !!anim);
    if (anim) lineDraw(el);
  }
  /* Temperaturkurve einzeichnen (Intro, Tagesklick, Tab-Wechsel zum Wetter) */
  function lineDraw(el) {
    var paths = el.querySelectorAll(".gx-wx-line, .gx-wx-glowline"), i;
    for (i = 0; i < paths.length; i++) {
      var L = paths[i].getTotalLength();
      paths[i].style.transition = "none";
      paths[i].style.strokeDasharray = L;
      paths[i].style.strokeDashoffset = L;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var q = 0; q < paths.length; q++) {
          paths[q].style.transition = "stroke-dashoffset 2.2s cubic-bezier(.45,.05,.2,1)";
          paths[q].style.strokeDashoffset = "0";
        }
      });
    });
  }

  /* ---------- 7 Tage ---------- */
  function renderDays(ul, d) {
    var dl = d.daily, n = Math.min(7, dl.time.length), lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < n; i++) { lo = Math.min(lo, dl.temperature_2m_min[i]); hi = Math.max(hi, dl.temperature_2m_max[i]); }
    var span = Math.max(1, hi - lo), cur = d.current.temperature_2m, html = "";
    for (i = 0; i < n; i++) {
      var dt = new Date(dl.time[i] + "T12:00");
      var name = i === 0 ? "Heute" : i === 1 ? "Morgen" : WD[dt.getDay()];
      var tmin = dl.temperature_2m_min[i], tmax = dl.temperature_2m_max[i], pp = dl.precipitation_probability_max[i] || 0;
      var a = (tmin - lo) / span * 100, b = (tmax - lo) / span * 100;
      var cp = Math.max(a, Math.min(b, (cur - lo) / span * 100));
      var mm = dl.precipitation_sum[i], sv = sevRange(d, dayStart(d, i), 24);
      html += '<li data-i="' + i + '" tabindex="0" role="button" aria-pressed="false" class="' + (sv.lv ? " gx-sev" + sv.lv : "") + '"' + ' style="--d:' + i + '" title="' + (TXT[dl.weather_code[i]] || "") + (mm ? " · " + nf(mm, 1) + " mm" : "") + '">' +
        '<span class="gx-d-name">' + name + "</span>" + icon(kind(dl.weather_code[i]), false, "gx-ico-sm") +
        '<span class="gx-d-rain' + (pp < 20 && !sv.lv ? " dim" : "") + '">' + (sv.lv ? "<i>" + (sv.storm ? "⚡" : "⚠") + "</i>" : DROP) + pp + "%</span>" +
        '<span class="gx-d-lo">' + deg(tmin) + "</span>" +
        '<span class="gx-d-bar"><i style="left:' + f1(a) + "%;width:" + f1(Math.max(2, b - a)) + '%"></i>' + (i === 0 ? '<b style="left:' + f1(cp) + '%"></b>' : "") + "</span>" +
        '<span class="gx-d-hi">' + deg(tmax) + "</span></li>";
    }
    setH(ul, html);
    markSel();
  }
  /* Auswahl nur als Klassen setzen (nicht im HTML), damit setH() die Liste beim Auffrischen stehen lässt */
  function markSel() {
    var lis = ROOT.querySelectorAll(".gx-wx-days li[data-i]");
    for (var q = 0; q < lis.length; q++) {
      if (lis[q].classList.contains("gx-sel") !== (q === SEL)) lis[q].classList.toggle("gx-sel", q === SEL);
      lis[q].setAttribute("aria-pressed", q === SEL ? "true" : "false");
    }
  }

  /* ---------- Tagesverlauf (Klick auf einen Tag) ---------- */
  function dayStart(d, k) {
    var t = d.hourly.time, key = d.daily.time[k];
    for (var i = 0; i < t.length; i++) if (t[i].slice(0, 10) === key) return i;
    return -1;
  }
  function rainChip(d, k, pp, mm) {
    var s0 = dayStart(d, k), Ph = [], Mh = [];
    if (s0 >= 0) for (var i = 0; i < 24 && s0 + i < d.hourly.time.length; i++) { Ph.push(d.hourly.precipitation_probability[s0 + i] || 0); Mh.push(d.hourly.precipitation[s0 + i] || 0); }
    var w = rainWet(Ph, Mh), t = "";
    if (w.length) {
      var a = w[0][0], b = w[w.length - 1][1];
      t = (a === 0 ? (b >= 23 ? "ganztags" : "bis " + pad(b + 1) + " Uhr") : "ab " + pad(a) + " Uhr") + " · ";
    }
    return '<span class="gx-chip gx-chip-rain' + (w.length ? " gx-hot" : "") + '" title="Regen ' + rainWord(mm) + '">' + DROP + t + pp + " % · <b>" + nf(mm, 1) + " mm</b></span>";
  }
  function dayHead(d, k) {
    var sv = sevRange(d, dayStart(d, k), 24);
    var dl = d.daily, dt = new Date(dl.time[k] + "T12:00"), pp = dl.precipitation_probability_max[k] || 0, mm = dl.precipitation_sum[k] || 0;
    var name = k === 0 ? "Heute" : k === 1 ? "Morgen" : WDL[dt.getDay()];
    return '<span class="gx-dh-t">' + name + "<em>" + pad(dt.getDate()) + "." + pad(dt.getMonth() + 1) + ".</em></span>" +
      '<span class="gx-chip" title="' + (TXT[dl.weather_code[k]] || "") + '">' + icon(kind(dl.weather_code[k]), false, "gx-ico-chip") +
      "<b>" + deg(dl.temperature_2m_max[k]) + "</b>/ " + deg(dl.temperature_2m_min[k]) + "</span>" +
      (sv.lv ? '<span class="gx-chip gx-sevchip gx-sev' + sv.lv + '">' + (sv.storm ? "⚡ Unwetter" : "⚠ Starkregen") + "</span>" +
        '<span class="gx-chip gx-chip-rain gx-sev' + sv.lv + '">' + pp + " % · <b>" + nf(mm, 1) + " mm</b></span>" :
      rainChip(d, k, pp, mm) +
      '<span class="gx-chip gx-chip-sun"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' +
      sun(12, 12, 4, 2.6) + "</svg>" + hm(new Date(dl.sunrise[k])) + "–" + hm(new Date(dl.sunset[k])) + "</span>") +
      '<button type="button" class="gx-back gx-bkA" title="Zurück zu den nächsten 24 Stunden (Esc) – springt sonst nach 60 s von selbst zurück" aria-label="Zurück zu den nächsten 24 Stunden">' +
      '<svg class="gx-bk-ring" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="gxBkG" x1="0" x2="1"><stop offset="0" stop-color="#7aa2ff"/><stop offset="1" stop-color="#ff9be6"/></linearGradient></defs>' +
      '<circle class="gx-bk-trk" cx="12" cy="12" r="11"/><circle class="gx-bk-prg" cx="12" cy="12" r="11"/></svg>' +
      '<svg class="gx-bk-x" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>';
  }
  function renderHours(d, i0, anim) {
    var hd = ROOT.querySelector(".gx-wx-hhead"), ch = ROOT.querySelector(".gx-wx-chart");
    var s0 = SEL >= 0 && SEL < Math.min(7, d.daily.time.length) ? dayStart(d, SEL) : -1;
    if (s0 < 0) SEL = -1;
    hd.classList.toggle("gx-day", SEL >= 0);
    if (SEL < 0) {
      renderChart(ch, d, i0, anim, false, 0);
      var sv = ch.__sev || { lv: 0 };
      setH(hd, '<div class="gx-wx-sub">Nächste 24 Stunden</div>' + (sv.lv && sv.a >= 0 ? '<span class="gx-chip gx-sevchip gx-sev' + sv.lv + '">' + sevName(sv) +
        " ab " + pad(new Date(d.hourly.time[i0 + sv.a]).getHours()) + " Uhr · bis " + nf(sv.mx, 1) + " mm/h</span>" : ""), anim);
    } else {
      setH(hd, dayHead(d, SEL), anim);
      renderChart(ch, d, s0, anim, true, SEL === 0 ? i0 - s0 : -1);
    }
    var lv = (ch.__sev || {}).lv || 0;
    ROOT.classList.toggle("gx-sev1", lv === 1);
    ROOT.classList.toggle("gx-sev2", lv === 2);
    if (SEL < 0) { window.__gxWxLv = lv; try { window.dispatchEvent(new Event("gx-wx-lv")); } catch (e) {} }  /* Stufe nächste 24 h für Reiter */
    bkSync();
  }
  /* Countdown-Ring am Zurück-Button: leert sich bis zum Auto-Reset */
  function bkSync() {
    var p = ROOT && ROOT.querySelector(".gx-back .gx-bk-prg");
    if (!p) return;
    p.style.animation = "none"; void p.getBoundingClientRect();
    p.style.animation = "gx-bk-drain " + RESET_MS + "ms linear " + (-Math.min(RESET_MS, Math.max(0, Date.now() - lastArm))) + "ms forwards";
  }
  function arm() {
    clearTimeout(selTimer);
    lastArm = Date.now();
    if (SEL >= 0) selTimer = setTimeout(function () { if (SEL >= 0) select(SEL); }, RESET_MS);
    bkSync();
  }
  function select(k) {
    if (!DATA || !ROOT) return;
    SEL = k === SEL ? -1 : k;
    markSel();
    try { var dd0 = wxDemo(DATA.d); renderHours(dd0, hourIndex(dd0), true); } catch (e) { console.warn("gx-wx day", e); }
    arm();
  }

  /* ---------- Ablauf ---------- */
  function render(anim) {
    if (!ROOT || !ROOT.isConnected || !DATA) return false;
    /* versteckt (Tab Tanken): nicht mit Breite 0 zeichnen, beim Einblenden nachholen */
    if (!ROOT.offsetWidth) { ROOT.__pend = true; return true; }
    ROOT.__pend = false;
    var d = wxDemo(DATA.d), i0 = hourIndex(d);
    try {
      ROOT.classList.add("gx-wx-ready");
      /* Einstiegs-Effekte (Kacheln, 7-Tage-Zeilen) nur beim Intro, nicht bei jedem Auffrischen */
      if (anim) play();
      ROOT.querySelector(".gx-wx-upd").innerHTML = '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · Stand ' + hm(new Date(DATA.t));
      renderNow(ROOT.querySelector(".gx-wx-now"), d, i0);
      if (anim) sunPlay();
      renderDays(ROOT.querySelector(".gx-wx-days ul"), d);
      renderHours(d, i0, anim);
    } catch (e) {
      console.warn("gx-wx render", e);
    }
    return true;
  }
  window.addEventListener("hashchange", function () { if (DATA) render(false); });
  /* vom Tab-Umschalter aufgerufen, sobald #gx-wx wieder sichtbar ist */
  window.__gxWxShow = function () {
    play();
    if (ROOT && ROOT.__pend && DATA) render(false);
    try { sunPlay(); } catch (e) {}
    var ch = ROOT && ROOT.querySelector(".gx-wx-chart");
    if (ch && ch.firstElementChild) { ch.classList.add("gx-wx-intro"); try { lineDraw(ch); } catch (e) {} }
  };
  function first() {
    if (render(!introDone)) introDone = true;
  }

  function load() {
    if (!LOK) return;  /* ungültiger Ort → kein Abruf (Hinweis steht im Panel) */
    fetch(API, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d.current || !d.hourly || !d.daily) throw new Error("Unerwartetes Format");
        DATA = { t: Date.now(), d: d };
        try { localStorage.setItem(CACHE, JSON.stringify(DATA)); } catch (e) {}
        fresh = true;
        if (introDone) render(false); else first();
        setTimeout(load, FETCH_MS);
      })
      .catch(function (e) {
        console.warn("gx-wx fetch", e);
        if (DATA) { if (!introDone) first(); }
        else if (ROOT) ROOT.querySelector(".gx-wx-upd").textContent = "Wetterdaten nicht erreichbar – neuer Versuch in 2 min";
        setTimeout(load, RETRY_MS);
      });
  }

  function mount() {
    var wrap = document.getElementById("widgets-wrap");
    if (!wrap) return;
    if (!ROOT) ROOT = build();
    if (ROOT.parentNode !== wrap) {
      wrap.appendChild(ROOT);
      if (introDone) render(false);
      else if (DATA && fresh) first();
      if (window.ResizeObserver && !ROOT.__ro) {
        var tm = 0;
        ROOT.__ro = new ResizeObserver(function () {
          clearTimeout(tm);
          tm = setTimeout(function () {
            var ch = ROOT.querySelector(".gx-wx-chart");
            if (ch && DATA && ch.clientWidth + "x" + ch.clientHeight !== chartSize) render(false);
          }, 180);
        });
        ROOT.__ro.observe(ROOT.querySelector(".gx-wx-chart"));
        ROOT.__ro.observe(ROOT.querySelector(".gx-wx-now"));
      }
    }
  }

  /* Start: frischer Cache (< 15 min) sofort, sonst zuerst laden */
  var cached = null;
  try { if (LOK) cached = JSON.parse(localStorage.getItem(CACHE) || "null"); } catch (e) {}  /* Cache evtl. von anderem Ort */
  var age = cached && cached.t ? Date.now() - cached.t : Infinity;
  if (cached && cached.d) DATA = cached;
  var fresh = age < FETCH_MS && !!(DATA && DATA.d.daily && DATA.d.daily.time.length >= 8);  /* alter 7-Tage-Cache → neu laden */
  function boot() {
    mount();
    new MutationObserver(function () { if (!ROOT || !ROOT.isConnected) mount(); })
      .observe(document.body, { childList: true, subtree: true });
    if (DATA && fresh) { if (!introDone) first(); setTimeout(load, FETCH_MS - age); }
    else load();
    setInterval(function () { if (introDone) render(false); }, TICK_MS);
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();

/* ==============================================================
   KI-Kontingent-Deck (Variante A2, rechts neben der Uhr)
   - Daten: Zusatz-Container "claude-usage" (über das Gateway: /claude/usage),
     der Demo-Werte liefert (sidecars/claude-usage/README.md). Kein Token im Browser.
   - Sitzung (5 h) + Woche: Orbit-Ring "frei", Countdown, Verbrauchsbalken
     mit Zeitmarke (verstrichene Zeit im Fenster), Zeitplan-Hinweis.
   - Farben: < 70 % ok (cyan/violett), ab 70 % knapp (amber), ab 90 % kritisch
     (rot, Panel glüht, Hinweis). Styles: Block KONTINGENT-DECK in custom.css.
   - Abruf alle 60 s, Countdown jede Sekunde neu.
   ============================================================== */
(function () {
  if (window.__gxCl) return;
  window.__gxCl = true;

  var FETCH_MS = 60 * 1000, CACHE = "gxCl.v1";
  var API = location.origin + "/claude/usage"; /* claude-usage im Stack, über das Gateway (kein eigener Port) */
  var DATA = null, ROOT = null, ERR = null, gid = 0;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function col(p) {
    return p >= 90 ? ["#ff4d6d", "#ff8a5c", "h", "kritisch"] : p >= 70 ? ["#ffb547", "#ff7ad9", "w", "knapp"] : ["#5ee7ff", "#c58bff", "ok", "entspannt"];
  }
  function cd(t, now) {
    var s = Math.max(0, Math.round((t - now) / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d) return d + " T " + (h % 24) + " h";
    if (h) return h + ":" + pad(m % 60) + " h";
    return m + ":" + pad(s % 60) + " min";
  }
  function win(o, len, now) {
    if (!o || o.used == null) return null;
    /* keine laufende Sitzung bzw. Reset-Zeitpunkt vorbei: Fenster ist sicher leer */
    if (!o.resets_at) return { used: 0, idle: true, since: null, pace: 0 };
    var reset = new Date(o.resets_at), start = new Date(reset - len);
    if (reset <= now) return { used: 0, idle: true, since: reset, pace: 0 };
    return { used: Math.max(0, Math.min(100, Math.round(o.used))), reset: reset, start: start,
      pace: Math.max(0, Math.min(100, (now - start) / len * 100)) };
  }

  var LOGO = '<span class="gx-cl-logo"><svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="#9aa4e0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 18a8.5 8.5 0 1 1 15 0"/><path d="M12 14l4-4.5"/></g><circle cx="12" cy="14" r="1.7" fill="#9aa4e0"/></svg></span>';

  /* Schwarzes Loch (G2·6·4 Silber) am Ringende – ersetzt den weißen Satelliten-Punkt */
  function bhole(px, py, id, lv) {
    var hot = lv === 2, p = hot ? ["#ffe2d6", "#ff7a5c", "#b8233c", "#4a0a18"] : lv === 1 ? ["#fff1d6", "#ffc66b", "#c77a1c", "#4a2a08"] : ["#ffffff", "#e6ecff", "#9aa6d6", "#30365a"],
      k = 0.9, R = 4 * k, H = 6.4 * k, DX = 12 * k, DY = 2.6 * k * 0.6, b = id + "bh", f = function (n) { return (+n).toFixed(2); };
    var arc = function (sweep) { return '<path d="M' + f(-DX) + ' 0 A' + f(DX) + ' ' + f(DY) + ' 0 0 ' + sweep + ' ' + f(DX) + ' 0" fill="none" '; };
    return '<g class="gx-bh' + (hot ? ' gx-bh-hot' : lv === 1 ? ' gx-bh-warm' : '') + '" transform="translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ')">' +
      '<defs><radialGradient id="g' + b + '"><stop offset="0" stop-color="' + p[1] + '" stop-opacity=".85"/><stop offset=".5" stop-color="' + p[2] + '" stop-opacity=".3"/><stop offset="1" stop-color="' + p[2] + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="d' + b + '" x1="0" x2="1"><stop offset="0" stop-color="' + p[3] + '" stop-opacity="0"/><stop offset=".18" stop-color="' + p[2] + '"/><stop offset=".42" stop-color="' + p[0] + '"/><stop offset=".62" stop-color="' + p[1] + '"/><stop offset=".85" stop-color="' + p[2] + '"/><stop offset="1" stop-color="' + p[3] + '" stop-opacity="0"/></linearGradient>' +
      '<filter id="s' + b + '" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="' + f(0.25 * k) + '"/></filter></defs>' +
      '<circle r="' + f(H * 1.2) + '" fill="url(#g' + b + ')" opacity=".35"/>' +
      '<circle class="gx-bh-shim" r="' + f(R + 1.2 * k) + '" fill="none" stroke="' + p[1] + '" stroke-width="' + f(0.6 * k) + '"/>' +
      '<g transform="rotate(-22)">' + arc(1) + 'stroke="url(#d' + b + ')" stroke-width="' + f(0.6 * k) + '" opacity=".55" filter="url(#s' + b + ')"/></g>' +
      '<circle r="' + f(R) + '" fill="#000"/>' +
      '<circle class="gx-bh-photon" r="' + f(R + 0.25 * k) + '" fill="none" stroke="#fff" stroke-width="' + f(0.35 * k) + '"/>' +
      '<g transform="rotate(-22)">' + arc(0) + 'stroke="url(#d' + b + ')" stroke-width="' + f(0.9 * k) + '" filter="url(#s' + b + ')"/>' +
      arc(0) + 'class="gx-bh-flow" stroke="' + p[0] + '" stroke-width="' + f(0.45 * k) + '" stroke-dasharray="' + f(4 * k) + ' ' + f(0.8 * k) + '" opacity=".8"/></g></g>';
  }

  function ring(o, size, stroke) {
    var c = col(o.used), m = size / 2, r = (size - stroke) / 2 - 4, C = 2 * Math.PI * r, free = 100 - o.used,
      ang = (free / 100 * 360 - 90) * Math.PI / 180, px = m + r * Math.cos(ang), py = m + r * Math.sin(ang),
      pa = (o.pace / 100 * 360 - 90) * Math.PI / 180,
      t1x = m + (r + stroke / 2 + 4) * Math.cos(pa), t1y = m + (r + stroke / 2 + 4) * Math.sin(pa),
      t2x = m + (r - stroke / 2 - 4) * Math.cos(pa), t2y = m + (r - stroke / 2 - 4) * Math.sin(pa),
      id = "gxcl" + (gid++), lv = o.used >= 90 ? 2 : o.used >= 70 ? 1 : 0, hot = lv === 2, dash = (C * free / 100).toFixed(1) + " " + C.toFixed(1);
    return '<svg class="gx-cl-svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + '" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient>' +
      '<filter id="f' + id + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>' +
      (hot ? '<circle class="gx-cl-warn" cx="' + m + '" cy="' + m + '" r="' + (r + stroke * 1.2) + '"/><circle class="gx-cl-warn gx-cl-warn2" cx="' + m + '" cy="' + m + '" r="' + (r + stroke * 1.9) + '"/>'
           : lv === 1 ? '<circle class="gx-cl-warn gx-cl-wa" cx="' + m + '" cy="' + m + '" r="' + (r + stroke * 1.2) + '"/><circle class="gx-cl-orbit gx-cl-orbit-w" cx="' + m + '" cy="' + m + '" r="' + (r + stroke) + '"/>'
           : '<circle class="gx-cl-orbit" cx="' + m + '" cy="' + m + '" r="' + (r + stroke) + '"/>') +
      '<circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + dash + '" transform="rotate(-90 ' + m + " " + m + ')" filter="url(#f' + id + ')" opacity=".75"/>' +
      '<circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + dash + '" transform="rotate(-90 ' + m + " " + m + ')"/>' +
      bhole(px, py, id, lv) +
      '<line class="gx-cl-pace" x1="' + t1x.toFixed(1) + '" y1="' + t1y.toFixed(1) + '" x2="' + t2x.toFixed(1) + '" y2="' + t2y.toFixed(1) + '"/></svg>';
  }

  function half(key, label, o, now) {
    if (!o) return '<div class="gx-cl-half gx-cl-empty"><span class="gx-cl-lbl">' + label + "</span><span>keine Daten</span></div>";
    var c = col(o.used), over = o.used > o.pace;
    if (o.idle) return '<div class="gx-cl-half gx-cl-ok gx-cl-idle" style="--c1:' + c[0] + ";--c2:" + c[1] + '">' +
      '<div class="gx-cl-ring">' + ring(o, 72, 6) + '<div class="gx-cl-free"><b>100<em>%</em></b></div></div>' +
      '<div class="gx-cl-info"><div class="gx-cl-row"><span class="gx-cl-lbl">' + label + '</span><span class="gx-cl-chip ok">bereit</span>' +
      (o.since ? '<span class="gx-cl-reset gx-cl-since" title="zurückgesetzt ' + o.since.toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + '">frei seit <b>' + hm(o.since) + "</b></span>" : "") + "</div>" +
      '<div class="gx-cl-bar"><i style="width:0%"></i></div>' +
      '<div class="gx-cl-row gx-cl-foot"><span>0 % genutzt</span><span class="gx-cl-under">startet mit nächster Nachricht</span></div></div></div>';
    return '<div class="gx-cl-half gx-cl-' + c[2] + '" style="--c1:' + c[0] + ";--c2:" + c[1] + '">' +
      '<div class="gx-cl-ring">' + ring(o, 72, 6) + '<div class="gx-cl-free"><b>' + (100 - o.used) + "<em>%</em></b></div></div>" +
      '<div class="gx-cl-info"><div class="gx-cl-row"><span class="gx-cl-lbl">' + label + '</span><span class="gx-cl-chip ' + c[2] + '">' + c[3] + "</span>" +
      '<span class="gx-cl-reset" title="Reset ' + o.reset.toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + '">Reset in <b data-cd="' + key + '">' + cd(o.reset, now) + "</b></span></div>" +
      '<div class="gx-cl-bar"><i style="width:' + o.used + '%"></i><u style="left:' + o.pace.toFixed(1) + '%" title="verstrichene Zeit ' + Math.round(o.pace) + ' %"></u></div>' +
      '<div class="gx-cl-row gx-cl-foot"><span>' + o.used + " % genutzt</span>" +
      (over ? '<span class="gx-cl-over">über Zeitplan ⚠</span>' : '<span class="gx-cl-under">unter Zeitplan ✓</span>') + "</div></div></div>";
  }

  var W = {};
  function render() {
    if (!ROOT || !ROOT.isConnected) return;
    var now = new Date();
    if (!DATA) {
      ROOT.className = "gx-cl";
      ROOT.innerHTML = '<div class="gx-cl-brand">' + LOGO + '<span class="gx-cl-title">KI-Kontingent</span></div><div class="gx-cl-sep"></div><div class="gx-cl-msg">' +
        (ERR ? "Kontingent-Dienst nicht erreichbar" : "lädt …") + "</div>";
      return;
    }
    W.s = win(DATA.session, 5 * 3600e3, now);
    W.w = win(DATA.week, 7 * 864e5, now);
    var crit = (W.s && W.s.used >= 90) || (W.w && W.w.used >= 90);
    var warn = !crit && ((W.s && W.s.used >= 70) || (W.w && W.w.used >= 70));
    var stale = DATA.stale || ERR;
    var upd = DATA.fetched_at ? "Stand " + hm(new Date(DATA.fetched_at)) : "";
    var tip = "Letzter Stand – aktualisiert sich, sobald der Dienst wieder antwortet";
    var fresh = stale ? '<span class="gx-cl-state gx-cl-stale" title="' + tip + '"><i></i>' + (upd || "Stand ?") + "</span>"
      : '<span class="gx-cl-state"><i></i>live</span>';
    var status = (crit ? '<span class="gx-cl-chip h gx-cl-alert">⚠ Limit</span>'
      : warn ? '<span class="gx-cl-chip w gx-cl-alert">⚠ knapp</span>' : "") + ((crit || warn) && !stale ? "" : fresh);
    ROOT.className = "gx-cl" + (crit ? " crit" : warn ? " warn" : "") + (stale ? " stale" : "");
    ROOT.title = "KI-Kontingent · " + (stale ? tip + " (" + upd + ")" : upd);
    ROOT.innerHTML = '<div class="gx-cl-brand">' + LOGO + '<span class="gx-cl-title">KI-Kontingent</span>' + status + "</div>" +
      '<div class="gx-cl-sep"></div>' + half("s", "Sitzung · 5 h", W.s, now) + '<div class="gx-cl-sep"></div>' + half("w", "Woche · 7 Tage", W.w, now);
  }
  function tick() {
    if (!ROOT || !ROOT.isConnected || !DATA) return;
    var now = new Date(), need = false;
    ["s", "w"].forEach(function (k) {
      var o = W[k], el = ROOT.querySelector('[data-cd="' + k + '"]');
      if (!o || o.idle || !el) return;
      if (now >= o.reset) need = true; else el.textContent = cd(o.reset, now);
    });
    if (need) { render(); load(); }
  }

  function load() {
    fetch(API, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (d && (d.session || d.week)) {
          var dm = /cldemo=(warn|crit)/.exec(location.hash);
          if (dm) {
            var dv = dm[1] === "crit" ? [94, 91] : [78, 72], fut = function (h) { return new Date(Date.now() + h * 36e5).toISOString(); };
            d = JSON.parse(JSON.stringify(d));
            d.session = Object.assign({ resets_at: fut(3) }, d.session, { used: dv[0] });
            d.week = Object.assign({ resets_at: fut(30) }, d.week, { used: dv[1] });
            DATA = d; ERR = null; render(); return;
          }
          DATA = d; ERR = null;
          try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch (e) {}
        } else { ERR = (d && d.error) || "keine Daten"; }
        render();
      })
      .catch(function (e) { ERR = String(e && e.message || e); render(); });
  }
  window.addEventListener("hashchange", function () { load(); });

  function mount() {
    var wrap = document.getElementById("widgets-wrap");
    if (!wrap) return;
    if (!ROOT) { ROOT = document.createElement("section"); ROOT.id = "gx-cl"; ROOT.setAttribute("aria-label", "KI-Kontingent"); }
    if (ROOT.parentNode !== wrap) { wrap.appendChild(ROOT); render(); }
  }

  /* Cache sofort zeigen, aber erst als veraltet markieren, wenn nach 5 s noch keine frischen Daten da sind
     (sonst springt das Panel ~40 ms nach dem Laden von "Stand HH:MM" auf "live") */
  try { DATA = JSON.parse(localStorage.getItem(CACHE) || "null"); if (DATA) DATA.__cache = true; } catch (e) {}
  function boot() {
    mount();
    new MutationObserver(function () { if (!ROOT || !ROOT.isConnected) mount(); })
      .observe(document.body, { childList: true, subtree: true });
    load();
    setTimeout(function () { if (DATA && DATA.__cache && !DATA.stale) { DATA.stale = true; render(); } }, 5000);
    setInterval(load, FETCH_MS);
    setInterval(tick, 1000);
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();

/* ==============================================================
   Zwei-Decks A (Variante A · Wetter-Zwilling): Heimnetz | Web
   Hängt Glasflächen (.gx-dk-bg) und Kerben (.gx-dk-head mit
   .gx-dk-notch > .gx-dk-tab + Badge .gx-dk-b wie #gx-tabs, Meta
   rechts oben) an #layout-groups an. Platzierung per custom.css-Block
   "DECKS-WETTERSTIL". Zählt siteMonitor-Punkte (bg-emerald-500 =
   online) und Links; schreibt die Anzahl je Gruppe als data-n an die
   Überschrift (Zähler neben dem Gruppennamen).
   ============================================================== */
(function () {
  if (window.__gxDecksA) return;
  window.__gxDecksA = true;
  var SVG_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>';
  var SVG_WEB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>';
  var els = null, last = "";

  function el(cls, html) { var d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; return d; }
  function head(cls, svg, title) {
    return el("gx-dk-head " + cls,
      '<nav class="gx-dk-notch"><span class="gx-dk-tab">' + svg + "<b>" + title + '</b><span class="gx-dk-b"></span></span></nav>');
  }

  function update() {
    var lg = document.getElementById("layout-groups");
    if (!lg) return;
    if (!els) els = {
      bgH: el("gx-dk-bg home"), bgW: el("gx-dk-bg web"),
      hH: head("home", SVG_HOME, "Heimnetz"),
      hW: head("web", SVG_WEB, "Web")
    };
    [els.bgH, els.hH, els.bgW, els.hW].forEach(function (n) { if (n.parentNode !== lg) lg.appendChild(n); });

    /* Zähler je Gruppe (eingeklappte Gruppen behalten den letzten Wert) */
    Array.prototype.forEach.call(lg.children, function (g) {
      if (!g.classList.contains("services-group") && !g.classList.contains("bookmark-group")) return;
      var h = g.querySelector("h2"), n = g.querySelectorAll("li.service, li.bookmark").length;
      if (h && n && h.getAttribute("data-n") !== String(n)) h.setAttribute("data-n", String(n));
    });

    /* Status-Ruhig: Platzhalter-Punkt (.opacity-20 = noch keine Antwort) zählt in
       der Schonfrist (bis body.gx-sm-ready, 4 s nach dem Laden) weder als online
       noch als offline -> Badge neutral-gedimmt ("··/13"). Danach = offline. */
    var grace = !document.body.classList.contains("gx-sm-ready");
    var svc = lg.querySelectorAll(".services-group li.service"), on = 0, off = [], pend = 0;
    svc.forEach(function (li) {
      var dot = li.querySelector(".site-monitor-status .rounded-full");
      if (!dot) return;
      if (dot.classList.contains("bg-emerald-500")) on++;
      else if (grace && dot.classList.contains("opacity-20")) pend++;
      else off.push(li.getAttribute("data-name") || "?");
    });
    var links = lg.querySelectorAll(".bookmark-group li.bookmark").length;
    var key = [on, off.join("|"), pend, svc.length, links].join("/");
    if (key === last) return;
    last = key;
    var bH = els.hH.querySelector(".gx-dk-b");
    bH.textContent = svc.length ? (pend ? "··" : on) + "/" + svc.length : "";
    bH.className = "gx-dk-b" + (pend ? " p" : off.length ? " w" : "");
    bH.title = pend ? "Status wird geprüft …" : off.length ? off.length + " offline: " + off.join(", ") : "alle Dienste online";
    var bW = els.hW.querySelector(".gx-dk-b");
    bW.textContent = links ? String(links) : "";
    bW.className = "gx-dk-b v";
    bW.title = links + (links === 1 ? " Link" : " Links");
  }

  var queued = false;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; try { update(); } catch (e) {} }); }
  function boot() {
    update();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    setInterval(schedule, 5000);
    /* Schonfrist für siteMonitor: 4 s ab Navigationsstart; die body-Klasse weckt
       beide Observer (Decks + Host-Kerbe) und schaltet die CSS-Offline-Regeln scharf. */
    setTimeout(function () { document.body.classList.add("gx-sm-ready"); }, Math.max(0, 4000 - performance.now()));
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();

/* ==============================================================
   Tanken-Panel (Variante A · Wetter-Zwilling) + Reiter-Kerbe (P2)
   Konzept "Jetzt tanken oder warten?" (Prognose, Empfehlung Variante A · Countdown-Ring):
   - Jetzt-Spalte: Preis (Ziffern-Rolle), Empfehlungs-Box mit Ring (Warte bis ~hh:mm /
     Jetzt tanken – vor hh:mm / Jetzt tanken – passt), Kacheln erwartetes Tief 12 h ·
     nächster Sprung · üblich um hh Uhr · Trend der Tagestiefs.
   - Mitte: Verlauf 12 h + Prognose 18 h (gestrichelt, Spanne 7 Tage, Zone "gut genug").
   - Rechts: Tagestiefs der letzten 7 Tage + Streifen "nächste 24 h" mit günstigstem Fenster.
   - Prognose im Browser aus /history?days=14: gewichtete Vortage (7 Tage, jüngere zählen mehr,
     Halbwertszeit 1,5 Tage), je ans heutige Niveau angepasst (Abweichung klingt mit 2 h ab). Zustände gegen das erwartete Tief der nächsten 12 h:
     warn > 2 ct, crit > 6 ct. Unter ~36 h Verlauf: "Prognose sammelt Daten".
   - Demo (aufgezeichnete Daten, Zeitreise): #tkdemo=warn|crit|jump|ok
   - Reiter "Wetter | Tanken" als Kerbe auf dem Kopf-Panel, Start immer auf "Wetter".
   - Daten: sprit-tracker über das Gateway /sprit (Tankerkönig/MTS-K, CC BY 4.0).
   Styles: Blöcke "TANKEN-PANEL" … "TANKEN-PROGNOSE" in custom.css.
   ============================================================== */
(function () {
  if (window.__gxTk) return;
  window.__gxTk = true;

  function cfg(p, d) { var o = window.GX_CFG, k = p.split("."); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== "object") return d; o = o[k[i]]; } return o == null ? d : o; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var CSTN = String(cfg("tanken.station", "Tankstelle"));

  var POLL_MS = 5 * 60 * 1000, LT = 0; /* POLL_MS = poll_seconds aus /sprit/health */
  var API = location.origin + "/sprit"; /* sprit-tracker im Stack, über das Gateway (kein eigener Port) */
  var DAY = 864e5, HR = 36e5, M5 = 3e5;
  var TAB = "wx", D = null, M = null, ERR = null, TABS = null, ROOT = null, WXH = 0, anim = true, MIN = -1;
  var WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var FUEL = '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M6 8h7"/><path d="M15 11h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3"/>';
  var SUN = '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M2.5 8H1M3.6 3.6l1 1M12.4 3.6l-1 1"/><path d="M7 20h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.3 3.3 0 0 0 7 20z"/>';

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hm(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function hq(t) { return hm(Math.round(t / 9e5) * 9e5); }               /* auf 15 min gerundet */
  function f3(p) { return p == null ? "–" : p.toFixed(3).replace(".", ","); }
  function c1(x) { return Math.abs(x * 100).toFixed(1).replace(".", ","); }
  function eur(x) { return x.toFixed(2).replace(".", ","); }
  function dur(ms) { var m = Math.max(0, Math.round(ms / 6e4)), h = Math.floor(m / 60); return h ? h + " h " + pad(m % 60) : m + " min"; }
  function qz(c) { return Math.round((c - 0.009) * 100) / 100 + 0.009; }  /* Preise stehen immer auf x,xx9 */
  function num(a, b) { return a - b; }
  function med(a) { a = a.slice().sort(num); return a[Math.floor(a.length / 2)]; }
  function svg(p, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 17) + '" height="' + (w || 17) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }

  /* Kacheln im Wetter-Stil (A1): erwartetes Tief · nächster Sprung · üblich um · Trend */
  var TKI = {
    ex: '<g class="gx-tk-a-dn"><path d="M12 5v12"/><path d="M7 12.5l5 5 5-5"/></g><path d="M5 20.5h14" stroke-dasharray="2 3" opacity=".6"/>',
    jp: '<g class="gx-tk-a-up"><path d="M12 19V7"/><path d="M7 11.5l5-5 5 5"/></g><path d="M5 3.5h14" opacity=".45"/>',
    ty: '<circle cx="12" cy="12" r="8" opacity=".55"/><path d="M12 7.5V12l3 2"/>',
    tr: '<path d="M3.5 17l5.5-5.5 4 4 7.5-7.5" opacity=".9"/><path class="gx-tk-a-dash" d="M15 8h5.5v5.5"/>'
  };
  function tkTile(k, ic, i, val, unit, label, tt) {
    return '<div class="gx-tk-tw ' + k + '" style="--d:' + i + '"' + (tt ? ' title="' + tt + '"' : "") + '><span class="gx-wx-ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      TKI[ic] + '</svg></span><span class="gx-wx-tv"><b>' + val + "<small>" + unit + "</small></b><em>" + label + "</em></span></div>";
  }
  /* Tankpreis Variante B · Ziffern-Rolle (Uhr-Stil) */
  var TKLAST = null, TKROLL0 = false;  /* rollt nur bei Preisänderung */
  function roll(p) {
    var s = f3(p), from = TKROLL0 ? s.replace(/\d/g, "0") : (TKLAST && TKLAST.length === s.length ? TKLAST : s);
    TKROLL0 = false; TKLAST = s;
    return s.split("").map(function (c, i) {
      if (!/\d/.test(c)) return '<span class="gx-tk-ch com">' + c + "</span>";
      var st = ""; for (var k = 0; k < 10; k++) st += "<i>" + k + "</i>";
      return '<span class="gx-tk-ch' + (i === s.length - 1 ? " sup" : "") + '"><span class="gx-tk-st" data-d="' + c +
        '" style="transform:translateY(-' + from.charAt(i) + 'em)">' + st + "</span></span>";
    }).join("");
  }
  function rollGo() {
    var n = ROOT && ROOT.querySelector(".gx-tk-price"); if (!n) return;
    var r = n.getBoundingClientRect(); n.style.setProperty("--bw", Math.max(r.width, 40) * 3 + "px");
    n.querySelectorAll(".gx-tk-ch").forEach(function (c) { c.style.setProperty("--ox", (c.getBoundingClientRect().left - r.left) + "px"); });
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      n.querySelectorAll(".gx-tk-st").forEach(function (e) { e.style.transform = "translateY(-" + e.getAttribute("data-d") + "em)"; });
    }); });
  }

  /* ---------- Daten ---------- */
  function prep(cur, hist) {
    var ET = [], EP = [], last = 0;
    (hist.points || []).forEach(function (q) {
      if (typeof q.e5 !== "number") return;
      var t = Date.parse(q.t);
      if (!EP.length || EP[EP.length - 1] !== q.e5) { ET.push(t); EP.push(q.e5); }
      last = t;
    });
    var now = Date.now(), fa = cur.fetched_at ? Date.parse(cur.fetched_at) : (last || now);
    var price = typeof cur.e5 === "number" ? cur.e5 : (EP.length ? EP[EP.length - 1] : null);
    if (price != null && (!EP.length || EP[EP.length - 1] !== price) && fa >= (ET[ET.length - 1] || 0)) { ET.push(fa); EP.push(price); }
    var dm = /tkdemo=(warn|crit|jump|ok)/.exec(location.hash);
    return { ET: ET, EP: EP, first: ET.length ? ET[0] : fa, stand: fa, cur: price, open: cur.open !== false,
      stale: !!cur.stale || now - fa > Math.max(20 * 6e4, 2.5 * POLL_MS), err: cur.error || null, demo: dm ? dm[1] : null, demoT: null, synth: cur.demo === true };
  }
  function P(t) {
    var ET = D.ET; if (!ET.length || t < ET[0]) return null;
    var lo = 0, hi = ET.length - 1;
    while (lo < hi) { var m = (lo + hi + 1) >> 1; if (ET[m] <= t) lo = m; else hi = m - 1; }
    return D.EP[lo];
  }
  function nowT() { return D.demoT || Date.now(); }
  /* Quellenzeile: synthetische Sidecar-Daten (/sprit/current → demo:true) sind keine Tankerkönig-Daten */
  function srcH() {
    return '<div class="gx-tk-src">' + (D.synth ? "Demo-Daten (synthetisch) · Prognose = gewichtete Vortage" : '<a href="https://creativecommons.tankerkoenig.de/" target="_blank" rel="noopener noreferrer">Tankerkönig</a> · MTS-K · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · Prognose = gewichtete Vortage') + '</div>';
  }

  /* Preiserhöhungen nur 12:00–12:14 (Sprung kommt 12:02–12:07); sonst darf die Prognose nur fallen/halten */
  function up12(t) { var d = new Date(t); return d.getHours() === 12 && d.getMinutes() < 15; }
  /* ---------- Prognose: "gewichtete Vortage" ----------
     Je Vortag k = 1..7: Preis vor k Tagen zur gleichen Uhrzeit + (jetzt − Preis vor k Tagen jetzt),
     die Abweichung klingt mit 2 h ab. Mitte = gewichtetes Mittel, Gewicht 0,5^((k−1)/1,5)
     (gestern 1, vorgestern 0,63, …), auf x,xx9 gerundet.
     Spanne = dieselben Vortags-Werte ohne den jeweils extremsten Tag.
     Stufe  = jetzt gegen das erwartete Tief der nächsten 12 h: > 2 ct warn, > 6 ct crit.
     Teurer wird es nur um 12 Uhr (up12): sonst bleiben Mitte und Spanne höchstens auf dem vorigen Wert. */
  /* Sprunghöhe: je Vortag k = 1..7 höchster Preis 12:00–12:30 minus Preis um 11:55, gewichtet wie die Prognose */
  function jumpAmt(nn) {
    var sw = 0, sg = 0;
    for (var k = 1; k <= 7; k++) {
      var b = P(nn - k * DAY - M5), a = null; if (b == null) continue;
      for (var u = 0; u <= 30; u++) { var v = P(nn - k * DAY + u * 6e4); if (v != null && (a == null || v > a)) a = v; }
      var g = Math.pow(0.5, (k - 1) / 1.5); sw += g * (a - b); sg += g;
    }
    return sg ? Math.round(sw / sg * 100) / 100 : null;
  }
  function model(T0) {
    var cur = P(T0), y0 = P(T0 - DAY), o = y0 == null ? 0 : cur - y0, F = [], pc = cur, pl = cur, ph = cur;
    for (var t = T0 + M5; t <= T0 + 24 * HR; t += M5) {
      var w = Math.exp(-(t - T0) / 72e5), y = P(t - DAY);
      if (y == null) break;
      var vs = [], sw = 0, sg = 0;
      for (var k = 1; k <= 7; k++) {
        var a7 = P(t - k * DAY), b7 = P(T0 - k * DAY); if (a7 == null || b7 == null) continue;
        var g = Math.pow(0.5, (k - 1) / 1.5), v7 = a7 + (cur - b7) * w;
        sw += g * v7; sg += g; vs.push(qz(v7));
      }
      var c = sg ? qz(sw / sg) : qz(y + o * w);
      if (!vs.length) vs.push(c);
      vs.sort(num); var cut = vs.length >= 5 ? 1 : 0;
      var lo = Math.min(c, vs[cut]), hi = Math.max(c, vs[vs.length - 1 - cut]);
      if (!up12(t)) { c = Math.min(c, pc); lo = Math.min(lo, pl, c); hi = Math.min(hi, ph); }  /* teurer nur um 12 Uhr */
      hi = Math.max(hi, c); pc = c; pl = lo; ph = hi;
      F.push({ t: t, c: c, lo: lo, hi: hi });
    }
    var f12 = F.filter(function (f) { return f.t <= T0 + 12 * HR; }), ok = f12.length >= 140;
    var fmin = Math.min.apply(0, f12.map(function (f) { return f.c; }).concat([cur]));
    var good = cur <= fmin + 0.01 ? T0 : null;
    if (good == null) for (var i = 0; i < f12.length; i++) if (f12[i].c <= fmin + 0.01) { good = f12[i].t; break; }
    var jump = null, pv = cur;
    for (var j = 0; j < F.length; j++) { if (F[j].c - pv >= 0.05) {
      var pk = F[j].c; for (var j2 = j + 1; j2 < Math.min(F.length, j + 7); j2++) pk = Math.max(pk, F[j2].c);  /* Stufen der gemittelten Vortage zusammenfassen */
      jump = { t: F[j].t, dp: pk - pv };
      /* 12-Uhr-Regel: erhöht wird um 12:00, der Tracker sieht es erst bis zu 5 min später -> Sprung auf 12:00 legen */
      var nn = new Date(F[j].t); nn.setHours(12, 0, 0, 0); nn = nn.getTime();
      if (up12(F[j].t) && nn > T0) {  /* ein Sprung um 12:00, Höhe = gewichtete Sprünge der Vortage (minutenstabil) */
        var p0 = cur; for (var j4 = 0; j4 < F.length && F[j4].t < nn; j4++) p0 = F[j4].c;  /* Preis vor 12:00 */
        var dS = jumpAmt(nn), top = dS != null && dS >= 0.05 ? qz(p0 + dS) : Math.max(pk, p0), pe = F[Math.min(F.length, j + 7) - 1].t, pr = null;
        jump.t = nn; jump.dp = top - p0;
        for (var j3 = 0; j3 < F.length; j3++) {
          if (F[j3].t < nn) continue;
          if (F[j3].t <= pe) F[j3].c = top; else if (F[j3].c > pr) F[j3].c = pr;  /* danach nur noch fallen */
          F[j3].hi = Math.max(F[j3].hi, F[j3].c); F[j3].lo = Math.min(F[j3].lo, F[j3].c); pr = F[j3].c;
        }
      }
      break; } pv = F[j].c; }
    var typ = []; for (var k2 = 1; k2 <= 3; k2++) { var v2 = P(T0 - k2 * DAY); if (v2 != null) typ.push(v2); }
    var d = cur - fmin, lv = !ok ? 0 : d > 0.06 ? 2 : d > 0.02 ? 1 : 0;
    /* Tagestiefs (Kalendertage) + Trend über die abgeschlossenen Tage */
    var days = [], d0 = new Date(T0); d0.setHours(0, 0, 0, 0);
    for (var n = 0; n < 7; n++) {
      var a = new Date(d0); a.setDate(a.getDate() - n);
      var s = a.getTime(), e = Math.min(s + DAY, T0), mn = null, mt = null;
      if (e > D.first && Math.max(s, D.first) <= s + 6 * HR) {
        mt = Math.max(s, D.first); mn = P(mt);
        for (var q = 0; q < D.ET.length; q++) if (D.ET[q] > s && D.ET[q] < e && D.EP[q] < mn) { mn = D.EP[q]; mt = D.ET[q]; }
      }
      days.push({ t: s, mn: mn, mt: mt, part: n === 0 });
    }
    var tp = days.slice(1).filter(function (x) { return x.mn != null; }).reverse(), slope = null;
    if (tp.length >= 3) {
      var sx = 0, sy = 0, sxy = 0, sxx = 0; tp.forEach(function (x, i) { sx += i; sy += x.mn; sxy += i * x.mn; sxx += i * i; });
      var nn = tp.length; slope = (nn * sxy - sx * sy) / (nn * sxx - sx * sx);
    }
    return { T: T0, cur: cur, F: F, ok: ok, fmin: fmin, good: good, jump: jump, typ: typ.length ? med(typ) : null, d: d, lv: lv, days: days, slope: slope };
  }
  /* Demo #tkdemo=warn|crit|jump|ok: jüngster aufgezeichneter Zeitpunkt mit diesem Zustand (Zeitreise über die Verlaufsdaten) */
  function demoT(kind) {
    for (var t = Math.floor(D.stand / 9e5) * 9e5; t > D.first + 2 * DAY; t -= 9e5) {
      var m = model(t), nj = m.jump && m.jump.t - t < 3 * HR;
      if (kind === "crit" ? m.lv === 2 : kind === "warn" ? m.lv === 1 : kind === "jump" ? m.lv === 0 && nj && m.jump.t - t >= 30 * 6e4 : m.ok && m.lv === 0 && !nj) return t;
    }
    return null;
  }
  function compute() { M = D && D.cur != null ? model(nowT()) : null; MIN = Math.floor(Date.now() / 6e4); }
  function level() { return M && M.ok ? M.lv : 0; }

  function load() {
    Promise.all([
      fetch(API + "/current", { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch(API + "/history?days=14", { cache: "no-store" }).then(function (r) { return r.json(); }),
      fetch(API + "/health", { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; })
    ]).then(function (x) {
      if (x[2] && x[2].poll_seconds > 0) POLL_MS = x[2].poll_seconds * 1000;
      D = prep(x[0], x[1]); ERR = null;
      if (D.demo) D.demoT = demoT(D.demo);
      compute(); paint(); sched(D.demo ? 0 : D.stand);
    }).catch(function (e) { ERR = String(e && e.message || e); paint(); sched(-1); });
  }
  /* nächster Abruf ~30 s nach der nächsten Tracker-Abfrage (fetched_at + poll), mind. 1 min, max. 1 Takt */
  function sched(fa) {
    clearTimeout(LT);
    var w = fa < 0 ? 2 * 6e4 : fa ? fa + POLL_MS + 3e4 - Date.now() : POLL_MS;
    LT = setTimeout(load, Math.min(Math.max(w, 6e4), POLL_MS + 6e4));
  }

  /* ---------- Abfrage-Countdown (Lade-Kapsel, ruhig) – solange die Prognose noch Verlauf sammelt ---------- */
  function cdChip() {
    return '<span class="gx-tk-chip nd cv-a"><b class="gx-tk-fill"></b><span class="gx-tk-cl">nächste Abfrage in</span><em class="gx-tk-cd">–</em></span>';
  }
  function cdTick() {
    var c = ROOT && D && ROOT.querySelector(".gx-tk-chip.nd"); if (!c) return;
    var rem = D.stand + POLL_MS - Date.now(), p = Math.max(0, Math.min(1, 1 - rem / POLL_MS));
    var due = rem <= 0, late = rem < -3 * 6e4 || D.stale, s = Math.max(0, Math.ceil(rem / 1000));
    c.classList.toggle("due", due && !late); c.classList.toggle("late", late);
    c.querySelector(".gx-tk-cl").textContent = late ? "Abfrage überfällig" : due ? "Abfrage läuft" : "nächste Abfrage in";
    c.querySelector(".gx-tk-cd").textContent = late ? "" : due ? "…" : Math.floor(s / 60) + ":" + pad(s % 60);
    var f = c.querySelector(".gx-tk-fill"); if (f) f.style.width = (due ? 100 : p * 100).toFixed(2) + "%";
  }

  /* ---------- Empfehlungs-Box · Variante A "Countdown-Ring" ----------
     Klartext mit Uhrzeit, der Ring leert sich bis "gut ab" bzw. bis zur Frist vor dem Sprung,
     Chips Restzeit · Ersparnis (pro 50 l). */
  function verdict(m) {
    var C = 2 * Math.PI * 16, t, tm, fr, ch, w, tt = "Prognose = gewichtete Vortage (7 Tage, jüngere zählen mehr), ans heutige Niveau angepasst";
    function sh(ms) { var mn = Math.max(1, Math.round(ms / 6e4)); return mn < 60 ? mn + "′" : Math.round(mn / 60) + "h"; }
    if (!m.ok) {
      fr = 0; tm = "···"; t = "Prognose sammelt Daten"; tt = "Die Prognose braucht ~36 h Verlauf";
      ch = cdChip();
    } else if (m.lv >= 1) {
      w = m.good - m.T; fr = Math.max(0.08, 1 - w / (6 * HR)); tm = sh(w);
      t = "Warte bis ~" + hq(m.good);
      ch = '<span class="gx-tkp-c n">noch ' + dur(w) + '</span><span class="gx-tkp-c g">spart ' + c1(m.d) + " ct · " + eur(m.d * 50) + " €</span>";
    } else if (m.jump && m.jump.t - m.T < 3 * HR) {
      var dl = Math.floor(m.jump.t / 9e5) * 9e5;  /* Frist auf 15 min abrunden (Sprung liegt auf 12:00) */
      if (dl <= m.T + 6e4) dl = Math.max(m.T + 6e4, Math.floor(m.jump.t / 6e4) * 6e4);
      w = dl - m.T; fr = Math.max(0.08, w / (3 * HR)); tm = sh(w);
      t = "Jetzt tanken – vor " + hm(dl);
      ch = '<span class="gx-tkp-c r">+' + c1(m.jump.dp) + " ct in " + dur(w) + '</span><span class="gx-tkp-c g">' + eur(m.jump.dp * 50) + " € gespart</span>";
    } else {
      fr = 1; tm = "✓"; t = "Jetzt tanken – passt";
      ch = '<span class="gx-tkp-c g">Tiefpreis-Niveau</span><span class="gx-tkp-c n">' + (m.d >= 0.005 ? "max. −" + c1(m.d) + " ct in 12 h" : "Warten bringt nichts") + "</span>";
    }
    return '<div class="gx-tkp-vd l' + m.lv + (m.ok ? "" : " nd") + '" title="' + tt + '"><span class="rg"><svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="16" class="bg"/>' +
      '<circle cx="19" cy="19" r="16" class="fg" stroke-dasharray="' + (C * fr).toFixed(1) + " " + C.toFixed(1) + '"/></svg><span class="tm">' + tm + "</span></span>" +
      '<span class="tx"><b>' + t + '</b><span class="cs">' + ch + "</span></span></div>";
  }
  /* Sprung-Kachel · Variante A3 "Zündschnur": Betrag groß, Uhrzeit + Sekunden-Countdown, Leiste brennt über 12 h bis zum Sprung ab.
     HTML hängt nur an Zeit + Betrag (setPart ersetzt sie nicht jede Minute); Countdown, Leiste und Stufe setzt jpTick() jede Sekunde. */
  function jpTile(m) {
    return '<div class="gx-tk-tw hi gx-tk-jp" style="--d:1" data-t="' + m.jump.t + '" title="Preissprung um ' + hm(m.jump.t) + " Uhr: ~+" + c1(m.jump.dp) + " ct → ~" + f3(m.cur + m.jump.dp) + ' €">' +
      '<span class="gx-wx-ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TKI.jp + "</svg></span>" +
      '<span class="gx-wx-tv"><b>+' + Math.round(m.jump.dp * 100) + "<small>ct</small></b>" +
      '<em class="gx-tk-jr"><span>' + hm(m.jump.t) + '</span><span class="gx-tk-jc">–</span></em></span><span class="gx-tk-fz"><i></i></span></div>';
  }
  /* Restzeit bis zum Sprung als „in h:mm:ss“; ist sie um (Sprung erreicht, Kachel noch nicht neu gezeichnet) → „jetzt“.
     Bewusst ohne Minuszeichen: „−15:28:53“ liest sich wie ein negativer Wert. */
  function jpFmt(s) { return s > 0 ? "in " + Math.floor(s / 3600) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60) : "jetzt"; }
  function jpTick() {
    var el = ROOT && TAB === "fuel" && ROOT.querySelector(".gx-tk-jp"); if (!el) return;
    var ms = +el.getAttribute("data-t") - (D && D.demoT ? M.T : Date.now()), s = Math.max(0, Math.floor(ms / 1000));
    var c = el.querySelector(".gx-tk-jc"), tx = jpFmt(s);
    if (c.textContent !== tx) c.textContent = tx;
    el.querySelector(".gx-tk-fz i").style.width = (Math.max(0.015, Math.min(1, ms / (12 * HR))) * 100).toFixed(2) + "%";
    el.classList.toggle("gx-tk-j1", ms < 3 * HR && ms >= 30 * 6e4); el.classList.toggle("gx-tk-j2", ms < 30 * 6e4);
  }
  function tilesH(m) {
    var hhT = new Date(m.T).getHours(), odd = m.ok && m.typ != null && Math.abs(m.cur - m.typ) >= 0.03;
    var tr = m.slope == null ? "–" : (m.slope >= 0 ? "+" : "−") + c1(m.slope);
    var arr = m.slope == null ? "" : m.slope > 0.0015 ? "↗" : m.slope < -0.0015 ? "↘" : "→";
    return '<div class="gx-tk-tiles">' +
      tkTile("lo", "ex", 0, m.ok ? "~" + f3(m.fmin) : "–", m.ok ? "€" : "", "Tief · nächste 12 h", "Prognose: günstigster Preis in den nächsten 12 Stunden") +
      (m.jump ? jpTile(m) : tkTile("hi", "jp", 1, "–", "", "kein Sprung", "")) +
      tkTile("av" + (odd ? " gx-tkp-odd" : ""), "ty", 2, f3(m.typ), m.typ != null ? "€" : "", "üblich um " + pad(hhT) + " Uhr",
        "Median der letzten 3 Tage zur gleichen Uhrzeit" + (odd ? " – jetzt " + (m.cur > m.typ ? "+" : "−") + c1(m.cur - m.typ) + " ct ungewöhnlich" : "")) +
      tkTile("sp", "tr", 3, tr, m.slope == null ? "" : "ct/Tag", "Trend " + arr + " Tagestief", "Tagestiefs der letzten Tage, lineare Steigung") +
      "</div>";
  }
  function dayList(m) {
    var v = m.days.filter(function (x) { return x.mn != null; }).map(function (x) { return x.mn; });
    var mn = Math.min.apply(0, v), mx = Math.max.apply(0, v);
    return '<ul class="gx-tk-days">' + m.days.map(function (x, i) {
      var dd = new Date(x.t), nm = i === 0 ? "Heute" : i === 1 ? "Gestern" : WD[dd.getDay()];
      var n = '<span class="n">' + nm + "<small>" + dd.getDate() + ".</small></span>";
      if (x.mn == null) return '<li class="na" style="--d:' + i + '">' + n + '<span class="nd">noch keine Daten</span><b>–</b></li>';
      var w = mx > mn ? 14 + 86 * (x.mn - mn) / (mx - mn) : 50;
      return "<li" + (x.mn === mn && v.length >= 3 ? ' class="best"' : "") + ' style="--d:' + i + '" title="Tagestief ' + f3(x.mn) + " € um " + hm(x.mt) + (x.part ? " (bisher)" : "") + '">' + n +
        '<span class="tr"><i style="width:' + w.toFixed(1) + "%;background-size:" + (30000 / w).toFixed(1) + "% 100%;--p:" + (300 / (3 - w / 100)).toFixed(1) + '%"></i></span><b>' + f3(x.mn) + "</b></li>";
    }).join("") + "</ul>";
  }
  /* Karte "nächste 24 h" (Tages-Streifen ab jetzt): Stunden-Ø aus Verlauf + Prognose, günstigstes Fenster gerahmt */
  function bsCol(d) {
    var t = Math.max(0, Math.min(1, d / 8)), S = [[94, 231, 255], [122, 162, 255], [197, 139, 255], [255, 155, 230], [255, 184, 107]];
    var x = t * (S.length - 1), i = Math.min(S.length - 2, Math.floor(x)), f = x - i, a = S[i], b = S[i + 1];
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(",") + ")";
  }
  function next24(m) {
    var s = "", ax = "", k;
    if (!m.ok) {
      for (k = 0; k < 24; k++) s += '<s class="nd" style="--i:' + k + '"></s>';
      return '<div class="gx-tk-best gx-tk-bs na"><div class="hd"><b class="na">–</b><span class="av">Zeitfenster ab ~36 h Verlauf</span><span class="gx-tk-bsc">sammelt Daten</span></div><div class="sb">' + s + '</div><div class="ax"></div></div>';
    }
    var h0 = new Date(m.T); h0.setMinutes(0, 0, 0); h0 = h0.getTime();
    var cells = [];
    for (k = 0; k < 24; k++) {
      var a = h0 + k * HR, sum = 0, n = 0;
      for (var t = a; t < a + HR; t += M5) {
        var v = null;
        if (t <= m.T) v = P(t); else { var f = m.F[Math.round((t - m.T) / M5) - 1]; v = f ? f.c : null; }
        if (v != null) { sum += v; n++; }
      }
      cells.push(n ? sum / n : null);
    }
    var vv = cells.filter(function (x) { return x != null; }), mn = Math.min.apply(0, vv), bi = cells.indexOf(mn), a2 = bi, b2 = bi;
    while (a2 > 0 && cells[a2 - 1] != null && cells[a2 - 1] <= mn + 0.006) a2--;
    while (b2 < 23 && cells[b2 + 1] != null && cells[b2 + 1] <= mn + 0.006) b2++;
    cells.forEach(function (v, k3) {
      var hh = new Date(h0 + k3 * HR).getHours();
      s += '<s class="' + (v == null ? "nd" : k3 >= a2 && k3 <= b2 ? "win" : "") + '" style="--i:' + k3 + (v != null ? ";--c:" + bsCol((v - mn) * 100) : "") + '"' +
        (v != null ? ' title="' + pad(hh) + " Uhr · ~" + f3(v) + ' €"' : "") + "></s>";
    });
    [0, 6, 12, 18, 24].forEach(function (k4) {
      ax += '<span class="' + (k4 === 0 ? "s" : k4 === 24 ? "e" : "") + '" style="left:' + (k4 / 24 * 100).toFixed(2) + '%">' + (k4 === 0 ? "jetzt" : pad(new Date(h0 + k4 * HR).getHours())) + "</span>";
    });
    var ws = h0 + a2 * HR, we = h0 + (b2 + 1) * HR, inW = m.T >= ws && m.T < we, ehh = new Date(we).getHours();
    var chip = inW ? '<span class="gx-tk-bsc in"><i></i>jetzt · noch ' + dur(we - m.T) + "</span>"
      : m.lv ? '<span class="gx-tk-bsc w"><i></i>teuer · warte ' + dur(m.good - m.T) + "</span>"
      : '<span class="gx-tk-bsc">in ' + dur(ws - m.T) + "</span>";
    return '<div class="gx-tk-best gx-tk-bs' + (inW ? " in" : m.lv ? " w" : "") + '" style="--f:' + ((m.T - h0) / DAY).toFixed(4) + '"><div class="hd"><b>' + pad(new Date(ws).getHours()) + "–" + (ehh === 0 ? "24" : pad(ehh)) +
      '</b><span class="u">Uhr</span><span class="av">~' + f3(mn) + " €</span>" + chip + "</div>" +
      '<div class="sb">' + s + '<span class="fr" style="--a:' + a2 + ";--n:" + (b2 - a2 + 1) + '"></span><span class="now"></span></div><div class="ax">' + ax + "</div></div>";
  }

  /* ---------- Verlauf 12 h + Prognose 18 h ---------- */
  function chart(el, m) {
    var W = el.clientWidth || 580, Hh = el.clientHeight >= 120 ? el.clientHeight : 220, pd = { l: 40, r: 10, t: 14, b: 22 };
    var t0 = m.T - 12 * HR, t1 = m.T + 18 * HR, ET = D.ET, EP = D.EP;
    var past = [], p0 = P(t0); if (p0 != null) past.push({ t: t0, p: p0 });
    for (var i = 0; i < ET.length; i++) if (ET[i] > t0 && ET[i] <= m.T) past.push({ t: ET[i], p: EP[i] });
    past.push({ t: m.T, p: m.cur });
    var F = m.ok ? m.F.filter(function (f) { return f.t <= t1; }) : [];
    var act = [];  /* Demo/Zeitreise: was danach wirklich kam */
    if (m.T < D.stand - M5) {
      var te = Math.min(t1, D.stand); act.push({ t: m.T, p: m.cur });
      for (var j = 0; j < ET.length; j++) if (ET[j] > m.T && ET[j] <= te) act.push({ t: ET[j], p: EP[j] });
      act.push({ t: te, p: P(te) });
    }
    var all = past.map(function (e) { return e.p; }).concat(F.map(function (f) { return f.lo; }), F.map(function (f) { return f.hi; }), act.map(function (e) { return e.p; }));
    var lo = Math.min.apply(0, all) - 0.012, hi = Math.max.apply(0, all) + 0.016;
    var X = function (t) { return pd.l + (t - t0) / (t1 - t0) * (W - pd.l - pd.r); };
    var Y = function (p) { return pd.t + (hi - p) / (hi - lo) * (Hh - pd.t - pd.b); };
    function step(a, key) { var d = ""; a.forEach(function (e, k) { var x = X(e.t).toFixed(1), y = Y(e[key]).toFixed(1); d += k ? "H" + x + "V" + y : "M" + x + "," + y; }); return d; }
    var col = m.lv === 2 ? ["#ff4d6d", "#ff8a5c"] : m.lv === 1 ? ["#ffb547", "#ff7ad9"] : ["#5ee7ff", "#c58bff"];
    var s = '<svg class="gx-tk-ch gx-tkp-ch" width="' + W + '" height="' + Hh + '"><defs>' +
      '<linearGradient id="gxTkL" x1="0" x2="1"><stop offset="0" stop-color="' + col[0] + '"/><stop offset="1" stop-color="' + col[1] + '"/></linearGradient>' +
      '<linearGradient id="gxTkA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + col[1] + '" stop-opacity=".28"/><stop offset="1" stop-color="' + col[0] + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="gxTkF" x1="0" x2="1"><stop offset="0" stop-color="#8f9bff" stop-opacity=".10"/><stop offset="1" stop-color="#8f9bff" stop-opacity=".02"/></linearGradient></defs>';
    var xn = X(m.T);
    s += '<rect x="' + xn + '" y="' + pd.t + '" width="' + (W - pd.r - xn) + '" height="' + (Hh - pd.t - pd.b) + '" fill="url(#gxTkF)"/>';
    if (m.ok) { var yg1 = Y(m.fmin + 0.015), yg0 = Y(m.fmin - 0.004);
      s += '<rect class="gx-tkp-gz" x="' + pd.l + '" y="' + yg1 + '" width="' + (W - pd.l - pd.r) + '" height="' + (yg0 - yg1) + '" rx="4"/>'; }
    [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.8].forEach(function (p) {
      var y = Y(p); s += '<line class="g" x1="' + pd.l + '" x2="' + (W - pd.r) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pd.l - 6) + '" y="' + (y + 3.5) + '" text-anchor="end">' + p.toFixed(2).replace(".", ",") + "</text>";
    });
    var h = new Date(t0); h.setMinutes(0, 0, 0);
    for (var t = h.getTime() + HR; t < t1; t += HR) {
      var hh = new Date(t).getHours(); if (hh % 3) continue; var x = X(t);
      if (Math.abs(x - xn) < 16) continue;
      s += '<line class="g" x1="' + x + '" x2="' + x + '" y1="' + pd.t + '" y2="' + (Hh - pd.b) + '"/><text x="' + x + '" y="' + (Hh - 6) + '" text-anchor="middle">' + pad(hh) + "</text>";
    }
    if (F.length) {
      var bp = [{ t: m.T, lo: m.cur, hi: m.cur }].concat(F), up = "", dn = "";
      bp.forEach(function (f, k) { var x1 = X(f.t).toFixed(1); up += (k ? "H" + x1 + "V" : "M" + x1 + ",") + Y(f.hi).toFixed(1); });
      for (var k = bp.length - 1; k >= 0; k--) dn += "V" + Y(bp[k].lo).toFixed(1) + "H" + X(k ? bp[k - 1].t : m.T).toFixed(1);
      s += '<path class="gx-tkp-band" d="' + up + "H" + X(bp[bp.length - 1].t).toFixed(1) + dn + 'Z"/>';
      s += '<path class="gx-tkp-fc" d="' + step([{ t: m.T, c: m.cur }].concat(F), "c") + '" stroke="url(#gxTkL)"/>';
    }
    if (act.length) s += '<path class="gx-tkp-act" d="' + step(act, "p") + '"/>';
    var area = step(past, "p") + "V" + (Hh - pd.b) + "H" + X(past[0].t).toFixed(1) + "Z";
    s += '<path d="' + area + '" fill="url(#gxTkA)"/><path class="ln' + (anim ? " draw" : "") + '" d="' + step(past, "p") + '" stroke="url(#gxTkL)"/>';
    s += '<line class="gx-tkp-nowl" x1="' + xn + '" x2="' + xn + '" y1="' + pd.t + '" y2="' + (Hh - pd.b) + '"/>' +
      (m.ok ? '<text class="gx-tkp-lab" x="' + (xn + 6) + '" y="' + (pd.t + 10) + '">Prognose →</text>' : "") +
      '<text class="gx-tkp-lab" x="' + (xn - 6) + '" y="' + (pd.t + 10) + '" text-anchor="end">← Verlauf</text>';
    if (m.jump && m.jump.t <= t1) {
      var xj = X(m.jump.t), yj = Y(m.cur + m.jump.dp);
      s += '<g class="gx-tkp-jp"><line x1="' + xj + '" x2="' + xj + '" y1="' + (yj + 4) + '" y2="' + (Hh - pd.b) + '"/>' +
        '<text x="' + Math.min(xj + 6, W - 110) + '" y="' + Math.max(yj - 6, pd.t + 24) + '">▲ ~' + hm(m.jump.t) + " +" + c1(m.jump.dp) + " ct</text></g>";
    }
    if (m.lv >= 1 && m.good) {
      var xg = X(m.good), yg = Y(m.fmin);
      s += '<g class="gx-tkp-gd"><line x1="' + xg + '" x2="' + xg + '" y1="' + (yg + 6) + '" y2="' + (Hh - pd.b) + '"/><circle cx="' + xg + '" cy="' + yg + '" r="4"/>' +
        '<text x="' + Math.min(xg + 7, W - 90) + '" y="' + (yg - 8) + '">gut ab ~' + hq(m.good) + "</text></g>";
    }
    var cc = col[0], yn = Y(m.cur);
    s += '<circle class="ring" cx="' + xn + '" cy="' + yn + '" r="5" stroke="' + cc + '"/>' +
      (m.lv === 2 ? '<circle class="ring" style="animation-delay:.6s" cx="' + xn + '" cy="' + yn + '" r="5" stroke="' + cc + '"/>' : "") +
      '<circle cx="' + xn + '" cy="' + yn + '" r="4.5" fill="' + cc + '" stroke="#05061a" stroke-width="2"/>';
    s += '<rect x="' + pd.l + '" y="0" width="' + (W - pd.l - pd.r) + '" height="' + Hh + '" fill="transparent"/></svg><div class="gx-tk-tip"></div>';
    el.innerHTML = s;
    el.querySelectorAll(".draw").forEach(function (p) { p.style.setProperty("--L", Math.ceil(p.getTotalLength())); });
    var tip = el.querySelector(".gx-tk-tip"), sv = el.querySelector("svg");
    sv.addEventListener("mousemove", function (ev) {
      var b = sv.getBoundingClientRect(), x = ev.clientX - b.left, t = t0 + (x - pd.l) / (W - pd.l - pd.r) * (t1 - t0), y, txt;
      if (t < Math.max(t0, D.first) || t > (F.length ? t1 : m.T)) { tip.style.display = "none"; return; }
      if (t <= m.T) { var p = P(t); y = Y(p); txt = hm(t) + " · <b>" + f3(p) + " €</b>"; }
      else {
        var f = F[Math.min(F.length - 1, Math.max(0, Math.round((t - m.T) / M5) - 1))]; if (!f) return; y = Y(f.c);
        var a = t <= D.stand && m.T < D.stand - M5 ? P(t) : null;
        txt = hm(t) + " · Prognose <b>~" + f3(f.c) + " €</b> <small>(" + f3(f.lo) + "–" + f3(f.hi) + ")</small>" + (a != null ? " · tatsächlich " + f3(a) : "");
      }
      tip.innerHTML = txt; tip.style.display = "block"; tip.style.left = x + "px"; tip.style.top = y + "px";
    });
    sv.addEventListener("mouseleave", function () { tip.style.display = "none"; });
  }

  /* ---------- Panel ---------- */
  function setPart(sel, html) {  /* Minuten-Takt: nur ersetzen, was sich geändert hat (laufende Animationen bleiben) */
    var el = ROOT && ROOT.querySelector(sel); if (!el || el.__h === html) return;
    var tmp = document.createElement("div"); tmp.innerHTML = html;
    var n = tmp.firstChild; n.__h = html; el.replaceWith(n);
  }
  function minute() {
    if (!D || D.demo) return;
    var mi = Math.floor(Date.now() / 6e4); if (mi === MIN) return;
    var lv = level(); compute();
    if (TABS && level() !== lv) tabs();
    if (TAB !== "fuel" || !ROOT || !M || !ROOT.querySelector(".gx-tkp-vd")) return;
    setPart(".gx-tkp-vd", verdict(M)); setPart(".gx-tk-tiles", tilesH(M)); setPart(".gx-tk-bs", next24(M));
    ROOT.className = ROOT.className.replace(/\b(warn|crit)\b/g, "").trim() + (M.lv === 2 ? " crit" : M.lv === 1 ? " warn" : "");
    chart(ROOT.querySelector(".gx-tk-cw"), M); cdTick(); jpTick();
  }
  function render() {
    if (!ROOT || TAB !== "fuel") return;
    if (WXH) ROOT.style.setProperty("--tk-h", WXH + "px");
    var head = '<div class="gx-tk-top"><div class="gx-tk-ico">' + svg(FUEL, 18) + '</div><div class="gx-tk-ttl"><b>' + esc(CSTN.toUpperCase()) + '</b><span>';
    if (!D || !M) {
      ROOT.className = "";
      ROOT.innerHTML = '<div class="gx-tk-grid"><div class="gx-tk-col">' + head + "Super E5</span></div></div><div class=\"gx-tk-msg\">" +
        (ERR ? "⚠ Sprit-Tracker nicht erreichbar (" + API + ")" : "lädt …") + "</div></div></div>";
      return;
    }
    var m = M, lv = level();
    var tr = m.slope == null ? "" : (m.slope > 0.0015 ? "↗ " : m.slope < -0.0015 ? "↘ " : "→ ") + (m.slope >= 0 ? "+" : "−") + c1(m.slope) + " ct/Tag";
    ROOT.className = (lv === 2 ? "crit" : lv === 1 ? "warn" : "") + (anim ? " gx-tk-in" : "");
    var sub = 'Super E5 · <i class="' + (D.open ? "op" : "cl") + '">●</i> ' + (D.open ? "geöffnet" : "geschlossen") +
      ' · <span class="' + (D.stale || ERR ? "old" : "") + '">Stand ' + hm(D.stand) + "</span>" +
      (D.demo ? ' · <span class="gx-tkp-demo" title="Zeitreise über die Verlaufsdaten: ' + WD[new Date(m.T).getDay()] + " " + hm(m.T) + '">DEMO ' + hm(m.T) + "</span>" : "");
    var vd = verdict(m), ti = tilesH(m), bs = next24(m);
    ROOT.innerHTML = '<div class="gx-tk-grid">' +
      '<div class="gx-tk-col gx-tk-now">' + head + sub + "</span></div></div>" +
        '<div class="gx-tk-pr"><span class="gx-tk-price">' + roll(m.cur) + '</span><span class="gx-tk-unit">€/l</span></div>' + vd + ti + "</div>" +
      '<div class="gx-tk-col gx-tk-hrs"><div class="gx-tk-hh"><span class="gx-tk-cap">Verlauf <b>+ Prognose</b></span><span class="sp"></span>' +
        '<span class="gx-tkp-leg"><i class="a"></i>echt<i class="b"></i>Prognose<i class="c"></i>Spanne' + (m.ok ? '<i class="e"></i>gut ≤ ' + f3(m.fmin + 0.015) : "") +
        (m.T < D.stand - M5 ? '<i class="d"></i>später echt' : "") + "</span></div>" +
        '<div class="gx-tk-cw"></div></div>' +
      '<div class="gx-tk-col gx-tk-wk"><div class="gx-tk-hh"><span class="gx-tk-cap">Tagestiefs · <b>7 Tage</b></span><span class="sp"></span><span class="gx-tkp-trc">' + tr + "</span></div>" +
        dayList(m) + bs + "</div>" +
      '</div>' + srcH();
    ROOT.querySelector(".gx-tkp-vd").__h = vd; ROOT.querySelector(".gx-tk-tiles").__h = ti; ROOT.querySelector(".gx-tk-bs").__h = bs;
    cdTick(); jpTick();
    chart(ROOT.querySelector(".gx-tk-cw"), m);
    rollGo();
    anim = false;
  }

  /* ---------- Reiter ---------- */
  function tabs() {
    var lv = D ? level() : 0;
    var tb = TABS.querySelector('[data-t="fuel"] .gx-tab-b');
    tb.textContent = D && D.cur != null ? f3(D.cur) : "–";
    tb.className = "gx-tab-b" + (lv === 2 ? " h" : lv === 1 ? " w" : "");
    var wl = window.__gxWxLv || 0, wb = TABS.querySelector('[data-t="wx"] .gx-tab-b');
    wb.className = "gx-tab-b" + (wl === 2 ? " h" : wl === 1 ? " w" : "");
    [["fuel", lv], ["wx", wl]].forEach(function (p) { var b = TABS.querySelector('.gx-tab[data-t="' + p[0] + '"]');
      b.classList.toggle("warn", p[1] === 1); b.classList.toggle("crit", p[1] === 2); });  /* Reiter-Warnung F */
    var now = document.querySelector("#gx-wx .gx-wx-now"), m = now && /-?\d+\s?°/.exec(now.innerText || "");
    TABS.querySelector('[data-t="wx"] .gx-tab-b').textContent = m ? m[0].replace(/\s/, "") : "–";
    TABS.querySelectorAll(".gx-tab").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === TAB); b.setAttribute("aria-selected", b.getAttribute("data-t") === TAB); });
  }
  function paint() { if (TABS) tabs(); render(); }
  function setTab(t) {
    if (t === TAB) return;
    var wx = document.getElementById("gx-wx");
    if (t === "fuel" && wx && wx.offsetHeight) WXH = wx.offsetHeight;
    TAB = t;
    document.documentElement.setAttribute("data-gx-tab", t);
    if (t === "wx" && window.__gxWxShow) window.__gxWxShow();
    anim = true;
    paint();
  }

  function mount() {
    var wrap = document.getElementById("widgets-wrap");
    if (!wrap || !document.getElementById("gx-wx")) return;
    if (!TABS) {
      TABS = document.createElement("nav");
      TABS.id = "gx-tabs"; TABS.setAttribute("role", "tablist");
      TABS.innerHTML =
        '<button class="gx-tab on" role="tab" data-t="wx"><span class="gx-tab-i">' + svg(SUN) + '</span>Wetter <span class="gx-tab-b">–</span></button>' +
        '<button class="gx-tab" role="tab" data-t="fuel"><span class="gx-tab-i">' + svg(FUEL) + '</span>Tanken <span class="gx-tab-b">–</span></button>';
      TABS.addEventListener("click", function (e) { var b = e.target.closest(".gx-tab"); if (b) setTab(b.getAttribute("data-t")); });
      ROOT = document.createElement("section");
      ROOT.id = "gx-tk"; ROOT.setAttribute("aria-label", "Spritpreis " + CSTN);
    }
    if (TABS.parentNode !== wrap) wrap.appendChild(TABS);
    if (ROOT.parentNode !== wrap) wrap.appendChild(ROOT);
    paint();
  }

  function boot() {
    document.documentElement.setAttribute("data-gx-tab", "wx");
    mount();
    new MutationObserver(function () { if (!TABS || !TABS.isConnected || !ROOT.isConnected) mount(); })
      .observe(document.body, { childList: true, subtree: true });
    load();
    setInterval(function () { if (TABS) tabs(); }, 30000);
    setInterval(function () { if (TAB === "fuel") { cdTick(); jpTick(); } minute(); }, 1000);  /* Prognose im Minutentakt */
    window.addEventListener("gx-wx-lv", function () { if (TABS) tabs(); });
    window.addEventListener("hashchange", function () { anim = true; load(); });
    var rt = 0;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () {
      var wx = document.getElementById("gx-wx"); if (TAB === "wx" && wx) WXH = wx.offsetHeight; render(); }, 200); });
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();

/* ===== Kategorie-Icons (Variante B · Wetter-Wells) =====
   Setzt vor jeden Gruppentitel (h2.service-group-name / .bookmark-group-name) ein
   26px-Glas-Well mit animiertem Linien-Icon. Zuordnung über den Titelanfang
   (zuerst KONFIG kategorien, dann die eingebaute Liste MAP).
   Idempotent + MutationObserver (React rendert Gruppen neu). CSS: KATEGORIE-ICONS. */
(function () {
  if (window.__gxCatIcons) return; window.__gxCatIcons = true;

  function cfg(p, d) { var o = window.GX_CFG, k = p.split("."); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== "object") return d; o = o[k[i]]; } return o == null ? d : o; }
  var KAT = cfg("kategorien", []);  /* [[Titelanfang, Icon-Schlüssel], …] – hat Vorrang vor MAP */
  var IC = {
    fotos: ["#ff9be6", "<path d=\"M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z\"/><circle class=\"ci-iris\" cx=\"12\" cy=\"13\" r=\"3.3\"/><circle class=\"ci-blink\" cx=\"17\" cy=\"9.7\" r=\".7\" fill=\"currentColor\" stroke=\"none\"/>"],
    server: ["#7fdcff", "<rect x=\"4\" y=\"4\" width=\"16\" height=\"6.5\" rx=\"1.6\"/><rect x=\"4\" y=\"13.5\" width=\"16\" height=\"6.5\" rx=\"1.6\"/><circle class=\"ci-led1\" cx=\"7.6\" cy=\"7.25\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><circle class=\"ci-led2\" cx=\"7.6\" cy=\"16.75\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M11 7.25h6M11 16.75h6\" opacity=\".5\"/>"],
    dateien: ["#ffd59a", "<path class=\"ci-bob\" d=\"M8 9.2V4.5h5.6L16.5 7.4v1.8\"/><path d=\"M3.5 9.6A1.5 1.5 0 0 1 5 8.1h3.8l1.6 1.6H19a1.5 1.5 0 0 1 1.5 1.5v6.3A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z\"/>"],
    netzwerk: ["#8fb4ff", "<path d=\"M12 3.2l7 2.8v5.2c0 4.3-2.9 7.6-7 9.6-4.1-2-7-5.3-7-9.6V6z\"/><path class=\"ci-draw\" pathLength=\"1\" d=\"M8.9 12.1l2.2 2.2 4-4.2\"/>"],
    werkzeuge: ["#c58bff", "<g class=\"ci-wobble\"><path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a6 6 0 0 1-7.9 7.9l-6.5 6.5a2.1 2.1 0 0 1-3-3l6.5-6.5a6 6 0 0 1 7.9-7.9z\"/></g>"],
    shopping: ["#ffb3d6", "<g class=\"ci-roll\"><path d=\"M3 4h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.4-1.1L20.3 8H6.5\"/><circle cx=\"9.5\" cy=\"19.3\" r=\"1.3\"/><circle cx=\"17\" cy=\"19.3\" r=\"1.3\"/></g>"],
    d3: ["#7aa2ff", "<g class=\"ci-float\"><path d=\"M12 3l8 4.5v9L12 21l-8-4.5v-9z\"/><path d=\"M4 7.5l8 4.5 8-4.5M12 12v9\"/></g>"],
    sub4: ["#b9a8ff", "<circle cx=\"12\" cy=\"12\" r=\"7.2\"/><g class=\"ci-spin\"><path d=\"M12 2.5v4.2M12 17.3v4.2M2.5 12h4.2M17.3 12h4.2\"/></g><circle class=\"ci-pulse\" cx=\"12\" cy=\"12\" r=\"1.3\" fill=\"currentColor\" stroke=\"none\"/>"],
    arbeit: ["#9db8ff", "<g class=\"ci-bob\"><rect x=\"3.5\" y=\"7.5\" width=\"17\" height=\"12\" rx=\"2\"/><path d=\"M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5\"/><path d=\"M3.5 12.6h7.2M13.3 12.6h7.2\" opacity=\".6\"/><rect x=\"10.7\" y=\"11.4\" width=\"2.6\" height=\"2.4\" rx=\".6\"/></g>"],
    shopcheck: ["#9ff0ff", "<g class=\"ci-scan\"><circle cx=\"10.5\" cy=\"10.5\" r=\"6.2\"/><path d=\"M15.1 15.1l5 5\"/></g><path class=\"ci-draw\" pathLength=\"1\" d=\"M7.9 10.6l1.8 1.8 3.3-3.4\"/>"],
    videos: ["#ff8fa8", "<rect x=\"3\" y=\"5.5\" width=\"18\" height=\"13\" rx=\"3\"/><path class=\"ci-play\" d=\"M10.3 9.3l4.6 2.7-4.6 2.7z\" fill=\"currentColor\"/>"]
  };
  var MAP = [["gaming","sub4"],["fotos","fotos"],["server","server"],["dateien","dateien"],["netzwerk","netzwerk"],["werkzeug","werkzeuge"],
    ["shopping","shopping"],["3d","d3"],["arbeit","arbeit"],["shop-check","shopcheck"],["videos","videos"]];
  function key(t) {
    t = (t || "").trim().toLowerCase();
    var L = Array.isArray(KAT) ? KAT : [], e, i;
    for (i = 0; i < L.length; i++) {  /* Konfiguration zuerst; nur bekannte Icon-Schlüssel, nie ein leerer Präfix */
      e = L[i];
      if (Array.isArray(e) && typeof e[0] === "string" && e[0] && t.indexOf(e[0].toLowerCase()) === 0 &&
          typeof e[1] === "string" && Object.prototype.hasOwnProperty.call(IC, e[1])) return e[1];
    }
    for (i = 0; i < MAP.length; i++) if (t.indexOf(MAP[i][0]) === 0) return MAP[i][1];
    return null;
  }
  function apply() {
    var hs = document.querySelectorAll("#layout-groups :is(.service-group-name, .bookmark-group-name)");
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h.querySelector(":scope > .gx-ci")) continue;
      var k = key(h.textContent); if (!k) continue;
      var s = document.createElement("span");
      s.className = "gx-ci gx-ci-" + k; s.setAttribute("aria-hidden", "true");
      s.style.setProperty("--ci", IC[k][0]);
      s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + IC[k][1] + "</svg>";
      h.insertBefore(s, h.firstChild);
      h.classList.add("gx-ci-h");
    }
  }
  var t = 0;
  function boot() {
    apply();
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(apply, 60); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
})();

/* ==============================================================
   Host-Kerbe (Variante H2) – rechte Kerbe am Heimnetz-Deck
   Leitet die Hosts aus den Dienst-Links ab (Hostname des Links),
   zeigt je Host eine Kapsel (Icon · Name · Anzahl, offline → n/m amber),
   Hover auf eine Kapsel dimmt die Dienste anderer Hosts, Dienste, die
   auf mehreren Hosts laufen (Namens-Präfix), bekommen ein
   Host-Tag. Web-Deck: Kerbe „Externe Dienste“.
   Neuer Server = ein Eintrag unter hosts in der Konfiguration (unbekannte IPs erscheinen als IP).
   CSS: Block „HOST-KERBE (Variante H2)“.
   ============================================================== */
(function () {
  if (window.__gxHostNotch) return;
  window.__gxHostNotch = true;

  function cfg(p, d) { var o = window.GX_CFG, k = p.split("."); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== "object") return d; o = o[k[i]]; } return o == null ? d : o; }
  var I_PI = '<path d="M7 7h10v10H7z"/><path d="M10 10h4v4h-4z"/><path d="M9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3"/>';
  var I_PC = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';
  var I_RT = '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01"/><path d="M8.5 9.5a5 5 0 0 1 7 0M6 7a8.5 8.5 0 0 1 12 0"/>';
  var I_SV = '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/><path d="M8 6.5h.01M8 17.5h.01"/>';
  var I_EXT = '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';
  var HKI = { pi: I_PI, pc: I_PC, router: I_RT, server: I_SV };
  var HOSTS = {}, HKC = cfg("hosts", {});
  if (HKC && typeof HKC === "object") Object.keys(HKC).forEach(function (ip) {
    var h = HKC[ip] || {};
    HOSTS[ip] = { n: h.n || ip, l: h.l || h.n || ip, i: HKI[h.i] || I_SV };
  });
  function svg(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
  function info(ip) { return HOSTS[ip] || { n: ip, l: ip, i: I_SV }; }
  var last = "";

  var DOMHOST = cfg("domains.ausnahmen", {});  /* Domain → Gerät, auf dem der Dienst wirklich läuft (Rest = Standard-Host) */
  if (!DOMHOST || typeof DOMHOST !== "object") DOMHOST = {};
  /* Suffix normalisiert: ohne führenden Punkt, kleingeschrieben (Hostnamen aus URL().hostname sind klein) */
  var DSUF = String(cfg("domains.suffix", "")).toLowerCase().replace(/^[\s.]+|\s+$/g, ""), DSTD = cfg("domains.standard", "");
  var DRE = DSUF ? new RegExp("(^|\\.)" + DSUF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") : null;
  function hostOf(h) { return DRE && DRE.test(h) ? (DOMHOST[h] || DSTD || h) : h; }
  function scan(lg) {
    var map = {}, order = [];
    lg.querySelectorAll(".services-group li.service").forEach(function (li) {
      var a = li.querySelector("a[href]"), ip = "?";
      try { ip = new URL(a.href).hostname; } catch (e) {}
      ip = hostOf(ip); /* eigene Domains laufen über den Reverse-Proxy auf dem Standard-Host; Dienst auf anderem Gerät → DOMHOST */
      if (li.getAttribute("data-host") !== ip) li.setAttribute("data-host", ip);
      var dot = li.querySelector(".site-monitor-status .rounded-full");
      var on = !dot || dot.classList.contains("bg-emerald-500") ||
        (dot.classList.contains("opacity-20") && !document.body.classList.contains("gx-sm-ready")); /* Platzhalter nur in der Schonfrist neutral */
      var name = li.getAttribute("data-name") || "?";
      if (!map[ip]) { map[ip] = { ip: ip, all: [], off: [] }; order.push(ip); }
      map[ip].all.push(name); if (!on) map[ip].off.push(name);
    });
    return order.map(function (k) { return map[k]; }).sort(function (a, b) { return b.all.length - a.all.length; });
  }

  function chip(x) {
    var h = info(x.ip), o = x.off.length, n = x.all.length;
    var t = h.l + " · " + x.ip + " · " + n + (n === 1 ? " Dienst" : " Dienste") + (o ? " · offline: " + x.off.join(", ") : "");
    return '<span class="gx-hk-h" data-ip="' + esc(x.ip) + '" title="' + esc(t) + '">' + svg(h.i) + esc(h.n) +
      '<span class="gx-hk-n' + (o ? " w" : "") + '">' + (o ? (n - o) + "/" + n : n) + "</span></span>";
  }

  function update() {
    var lg = document.getElementById("layout-groups");
    var H = document.querySelector(".gx-dk-head.home"), W = document.querySelector(".gx-dk-head.web");
    if (!lg || !H || !W) return;
    var hs = scan(lg), main = hs.length ? hs[0].ip : "";

    /* Host-Tags nur bei Diensten, die auf mehreren Hosts laufen
       (gleicher Name bzw. Namens-Präfix, z. B. „Pi-hole“ + „Pi-hole 2“) */
    var lis = [].slice.call(lg.querySelectorAll(".services-group li.service"));
    var nm = lis.map(function (li) { return { ip: li.getAttribute("data-host"), n: (li.getAttribute("data-name") || "").toLowerCase().trim() }; });
    lis.forEach(function (li, k) {
      var ip = li.getAttribute("data-host"), tag = li.querySelector(":scope > .gx-hk-tag");
      var a = nm[k].n, multi = !!a && nm.some(function (o, j) {
        return j !== k && o.ip !== ip && o.n && (o.n.indexOf(a) === 0 || a.indexOf(o.n) === 0);
      });
      if (!multi) { if (tag) tag.remove(); return; }
      var h = info(ip);
      if (tag && tag.getAttribute("data-ip") === ip) return;
      if (tag) tag.remove();
      tag = document.createElement("span"); tag.className = "gx-hk-tag"; tag.setAttribute("data-ip", ip);
      tag.innerHTML = svg(h.i) + esc(h.n); li.appendChild(tag);
    });

    var nav = H.querySelector(".gx-hk");
    if (!nav) {
      nav = document.createElement("nav"); nav.className = "gx-hk"; nav.setAttribute("aria-label", "Hosts");
      nav.addEventListener("mouseover", function (e) {
        var c = e.target.closest(".gx-hk-h"); if (!c) return;
        lg.classList.add("gx-hk-focus");
        lg.querySelectorAll(".services-group li.service").forEach(function (li) { li.classList.toggle("gx-hk-hit", li.getAttribute("data-host") === c.getAttribute("data-ip")); });
      });
      nav.addEventListener("mouseleave", function () {
        lg.classList.remove("gx-hk-focus");
        lg.querySelectorAll("li.gx-hk-hit").forEach(function (li) { li.classList.remove("gx-hk-hit"); });
      });
      H.appendChild(nav);
    }
    if (!W.querySelector(".gx-hk")) {
      var w = document.createElement("nav"); w.className = "gx-hk";
      w.innerHTML = '<span class="gx-hk-x">' + svg(I_EXT) + "Externe Dienste</span>"; W.appendChild(w);
    }
    var key = hs.map(function (x) { return x.ip + ":" + x.all.length + ":" + x.off.join(","); }).join("|");
    if (key === last || lg.classList.contains("gx-hk-focus")) return;
    last = key;
    nav.innerHTML = hs.map(chip).join("");
  }

  var queued = false;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; try { update(); } catch (e) {} }); }
  function boot() {
    update();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    setInterval(schedule, 5000);
  }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
})();

/* ==============================================================
   Müll-Panel (Variante A · Zeitleiste)
   - Dritter Reiter „Müll“ in #gx-tabs (Kerbe), Panel #gx-mu in grid-area deck,
     gleiche Hülle/Höhe wie Wetter/Tanken (html[data-gx-tab="mu"]).
   - Spalten: Nächste Abfuhr + Chip + Quellen-Hinweis + 4 Tonnen-Kacheln |
     Zeitleiste 5 Wochen (eine Spur je Tonne, Schadstoff gedämpft) |
     nächste Termine (Liste wie „Wochentage“).
   - Daten: Container „muell-tracker“ über das Gateway (/muell/termine):
     iCal-Abfuhrkalender des Ortes + Störungshinweis der Anbieter-Startseite.
   - Zustände: warn = Abfuhr übermorgen (2 Tage vorher), crit = Abfuhr morgen
     oder heute (bis 10 Uhr). Anbieter-Störungshinweis = nur Hinweiskasten, keine
     Warnstufe. Demo: #mudemo=warn|crit|note
   - Schadstoffplan (muell-tracker schad.state): info = neuer Plan online,
     noch nicht eingespielt → Chip in der Zeitleiste + ruhiges Update-Symbol
     im Reiter; due = neues Jahr ohne Plan → Panel/Reiter .upd (Signal-Azur),
     Abfuhr-Stufen haben Vorrang, das Symbol bleibt. Demo: #mudemo=plan|upd|updcrit
   - Reiter-Klick schaltet über den Tanken-Block (setTab), dieser Block hängt
     nur seinen Knopf an und reagiert auf html[data-gx-tab].
   Styles: Block „MÜLL-PANEL“ in custom.css.
   ============================================================== */
(function () {
  if (window.__gxMu) return;
  window.__gxMu = true;

  function cfg(p, d) { var o = window.GX_CFG, k = p.split("."); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== "object") return d; o = o[k[i]]; } return o == null ? d : o; }
  var CQ = String(cfg("muell.quelle", "Anbieter")), CQL = String(cfg("muell.quelleLang", "Abfuhrkalender"));
  var CQH = cfg("muell.quelle", null) ? String(CQ).toUpperCase() + "-HINWEIS" : "HINWEIS";  /* ohne Quelle: neutral „HINWEIS“ */
  var CSO = cfg("muell.schadOrt", ""), CSOK = cfg("muell.schadOrtKurz", CSO), CLAB = cfg("muell.label", "");
  /* Schadstoffplan-Link vom Sidecar nur annehmen, wenn er zur konfigurierten PDF-Quelle gehört (gleicher Origin wie
     muell.pdf); ohne muell.pdf genügt https:// – kein beliebiger Link aus der Sidecar-Antwort */
  function urlOk(u) {
    if (typeof u !== "string" || !/^https:\/\//.test(u)) return false;
    var p = String(cfg("muell.pdf", ""));
    if (!p) return true;
    try { return new URL(u).origin === new URL(p.replace(/\{year\}/g, "0")).origin; } catch (e) { return false; }
  }

  var API = window.GX_MU_API || location.origin + "/muell";
  var FETCH_MS = 30 * 60 * 1000, CUT = 10, DAYS = 35;
  var D = null, ERR = null, ROOT = null, BTN = null, anim = true, inT = 0;
  var ORDER = ["rest", "bio", "papier", "gelb"];
  var BIN = {
    rest: { n: "Restmüll", s: "Rest" }, bio: { n: "Biomüll", s: "Bio" },
    papier: { n: "Altpapier", s: "Papier" }, gelb: { n: "Gelbe Tonne", s: "Gelb" },
    schad: { n: "Schadstoff", s: "Schadstoff" }
  };
  var WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"], WDL = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  var GLYPH = {
    rest: '<path d="M10 12.5h4M10 15.5h4"/>',
    bio: '<path d="M9.5 16.5c0-3 2-4.8 5-4.8 0 3-2 4.8-5 4.8z"/><path d="M9.5 16.5l2.4-2.4"/>',
    papier: '<rect x="9.3" y="11" width="5.4" height="6" rx=".6"/><path d="M10.6 13h2.8M10.6 15h2"/>',
    gelb: '<path d="M12 11.2l2.3 4h-4.6z"/>'
  };
  var LID = '<g class="gx-mu-lid"><path d="M4.5 7.5h15"/><path d="M10 7.5V6h4v1.5"/></g><path d="M6 7.5l1.1 11.6A1.6 1.6 0 0 0 8.7 20.5h6.6a1.6 1.6 0 0 0 1.6-1.4L18 7.5"/>';
  function sv(inner, w, sw) { return '<svg viewBox="0 0 24 24"' + (w ? ' width="' + w + '" height="' + w + '"' : "") + ' fill="none" stroke="currentColor" stroke-width="' + (sw || 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>"; }
  function binSvg(k) {
    if (k === "schad") return sv('<path d="M9.5 4h5M10.5 4v5L6 18.5A1.6 1.6 0 0 0 7.4 21h9.2a1.6 1.6 0 0 0 1.4-2.5L13.5 9V4"/><path d="M8 15h8"/>');
    return sv(LID + GLYPH[k]);
  }
  var TRASH = LID + '<path d="M10 11v6M14 11v6"/>';

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function D0(s) { var p = s.split("-"); return new Date(+p[0], p[1] - 1, +p[2]); }
  function day0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function diff(a, b) { return Math.round((day0(a) - day0(b)) / 864e5); }
  function dm(d) { return d.getDate() + "." + (d.getMonth() + 1) + "."; }
  function dmz(d) { return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "."; }
  function rel(n) { return n === 0 ? "heute" : n === 1 ? "morgen" : n === 2 ? "übermorgen" : "in " + n + " T"; }
  function relCap(n) { return n === 0 ? "Heute" : n === 1 ? "Morgen" : n === 2 ? "Übermorgen" : n + "<small>Tage</small>"; }
  function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function demo() { var m = /mudemo=(warn|crit|note|plan|updcrit|upd)/.exec(location.hash); return m ? m[1] : null; }
  var UPSV = '<path d="M20 12a8 8 0 0 1-13.7 5.7"/><path d="M4 12A8 8 0 0 1 17.7 6.3"/><path d="M18 2.5v4h-4"/><path d="M6 21.5v-4h4"/>';
  function PDF(y) { var u = String(cfg("muell.pdf", "")).replace(/\{year\}/g, y); return /^https:\/\//.test(u) ? u : ""; }
  function zeit() { var z = D && D.schad && D.schad.zeit; return typeof z === "string" && z.length && z.length < 30 ? z : "9–12 Uhr"; }
  /* Schadstoffplan-Status vom Tracker (oder Demo) prüfen; null = nichts anzeigen */
  function plan(now, dm0) {
    var y = now.getFullYear() + 1, s = D && D.schad;
    if (dm0 === "plan") return { state: "info", need: y, online: true, url: PDF(y) };
    if (dm0 === "upd" || dm0 === "updcrit") return { state: "due", need: y, online: true, url: PDF(y) };
    if (!s || typeof s !== "object" || (s.state !== "info" && s.state !== "due")) return null;
    var need = +s.need; if (!(need > 2000 && need < 2100)) return null;
    return { state: s.state, need: need, online: s.online === true,
      url: urlOk(s.url) ? s.url : "" };
  }

  /* ---------- Modell ---------- */
  function model() {
    var all = D.events.map(function (e) { return { d: D0(e.d), k: e.k }; });
    var now = new Date(), dm0 = demo();
    var done = function (d) { var n = diff(d, now); return n < 0 || (n === 0 && now.getHours() >= CUT); };
    var firstUp = function () { return all.filter(function (e) { return e.k !== "schad" && !done(e.d); })[0]; };
    if (dm0 === "crit" || dm0 === "warn" || dm0 === "updcrit") {
      var f = firstUp(); if (f) { now = new Date(f.d); now.setDate(now.getDate() - (dm0 === "warn" ? 2 : 1)); now.setHours(18, 30); }
    }
    var up = all.filter(function (e) { return !done(e.d); });
    var upB = up.filter(function (e) { return e.k !== "schad"; });
    if (!upB.length) return null;
    var nd = upB[0].d, nx = upB.filter(function (e) { return +e.d === +nd; }), dd = diff(nd, now);
    var notice = D.notice && D.notice.warn ? D.notice : dm0 === "note" ? { head: "Hinweis zur Abholung", text: "Wegen einer Straßensperrung kann sich die Abholung um einen Tag verschieben (Demo).", scope: "Restmüll und Biomüll", seen: new Date().toISOString(), warn: true } : null;
    var lv = dd <= 1 ? 2 : dd === 2 ? 1 : 0;   /* Der Quellen-Hinweis hebt die Stufe nicht an */
    var per = {};
    ORDER.forEach(function (k) {
      var n = up.filter(function (e) { return e.k === k; })[0];
      per[k] = { next: n && n.d, n: n ? diff(n.d, now) : null };
    });
    return { now: now, t0: day0(now), all: all, up: up, upB: upB, nd: nd, nx: nx, dd: dd, lv: lv, per: per, notice: notice, done: done, pu: plan(now, dm0) };
  }

  /* ---------- Bausteine ---------- */
  function head() {
    var t = D.fetched_at ? new Date(D.fetched_at) : null;
    return '<div class="gx-tk-top"><div class="gx-tk-ico">' + sv(TRASH, 18) + '</div><div class="gx-tk-ttl"><b>ABFUHR</b><span>' + esc(D.label || CLAB) +
      (t ? (D.label || CLAB ? " · " : "") + '<span class="' + (D.stale || ERR ? "old" : "") + '">Stand ' + dmz(t) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()) + "</span>" : "") + (demo() ? (D.label || CLAB || t ? " · " : "") + "DEMO" : "") + "</span></div></div>";
  }
  function chip(m) {
    var names = m.nx.map(function (e) { return BIN[e.k].s; }).join(" + ");
    if (m.dd === 0) return '<span class="gx-tk-chip h">⚡ jetzt rausstellen · ' + names + "</span>";
    if (m.dd === 1) return '<span class="gx-tk-chip h">⚡ heute Abend rausstellen · ' + names + "</span>";
    if (m.dd === 2) return '<span class="gx-tk-chip w">⚠ übermorgen Abfuhr · ' + names + "</span>";
    return '<span class="gx-tk-chip ok"><i></i>nichts zu tun · nächste ' + WD[m.nd.getDay()] + " " + dm(m.nd) + "</span>";
  }
  function hero(m) {
    return '<div class="gx-mu-hero"><span class="gx-mu-big">' + relCap(m.dd) + "</span></div>" +
      '<div class="gx-mu-when"><span class="d">' + WDL[m.nd.getDay()] + " " + dmz(m.nd) + "</span>" +
      m.nx.map(function (e) { return '<span class="gx-mu-dot k-' + e.k + '">' + BIN[e.k].n + "</span>"; }).join("") + "</div>";
  }
  function note(m) {
    var n = m.notice; if (!n) return "";
    var s = n.seen ? new Date(n.seen) : null, sc = n.scope ? " (" + n.scope.replace(/ und /g, ", ") + ")" : "";
    return '<div class="gx-mu-note" title="' + esc(CQ + " · " + (n.head ? String(n.head) : "Hinweis") + sc + ": " + n.text) + '"><i>⚠</i><div><b>' + esc(CQH) + '</b>' + (s ? " · " + dm(s) : "") +
      "<span>" + esc(n.text) + "</span></div></div>";
  }
  function tile(m, k, i) {
    var p = m.per[k], due = p.n !== null && p.n === m.dd && m.dd <= 2;
    return '<div class="gx-wx-tile gx-mu-tw k-' + k + (due ? " due" : "") + '" style="--d:' + i + '"><div class="gx-wx-ti">' + binSvg(k) + '</div><div class="gx-wx-tv"><b>' +
      (p.n === null ? "–" : rel(p.n)) + "</b><em>" + BIN[k].s + (p.next ? " · " + WD[p.next.getDay()] + " " + dm(p.next) : "") + "</em></div></div>";
  }
  function list(m, max) {
    var first = m.upB[0], pd = !!(m.pu && m.pu.state === "due");
    return '<ul class="gx-mu-list">' + m.up.slice(0, max).map(function (e, i) {
      var n = diff(e.d, m.now), nm = n === 0 ? "Heute" : n === 1 ? "Morgen" : WD[e.d.getDay()], sz = e.k === "schad";
      var nx = !sz && +e.d === +first.d;
      return '<li class="k-' + e.k + (nx ? " nx" : "") + (sz ? " sz" : "") + (sz && pd ? " upd" : "") + '" style="--d:' + i + '"><span class="n">' + nm + "<small>" + dm(e.d) + "</small></span>" +
        '<span class="gx-mu-dot k-' + e.k + '"' + (sz ? ' title="Stationäre Schadstoffsammlung' + (CSO ? " · " + esc(CSO) : "") + (pd ? " · nur berechnet, Plan " + m.pu.need + " fehlt" : "") + '"' : "") + ">" + (sz ? "Schadstoff · " + esc(zeit()) : BIN[e.k].n) +
        '</span><span class="cd">' + (n === 0 ? "heute" : n + " T") + "</span></li>";
    }).join("") + "</ul>";
  }
  function timeline(m) {
    var start = new Date(m.t0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    var end = new Date(start); end.setDate(end.getDate() + DAYS);
    var X = function (d) { return ((diff(d, start) + 0.5) / DAYS * 100).toFixed(3) + "%"; };
    var g = '<div class="gx-mu-bg">';
    for (var w = 0; w < DAYS / 7; w++) {
      if (w % 2) g += '<div class="wk" style="left:' + (w * 7 / DAYS * 100) + "%;width:" + (7 / DAYS * 100) + '%"></div>';
      g += '<div class="vl" style="left:' + (w * 7 / DAYS * 100) + '%"></div>';
    }
    g += '<div class="gx-mu-now"><b>jetzt</b></div></div>';
    var h = '<div class="gx-mu-tl" data-s="' + start.getTime() + '">' + g + "<div></div><div></div>", d = 0;
    ORDER.concat(["schad"]).forEach(function (k) {
      var sz = k === "schad";
      h += '<div class="gx-mu-ln k-' + k + (sz ? " sz" : "") + (sz && m.pu && m.pu.state === "due" ? " upd" : "") + '"><span class="w">' + binSvg(k) + "</span>" + BIN[k].s + "</div>";
      h += '<div class="gx-mu-tr k-' + k + (sz ? " sz" : "") + '">';
      m.all.forEach(function (e) {
        if (e.k !== k || e.d < start || e.d >= end) return;
        var past = m.done(e.d), nx = !past && !sz && +e.d === +m.nd;
        h += '<span class="gx-mu-pt' + (past ? " past" : "") + (sz ? " sz" : "") + (nx ? " nx" : "") + '" style="left:' + X(e.d) + ";--d:" + (d++) + '"' +
          (sz ? ' title="Schadstoffsammlung ' + esc(zeit()) + (CSOK ? " · " + esc(CSOK) : "") + '"' : "") + ">" + (nx ? '<span class="gx-mu-rg"></span>' : "") + "<b>" + dm(e.d) + "</b></span>";
      });
      h += "</div>";
    });
    h += '<div class="gx-mu-ax">';
    for (var w2 = 0; w2 < DAYS / 7; w2++) {
      var md = new Date(start); md.setDate(md.getDate() + w2 * 7);
      h += '<span style="left:' + ((w2 * 7 + 3.5) / DAYS * 100) + '%">' + dm(md) + "<i>KW " + isoWeek(md) + "</i></span>";
    }
    return h + "</div></div>";
  }
  function upChip(m) {
    var p = m.pu; if (!p) return "";
    var due = p.state === "due", tag = p.url ? "a" : "span";
    var t = due ? "Schadstoffplan " + p.need + " fehlt" : "Neuer Schadstoffplan " + p.need, tl = due && !p.online ? " · " + CQ + " noch ohne Plan" : " · einspielen";
    var ti = (due ? "Die Schadstofftermine " + p.need + " sind nur aus dem alten Rhythmus berechnet. " + (p.online ? "Der neue Plan ist online (PDF)." : "Der " + CQ + " hat noch keinen Plan veröffentlicht.")
      : "Der " + CQ + " hat den Schadstoffplan " + p.need + " veröffentlicht, er ist noch nicht eingespielt.") +
      " Einspielen: im muell-tracker SCHAD_ANCHOR um den ersten Termin " + p.need + " ergänzen.";
    return "<" + tag + ' class="gx-mu-up ' + (due ? "due" : "i") + '"' + (p.url ? ' href="' + esc(p.url) + '" target="_blank" rel="noopener"' : "") +
      ' title="' + esc(ti) + '"><i>' + sv(UPSV, 12, 2.4) + "</i><span>" + esc(t) + "<em>" + esc(tl) + "</em></span></" + tag + ">";
  }
  function nowTick(m) {
    var tl = ROOT && ROOT.querySelector(".gx-mu-tl"); if (!tl) return;
    var now = m ? m.now : new Date(), st = new Date(+tl.getAttribute("data-s"));
    var x = (diff(now, st) + (now.getHours() + now.getMinutes() / 60) / 24) / DAYS * 100;
    tl.style.setProperty("--nx", Math.max(0, Math.min(100, x)).toFixed(3) + "%");
  }
  function setH(el, html) { if (el.__h !== html) { el.innerHTML = html; el.__h = html; return true; } return false; }

  /* ---------- Panel ---------- */
  function render() {
    if (!ROOT) return;
    if (!D || !D.events || !D.events.length) {
      ROOT.className = "";
      setH(ROOT, '<div class="gx-tk-grid"><div class="gx-tk-col gx-tk-now"><div class="gx-tk-top"><div class="gx-tk-ico">' + sv(TRASH, 18) +
        '</div><div class="gx-tk-ttl"><b>ABFUHR</b><span>' + esc(CLAB) + '</span></div></div></div></div><div class="gx-mu-msg">' +
        (ERR ? "⚠ Müll-Tracker nicht erreichbar (" + esc(API) + ")" : "lädt …") + "</div>");
      tab(null); return;
    }
    var m = model();
    if (!m) { setH(ROOT, '<div class="gx-mu-msg">Keine kommenden Termine – ' + esc(CQ) + '-Kalender fürs neue Jahr noch nicht veröffentlicht?</div>'); tab(null); return; }
    var show = document.documentElement.getAttribute("data-gx-tab") === "mu";
    if (show && anim) { ROOT.__h = null; clearTimeout(inT); inT = setTimeout(function () { ROOT.classList.remove("gx-mu-in"); }, 2600); }
    var html = '<div class="gx-tk-grid">' +
      '<div class="gx-tk-col gx-tk-now">' + head() + hero(m) + "<div>" + chip(m) + "</div>" + note(m) +
        '<div class="gx-tk-tiles">' + ORDER.map(function (k, i) { return tile(m, k, i); }).join("") + "</div></div>" +
      '<div class="gx-tk-col gx-mu-mid"><div class="gx-tk-hh"><span class="gx-tk-cap">Zeitleiste · <b>5 Wochen</b></span>' + upChip(m) + '</div>' + timeline(m) + "</div>" +
      '<div class="gx-tk-col gx-mu-nx"><div class="gx-tk-hh"><span class="gx-tk-cap">Termine · <b>nächste</b></span></div>' + list(m, 9) + "</div>" +
      '</div><div class="gx-tk-src">' + esc(CQL) + '</div>';
    var cls = (m.lv === 2 ? "crit" : m.lv === 1 ? "warn" : m.pu && m.pu.state === "due" ? "upd" : "") + (ROOT.classList.contains("gx-mu-in") || (show && anim) ? " gx-mu-in" : "");
    ROOT.className = cls.trim();
    setH(ROOT, html);
    nowTick(m);
    if (show) anim = false;
    tab(m);
  }
  function tab(m) {
    if (!BTN) return;
    var b = BTN.querySelector(".gx-tab-b"), lv = m ? m.lv : 0;
    b.textContent = m ? (m.dd === 0 ? "heute" : m.dd === 1 ? "morgen" : m.dd + " T") : "–";
    b.className = "gx-tab-b" + (lv === 2 ? " h" : lv === 1 ? " w" : "");
    BTN.classList.toggle("warn", lv === 1); BTN.classList.toggle("crit", lv === 2);
    /* Update-Symbol: eigenes Element rechts vom Badge – stört Ringe/Badge der Abfuhr nicht */
    var p = m && m.pu, u = BTN.querySelector(".gx-tab-u"), due = !!(p && p.state === "due");
    BTN.classList.toggle("upd", due && lv === 0);
    if (p && !u) { u = document.createElement("span"); u.innerHTML = sv(UPSV, 12, 2.4); BTN.appendChild(u); }
    if (u && !p) { u.parentNode.removeChild(u); u = null; }
    if (u) { u.className = "gx-tab-u " + (due ? "due" : "i"); u.title = due ? "Schadstoffplan " + p.need + " fehlt" : "Neuer Schadstoffplan " + p.need + " online"; }
  }

  function load() {
    fetch(API + "/termine", { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { D = d; ERR = d.ok ? null : d.error || "Fehler"; render(); })
      .catch(function (e) { ERR = String(e.message || e); render(); });
  }

  function mount() {
    var wrap = document.getElementById("widgets-wrap"), tabs = document.getElementById("gx-tabs");
    if (!wrap || !tabs) return;
    if (!ROOT) {
      ROOT = document.createElement("section");
      ROOT.id = "gx-mu"; ROOT.setAttribute("aria-label", "Müllabfuhr " + cfg("ort.name", "Ort"));
    }
    if (!BTN) {
      BTN = document.createElement("button");
      BTN.className = "gx-tab"; BTN.setAttribute("role", "tab"); BTN.setAttribute("data-t", "mu");
      BTN.innerHTML = '<span class="gx-tab-i">' + sv(TRASH, 17, 2) + '</span>Müll <span class="gx-tab-b">–</span>';
    }
    if (BTN.parentNode !== tabs) {
      tabs.appendChild(BTN);
      /* vor dem Umschalten die Höhe des sichtbaren Panels merken → kein Springen */
      tabs.addEventListener("click", function (e) {
        var b = e.target.closest(".gx-tab"); if (!b || b.getAttribute("data-t") !== "mu") return;
        var v = [document.getElementById("gx-wx"), document.getElementById("gx-tk")].filter(function (x) { return x && x.offsetHeight; })[0];
        if (v) ROOT.style.setProperty("--mu-h", v.offsetHeight + "px");
      }, true);
    }
    if (ROOT.parentNode !== wrap) wrap.appendChild(ROOT);
    render();
  }

  function boot() {
    mount();
    new MutationObserver(function () { if (!ROOT || !ROOT.isConnected || !BTN || !BTN.isConnected) mount(); })
      .observe(document.body, { childList: true, subtree: true });
    var last = document.documentElement.getAttribute("data-gx-tab");
    new MutationObserver(function () {
      var t = document.documentElement.getAttribute("data-gx-tab");
      if (t === last) return; last = t;
      if (t === "mu") { anim = true; ROOT && ROOT.classList.add("gx-mu-in"); render(); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-gx-tab"] });
    load();
    setInterval(load, FETCH_MS);
    setInterval(function () { if (D) render(); }, 60000);
    window.addEventListener("hashchange", function () { anim = true; render(); });
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
/* ==============================================================
   Luft-Panel (Variante A · Spuren)
   - Vierter Reiter „Luft“ in #gx-tabs (nach Müll), Panel #gx-lu in grid-area
     deck, gleiche Hülle/Höhe wie Wetter/Tanken/Müll (html[data-gx-tab="lu"]).
   - Zweck: Lüften (Pollen: Gräser + Roggen, dazu Luft-Index)
     und UV-Ort (UV-Index; Bezeichnung aus KONFIG luft.uvOrt).
   - Spalten: zwei Antworten (Lüften / UV-Ort) + 4 Kacheln |
     vier Stunden-Spuren nächste 24 h (Gräser, Roggen, Luft, UV) mit Rahmen für
     das beste 2-h-Lüftfenster und UV ≥ 3 | nächste 4 Tage (Höchstwerte).
   - Daten: (1) Open-Meteo Air-Quality-API (CAMS Europa) direkt aus dem Browser,
     alle 30 min, Cache localStorage „gxLu.v1“.
     (2) DWD-Pollenflug-Gefahrenindex Roggen (Teilregion aus der Konfiguration), über
     die nginx-Route /dwd/s31fg.json (gleiche Origin), alle 60 min, Cache
     localStorage „gxLuR.v1“ {t,R}. Beide Quellen laden unabhängig; fehlen
     DWD-Daten, zählt Roggen als Stufe 0 (Spur schraffiert „keine DWD-Daten“).
     Die Datei liefert Tagesstufen heute/morgen/übermorgen (Bezug = Ausgabe-
     datum, nicht Browser-Datum); jede Stunde erbt die Stufe ihres Tages.
   - Schwellen: Gräser mäßig ≥ 10, stark > 30 Pollen/m³ · Luft-Index (EAQI)
     Warnung ≥ 60, kritisch ≥ 80 · UV Warnung ≥ 3, kritisch ≥ 6 ·
     Roggen (DWD 0–3) Warnung 2 und 2–3, kritisch 3.
     Zustand (.warn/.crit) = höchste Stufe der aktuellen Stunde; Lüften-Urteil,
     bestes Fenster und Reiter-Badge nutzen max(Gräser, Luft, Roggen).
   - Demo: #ludemo=warn|crit (synthetische Demo-Daten;
     „Heute“ = Datum der Browser-Uhr);
     Roggen im Demo simuliert: warn 2 / 1–2 / 1, crit 3 / 2–3 / 2.
   - Test: window.GX_LU_RG = {issued:"YYYY-MM-DD", st:["3","3","3"]} überschreibt
     die geladenen DWD-Daten (nicht im Demo).
   - Reiter-Klick schaltet über den Tanken-Block (setTab); dieser Block hängt
     nur seinen Knopf an und reagiert auf html[data-gx-tab].
   Styles: Block „LUFT-PANEL“ in custom.css (Handy: HANDY-ANSICHT).
   ============================================================== */
(function () {
  if (window.__gxLu) return;
  window.__gxLu = true;

  function cfg(p, d) { var o = window.GX_CFG, k = p.split("."); for (var i = 0; i < k.length; i++) { if (o == null || typeof o !== "object") return d; o = o[k[i]]; } return o == null ? d : o; }
  var CPL = String(cfg("ort.name", "Ort"));
  /* Zahl aus der Konfiguration: nur echte Zahlen oder nicht-leere Zahlen-Strings, sonst NaN */
  function cnum(v) { return typeof v === "number" || (typeof v === "string" && /\S/.test(v)) ? Number(v) : NaN; }

  /* Standard-Ort (Berlin) nur, wenn ort.lat/ort.lon FEHLEN; ungültige Werte starten keinen Abruf (LOK) */
  var LAT = cnum(cfg("ort.lat", 52.52)), LON = cnum(cfg("ort.lon", 13.41)), KEY = "gxLu.v1", FETCH_MS = 30 * 60 * 1000;
  var LOK = isFinite(LAT) && isFinite(LON) && Math.abs(LAT) <= 90 && Math.abs(LON) <= 180;
  var TZ = encodeURIComponent(String(cfg("ort.tz", "Europe/Berlin")));
  var TROK = isFinite(dnum(cfg("dwd.teilregion", NaN)));  /* gültige DWD-Teilregion vorhanden? */
  var API = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + LAT + "&longitude=" + LON +
    "&hourly=grass_pollen,european_aqi,pm2_5,uv_index&forecast_days=5&timezone=" + TZ;
  var DEMO = {"warn":{"g":[14.8,11.9,12.0,11.4,10.7,13.1,16.0,16.5,19.0,22.8,23.4,26.7,25.3,29.5,29.0,30.6,28.5,24.4,21.7,25.0,22.2,18.6,16.2,13.6,14.0,14.2,14.8,12.9,12.0,14.8,15.6,19.5,24.4,23.1,26.0,29.1,32.8,31.2,29.7,34.8,36.1,34.7,33.9,31.4,24.5,20.7,17.6,15.7,13.8,12.8,14.0,14.8,14.5,13.5,17.1,18.0,18.3,18.8,22.1,28.1,30.5,36.4,37.6,36.5,38.4,31.4,29.2,26.2,27.1,25.3,22.8,22.0,17.3,16.7,14.5,12.8,12.3,15.3,17.4,19.4,24.1,25.8,30.9,35.1,32.6,37.1,36.5,37.4,32.7,34.7,34.7,30.3,29.9,25.4,19.4,15.8],"a":[17,13,15,14,19,16,18,16,21,20,26,29,30,33,34,35,36,35,34,30,26,27,23,19,21,18,20,22,24,23,21,23,25,27,23,25,29,27,27,26,24,22,26,25,28,24,22,19,18,17,20,20,24,25,26,29,29,29,30,27,30,26,25,26,25,27,27,28,26,23,23,20,18,17,17,18,18,20,20,19,26,26,27,27,27,27,30,32,29,26,25,28,26,23,21,19],"pm":[4.8,4.9,4.7,4.9,5.0,4.8,4.5,5.0,5.5,5.5,5.7,6.1,6.0,6.4,6.2,6.0,6.2,6.2,6.2,6.1,5.6,5.4,5.0,4.5,3.9,3.9,3.8,3.6,3.6,3.5,3.6,3.8,4.0,4.2,4.6,4.8,5.3,5.2,5.4,5.4,5.5,5.4,5.5,5.0,5.1,4.6,4.3,3.8,4.5,4.2,4.2,4.1,4.4,4.4,4.7,5.1,5.3,5.4,5.5,5.9,6.0,6.1,6.6,6.7,6.9,6.7,6.6,6.2,5.6,5.7,5.4,4.9,4.9,5.3,4.9,5.2,5.4,5.1,5.0,5.7,5.6,6.0,6.9,7.4,7.4,7.5,7.2,7.6,7.2,6.9,7.1,6.8,6.9,6.1,5.9,5.4],"u":[0.0,0.0,0.0,0.0,0.0,0.1,0.6,1.4,2.2,3.2,4.1,5.0,5.0,4.6,4.1,3.4,2.2,1.3,0.6,0.1,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.1,0.4,1.0,1.8,2.5,3.2,3.6,3.7,3.8,3.2,2.4,1.9,1.0,0.4,0.1,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.1,0.4,0.9,1.4,2.1,2.8,3.2,3.3,3.2,2.7,2.2,1.4,0.8,0.4,0.1,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.1,0.4,1.1,1.8,2.6,3.3,3.7,4.0,3.8,3.4,2.5,1.8,1.1,0.4,0.1,0.0,0.0,0.0,0.0],"H":14},"crit":{"g":[24.4,23.1,19.5,19.4,19.2,23.0,23.3,23.6,32.4,39.1,42.4,46.5,45.1,49.4,56.2,52.7,55.4,58.0,47.0,42.0,43.6,41.9,31.6,24.5,22.5,21.2,19.4,19.2,21.7,23.0,22.9,30.6,33.1,37.6,41.7,43.4,41.2,42.9,52.5,47.8,50.7,49.4,42.3,43.9,43.0,35.8,32.6,31.8,22.7,22.7,23.0,21.7,22.0,22.2,21.7,28.6,33.1,33.7,41.0,38.4,46.8,47.6,51.5,52.0,48.9,52.3,50.6,42.1,35.5,36.3,28.4,24.7,26.6,26.2,20.8,19.0,18.0,18.9,22.7,29.9,30.1,33.1,42.6,48.9,52.0,46.1,50.3,56.7,47.6,48.9,48.0,42.5,43.5,39.3,37.2,30.1],"a":[29,26,21,19,18,25,29,33,32,33,35,41,47,50,50,51,50,50,50,48,45,41,39,36,36,34,27,29,27,26,26,34,36,40,44,49,53,57,58,61,59,62,57,54,50,44,40,37,26,24,23,20,18,25,32,36,39,47,49,54,57,62,63,65,67,65,64,59,55,47,43,36,43,39,39,37,35,39,40,44,46,50,55,59,65,66,72,68,65,67,62,61,57,51,44,40],"pm":[6.7,6.4,6.8,7.2,7.4,7.0,6.9,7.2,7.2,7.5,8.2,8.7,8.8,9.1,9.6,9.8,9.1,9.0,9.0,8.2,8.3,7.7,7.9,7.9,9.9,8.9,9.4,8.9,9.5,9.7,8.9,9.3,9.9,10.8,11.2,11.1,11.1,11.3,11.4,12.0,12.1,11.8,11.2,10.6,10.5,9.8,9.7,9.5,10.4,9.8,9.2,9.6,9.7,9.7,10.2,10.1,11.3,11.3,11.8,12.5,12.9,13.3,13.8,13.8,12.9,12.6,13.0,11.9,11.3,11.7,11.4,10.6,10.0,10.1,10.0,9.9,9.7,9.4,8.8,8.9,9.3,9.8,9.8,11.2,12.3,12.6,12.3,11.8,12.7,11.8,11.7,11.2,11.5,10.5,9.8,9.3],"u":[0.0,0.0,0.0,0.0,0.0,0.2,0.8,2.1,3.3,5.0,5.9,7.0,7.3,7.1,6.0,4.9,3.3,2.0,0.9,0.2,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.2,0.8,2.0,3.3,4.7,5.4,6.0,6.3,6.2,5.7,4.2,2.8,2.0,0.9,0.2,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.2,0.8,1.9,3.2,4.3,5.1,5.8,6.1,5.8,5.6,4.4,3.2,2.0,0.8,0.2,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.2,0.7,1.6,3.1,4.6,5.8,6.4,6.1,6.7,5.9,4.4,3.1,1.9,0.8,0.2,0.0,0.0,0.0,0.0],"H":15}};
  var DEMO_RG = { warn: ["2", "1-2", "1"], crit: ["3", "2-3", "2"] };  /* simuliert */
  var RGKEY = "gxLuR.v1", RG_MS = 60 * 60 * 1000, RG_URL = location.origin + "/dwd/s31fg.json";
  var RG = null, RG_RETRY = 0, RG_RETRIED = 0, RG_FAIL = 0, RG_OK = 0;  /* RG_FAIL: letzter DWD-Abruf fehlgeschlagen; RG_OK: Zeitpunkt der letzten erfolgreichen Daten */
  var D = null, ERR = null, ROOT = null, BTN = null, anim = true, inT = 0, STAND = null, TS = 0;
  var WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  var sv = function (p, s, w) { return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  var I = {
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
    gras: '<path d="M6 21c0-5-1-9-3.5-11.5M12 21c0-6.5 1-11 3.5-14.5M17.5 21c0-4 1.2-7 4-9"/><path d="M9 21c0-3-.6-5.5-2-7.5"/>',
    luft: '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 15h15a3 3 0 1 1-3 3"/><path d="M3 12h7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    fen: '<rect x="4.5" y="3" width="15" height="18" rx="1.6"/><path d="M12 3v18M4.5 12h15"/>',
    uvort: '<path d="M3 20.5V10l9-6 9 6v10.5z"/><path d="M8 20.5V7.4M12 20.5V4M16 20.5V7.4M3 13.5h18"/>',
    ear: '<path d="M12 22V8"/><path d="M12 8c-2-1-2.6-3-2-5 2 .6 2.6 2.6 2 5zM12 8c2-1 2.6-3 2-5-2 .6-2.6 2.6-2 5z"/><path d="M12 13c-2.2-.6-3.2-2.4-3-4.4 2.1.3 3.2 2.2 3 4.4zM12 13c2.2-.6 3.2-2.4 3-4.4-2.1.3-3.2 2.2-3 4.4z"/><path d="M12 18c-2.2-.6-3.2-2.4-3-4.4 2.1.3 3.2 2.2 3 4.4zM12 18c2.2-.6 3.2-2.4 3-4.4-2.1.3-3.2 2.2-3 4.4z"/>',
    pm: '<circle cx="7" cy="8" r="1.4"/><circle cx="14" cy="6" r="1"/><circle cx="17" cy="12" r="1.6"/><circle cx="9" cy="15" r="1.1"/><circle cx="14" cy="18" r="1.3"/><circle cx="5" cy="19" r=".9"/>'
  };

  /* ---------- Stufen ---------- */
  function lvG(g) { if (g == null) return 0; g = Math.round(g); return g > 30 ? 2 : g >= 10 ? 1 : 0; }  /* gerundet = wie angezeigt */
  function lvA(a) { if (a == null) return 0; a = Math.round(a); return a >= 80 ? 2 : a >= 60 ? 1 : 0; }
  function lvU(u) { if (u == null) return 0; u = Math.round(u * 10) / 10; return u >= 6 ? 2 : u >= 3 ? 1 : 0; }
  function wG(g) { return g == null ? "keine Daten" : Math.round(g) < 1 ? "keine" : ["gering", "mäßig", "stark"][lvG(g)]; }
  function n1(x) { return x == null ? "–" : (Math.round(x * 10) / 10).toString().replace(".", ","); }
  function r0(x) { return x == null ? "–" : String(Math.round(x)); }
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function hh(h) { return String(((h % 24) + 24) % 24).padStart(2, "0"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function ok(d) {
    var h = d && d.hourly;
    return !!h && ["time", "grass_pollen", "european_aqi", "pm2_5", "uv_index"].every(function (k) { return Array.isArray(h[k]); });
  }

  /* RG-HELPERS */
  /* DWD-Pollengefahrenindex Roggen (Teilregion aus der Konfiguration, dwd.teilregion; optional dwd.region = region_id,
     nötig, wenn die Teilregion nicht eindeutig ist, z. B. -1 bei mehreren Ländern).
     „today“ in der Datei = Ausgabedatum aus last_update, nicht das Browser-Datum. */
  var RG_STAGES = { "0": 1, "0-1": 1, "1": 1, "1-2": 1, "2": 1, "2-3": 1, "3": 1 };
  var RG_WORD = { "0": "keine", "0-1": "keine\u2013gering", "1": "gering", "1-2": "gering\u2013mittel",
    "2": "mittel", "2-3": "mittel\u2013hoch", "3": "hoch" };

  /* Zahl aus der Konfiguration, streng: echte Zahl oder nicht-leerer Ziffern-String (optional mit „-“), sonst NaN */
  function dnum(v) { return typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+\s*$/.test(v) ? Number(v) : NaN; }

  function rgParse(json) {
    if (!json || typeof json !== "object" || !Array.isArray(json.content)) return null;
    if (typeof json.last_update !== "string") return null;
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(json.last_update);
    if (!m) return null;
    var reg = null, i, e, TR = dnum(cfg("dwd.teilregion", NaN)), RR = dnum(cfg("dwd.region", NaN));
    if (!isFinite(TR)) return null;
    for (i = 0; i < json.content.length; i++) {  /* mit gültiger dwd.region: region_id UND partregion_id, sonst nur partregion_id */
      e = json.content[i];
      if (e && e.partregion_id === TR && (!isFinite(RR) || e.region_id === RR)) { reg = e; break; }
    }
    var r = reg && reg.Pollen && reg.Pollen.Roggen;
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    return { issued: m[1], st: [r.today, r.tomorrow, r.dayafter_to] };
  }

  function rgUtc(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!m) return NaN;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), c = new Date(t);
    if (c.getUTCMonth() !== +m[2] - 1 || c.getUTCDate() !== +m[3]) return NaN;
    return t;
  }

  function rgDay(R, key, d) {
    if (!R || !Array.isArray(R.st)) return null;
    var a = rgUtc(R.issued), b = rgUtc(key);
    if (isNaN(a) || isNaN(b)) return null;
    var off = Math.round((b - a) / 86400000) + (typeof d === "number" ? d : 0);
    if (off < 0 || off > 2) return null;
    var v = R.st[off];
    return (typeof v === "string" && Object.prototype.hasOwnProperty.call(RG_STAGES, v)) ? v : null;
  }

  function rgLv(stage) {
    if (stage === "3") return 2;
    if (stage === "2" || stage === "2-3") return 1;
    return 0;
  }

  function rgFmt(stage) {
    if (typeof stage === "string" && Object.prototype.hasOwnProperty.call(RG_STAGES, stage)) {
      return stage.replace("-", "\u2013");
    }
    return "\u2013";
  }
  /* /RG-HELPERS */

  /* ---------- Modell ---------- */
  function model() {
    var dm = /ludemo=(warn|crit)/.exec(location.hash), src, H, t0, t, key;
    if (dm) { src = DEMO[dm[1]]; H = src.H; t0 = ymd(new Date()); }  /* Demo: „Heute“ = Datum der Browser-Uhr */
    else {
      if (!ok(D)) return null;
      var h = D.hourly; t = h.time;
      /* Ortszeit aus dem API-Offset, unabhängig von der Browser-Zeitzone */
      var off = (D.utc_offset_seconds || 0) * 1000, loc = new Date(Date.now() + off).toISOString();
      key = loc.slice(0, 10); var i0 = t.indexOf(key + "T00:00");
      if (i0 < 0) return null;
      H = i0 + +loc.slice(11, 13); t0 = key;
      src = { g: h.grass_pollen, a: h.european_aqi, pm: h.pm2_5, u: h.uv_index };
      if (i0) src = { g: src.g.slice(i0), a: src.a.slice(i0), pm: src.pm.slice(i0), u: src.u.slice(i0) };
      H -= i0;
    }
    var g = src.g, a = src.a, pm = src.pm, u = src.u, N = Math.min(g.length, a.length, pm.length, u.length);
    if (H + 24 > N) return null;
    /* Roggen (DWD): Tagesstufe je Kalendertag ab heute 00:00; fehlend → null → Stufe 0 */
    var R = dm ? { issued: t0, st: DEMO_RG[dm[1]] } : (window.GX_LU_RG || RG);
    key = t0;
    var rd = [0, 1, 2, 3].map(function (d) { return rgDay(R, key, d); });
    var rgAt = function (i) { return rd[Math.floor(i / 24)] || null; };
    var lvL = function (i) { return Math.max(lvG(g[i]), lvA(a[i]), rgLv(rgAt(i))); };
    var sc = function (i) { return g[i] == null || a[i] == null ? 1e6 : lvL(i) * 10 + Math.max(g[i] / 30, a[i] / 80); };  /* Stufe zuerst, dann Wert */
    var best = H, bv = 1e9;
    for (var i = H; i < H + 23; i++) { var v = Math.max(sc(i), sc(i + 1)); if (v < bv - 1e-9) { bv = v; best = i; } }
    var allGood = true; for (i = H; i < H + 24; i++) if (lvL(i) || g[i] == null) { allGood = false; break; }
    var uvRuns = [], ra = -1;
    for (var k = 0; k <= 24; k++) { var on = k < 24 && lvU(u[H + k]) > 0; if (on && ra < 0) ra = k; if (!on && ra >= 0) { uvRuns.push([ra, k]); ra = -1; } }
    var uvFrom = null; for (i = H; i < 24; i++) if (!lvU(u[i])) { uvFrom = i; break; }
    var uvFirst = null; for (i = H; i < H + 24; i++) if (lvU(u[i])) { uvFirst = i; break; }
    var LL = lvL(H), LU = lvU(u[H]);
    var rs = []; for (i = H; i < H + 24; i++) rs.push(rgAt(i));
    var rgNone = rs.every(function (x) { return x == null; });
    var days = [];
    for (var d = 0; d < 4; d++) {
      var s = d * 24, mx = function (arr) { var m = null; for (var j = s; j < s + 24 && j < arr.length; j++) if (arr[j] != null && (m == null || arr[j] > m)) m = arr[j]; return m; };
      var dt = new Date(t0 + "T12:00"); dt.setDate(dt.getDate() + d);
      var gm = mx(g), am = mx(a), um = mx(u);
      days.push({ nm: d === 0 ? "Heute" : d === 1 ? "Morgen" : WD[dt.getDay()], dd: dt.getDate() + "." + (dt.getMonth() + 1) + ".", g: gm, a: am, u: um, r: rd[d] });
    }
    return { demo: !!dm, H: H, g: g, a: a, pm: pm, u: u, best: best, bestLv: Math.max(lvL(best), lvL(best + 1)), allGood: allGood,
      uvRuns: uvRuns, uvFrom: uvFrom, uvFirst: uvFirst, LL: LL, LU: LU, lv: Math.max(LL, LU), days: days, rs: rs, rgNone: rgNone };
  }

  /* ---------- Bausteine ---------- */
  function lueftTxt(m) { return m.allGood ? "jederzeit" : (m.best >= 24 ? "morgen " : "") + hh(m.best) + "–" + hh(m.best + 2) + " Uhr"; }
  /* DWD-Hinweis: letzter Abruf fehlgeschlagen UND Daten nicht aus einem Erfolg der letzten 3 h (oder gar keine); nie im Demo */
  function rgDown(m) { return !!(m && !m.demo && RG_FAIL && !(RG_OK && Date.now() - RG_OK <= 3 * 3600 * 1000)); }
  function head(m) {
    var st = m && m.demo ? "Demo · " + hh(m.H) + ":00" : STAND ? "Stand " + stamp(TS) : LOK ? "lädt …" : "–";
    if (m && !m.demo && ERR && Date.now() - TS > 2 * 3600 * 1000) st += ' · <span class="old">⚠ veraltet</span>';
    if (rgDown(m)) st += ' · <span class="old">⚠ DWD nicht erreichbar</span>';
    return '<div class="gx-tk-top"><div class="gx-tk-ico">' + sv(I.leaf, 18) + '</div><div class="gx-tk-ttl"><b>LUFT &amp; POLLEN</b><span>' + esc(CPL) + ' · Open-Meteo' + (TROK ? " + DWD" : "") + ' · ' + st + "</span></div></div>";
  }
  function verdicts(m) {
    var lt = lueftTxt(m), uvTxt;
    var l1 = m.LL ? (m.LL === 2 ? "Fenster zu" : "Nur kurz lüften") : "Jetzt gut";
    var s1 = m.g[m.H] == null ? "keine Pollendaten · Luft " + ["gut", "mäßig", "schlecht"][lvA(m.a[m.H])] : m.allGood ? (Math.round(m.g[m.H]) >= 1 ? "Pollen gering · Luft gut" : "keine Pollen · Luft gut") : (m.bestLv ? "am wenigsten " : "gut ") + lt;
    var l2 = m.LU ? (m.LU === 2 ? "Sonne stark" : "Sonne mäßig") : "Angenehm";
    if (m.LU) uvTxt = m.uvFrom != null ? "angenehm ab " + hh(m.uvFrom) + " Uhr" : "angenehm erst morgen";
    else uvTxt = m.uvFirst != null ? "UV ≥ 3 ab " + (m.uvFirst >= 24 ? "morgen " : "") + hh(m.uvFirst) + " Uhr" : m.H >= 17 ? "UV niedrig · auch morgen" : "UV niedrig · ganztags";
    var vd = function (ic, cap, big, sub, l) { return '<div class="gx-lu-vd l' + l + '"><span class="gx-lu-vi">' + sv(ic, 20) + "</span><div><em>" + cap + "</em><b>" + big + "</b><small>" + sub + "</small></div></div>"; };
    return vd(I.fen, "Lüften", l1, s1, m.LL) + vd(I.uvort, esc(cfg("luft.uvOrt", "Draußen")), l2, uvTxt, m.LU);
  }
  function tiles(m) {
    var H = m.H, g = m.g[H], a = m.a[H], pm = m.pm[H], u = m.u[H];
    var t = function (ic, col, big, em, d, l) { return '<div class="gx-wx-tile gx-lu-t l' + l + '" style="--d:' + d + ";--c:" + col + '"><div class="gx-wx-ti">' + sv(ic, 17) + '</div><div class="gx-wx-tv"><b>' + big + "</b><em>" + em + "</em></div></div>"; };
    return '<div class="gx-tk-tiles">' +
      t(I.gras, "#c5e88a", r0(g) + "<small>/m³</small>", "Gräser · " + wG(g), 0, lvG(g)) +
      t(I.luft, "#7fdcff", r0(a), "Luft-Index · " + ["gut", "mäßig", "schlecht"][lvA(a)], 1, lvA(a)) +
      t(I.pm, "#b9a8ff", n1(pm) + "<small>µg</small>", '<span class="gx-lu-long">Feinstaub </span>PM2.5', 2, 0) +
      t(I.sun, "#ffd59a", n1(u), "UV · " + ["niedrig", "mäßig", "hoch"][lvU(u)], 3, lvU(u)) + "</div>";
  }
  function lanes(m) {
    var H = m.H;
    var lane = function (ic, nm, arr, lf, mx, val) {
      var c = "";
      for (var k = 0; k < 24; k++) {
        var v = arr[H + k], nd = v == null, l = lf(v);
        c += '<i class="' + (nd ? "nd" : "l" + l) + (k === 0 ? " now" : "") + '" style="--o:' + (nd ? 0 : (.25 + .75 * Math.min(1, v / mx))).toFixed(2) + ";--d:" + k +
          '" title="' + hh(H + k) + " Uhr: " + (nd ? "keine Daten" : n1(v)) + '"></i>';
      }
      return '<div class="gx-lu-ln"><div class="gx-lu-lb"><span class="gx-lu-li">' + sv(ic, 15) + "</span><b>" + nm + '</b><em class="l' + lf(arr[H]) + '">' + val + '</em></div><div class="gx-lu-cells">' + c + "</div></div>";
    };
    var rgLane = function () {
      var c = "", k, lv0 = rgLv(m.rs[0]);
      for (k = 0; k < 24; k++) {
        var s = m.rs[k], nd = s == null;
        c += '<i class="' + (nd ? "nd" : "l" + rgLv(s)) + (k === 0 ? " now" : "") + ((H + k) % 24 === 0 && k > 0 ? " d1" : "") + '" style="--d:' + k +
          '" title="' + hh(H + k) + " Uhr: Roggen " + (nd ? "keine Daten" : rgFmt(s) + " (" + RG_WORD[s] + ")") + '"></i>';
      }
      /* Tageslabels mittig im Tagesabschnitt (nur ab 4 Zellen); Position wie pos(): Zellen + Spaltenabstand */
      var seg = function (a, n, txt) {
        return n < 4 ? "" : '<span class="gx-lu-dl" style="left:calc((100% + var(--cg)) * ' + ((a + n / 2) / 24).toFixed(4) + ' - var(--cg) / 2)">' + txt + "</span>";
      };
      var k1 = 24 - (H % 24), lb = "";
      if (m.rgNone) lb = '<span class="gx-lu-dl" style="left:50%">keine DWD-Daten</span>';
      else lb = seg(0, k1, "heute " + rgFmt(m.rs[0])) + (k1 < 24 ? seg(k1, 24 - k1, "morgen " + rgFmt(m.rs[k1])) : "");
      var rgT = rgDown(m) ? "Roggen (DWD): nicht erreichbar \u2013 " + (RG_OK ? "letzte Daten vom " + new Date(RG_OK).getDate() + "." + (new Date(RG_OK).getMonth() + 1) + "." : "keine Daten") : "Roggen (DWD): Warnung ab 2, kritisch bei 3";
      return '<div class="gx-lu-ln rg"><div class="gx-lu-lb" title="' + rgT + '"><span class="gx-lu-li">' + sv(I.ear, 15) + "</span><b>Roggen</b><em class=\"l" + lv0 + '\">' + rgFmt(m.rs[0]) +
        '</em></div><div class="gx-lu-cells">' + c + lb + "</div></div>";
    };
    var pos = function (a, w) { return "left:calc(var(--lx) + (100% - var(--lx) + var(--cg)) * " + (a / 24).toFixed(4) + " - 2px);width:calc((100% - var(--lx) + var(--cg)) * " + (w / 24).toFixed(4) + " - var(--cg) + 4px)"; };
    var fr = m.allGood ? "" : '<div class="gx-lu-fr" style="' + pos(m.best - H, 2) + '"><span>Lüften</span></div>';
    var ufr = m.uvRuns.map(function (r) { return '<div class="gx-lu-fr u" style="' + pos(r[0], r[1] - r[0]) + '"><span>UV ≥ 3</span></div>'; }).join("");
    var ax = [0, 6, 12, 18, 24].map(function (k) { return '<span style="left:' + (k / 24 * 100) + '%">' + (k ? hh(H + k) : "jetzt") + "</span>"; }).join("");
    return '<div class="gx-lu-lanes">' +
      lane(I.gras, "Gräser", m.g, lvG, 45, r0(m.g[H])) + rgLane() + lane(I.luft, "Luft", m.a, lvA, 100, r0(m.a[H])) + lane(I.sun, "UV", m.u, lvU, 8, n1(m.u[H])) +
      fr + ufr + '</div><div class="gx-lu-ax">' + ax + "</div>" +
      '<div class="gx-lu-leg"><span><i class="l0"></i>gering</span><span><i class="l1"></i>mäßig</span><span><i class="l2"></i>stark</span><span class="k">Gräser 10/30 · Luft 60/80 · UV 3/6</span></div>';
  }
  function dayList(m) {
    var p = function (l, ic, txt, t, x) { return '<span class="gx-lu-p ' + (x ? x + " " : "") + "l" + l + '" title="' + t + '">' + sv(ic, 12, 2) + txt + "</span>"; };
    var rp = function (s) {
      return '<span class="gx-lu-p rg ' + (s == null ? "nd" : "l" + rgLv(s)) + '" title="Roggen (DWD): ' + (s == null ? "keine Daten" : RG_WORD[s]) + '">' + sv(I.ear, 12, 2) + rgFmt(s) + "</span>";
    };
    return '<ul class="gx-lu-days">' + m.days.map(function (d, i) {
      return '<li class="' + (i === 0 ? "nx" : "") + '" style="--d:' + i + '"><span class="n">' + d.nm + " <small>" + d.dd + '</small></span><span class="gx-lu-ps">' +
        p(lvG(d.g), I.gras, r0(d.g), "Gräser max. Pollen/m³") + rp(d.r) + p(lvA(d.a), I.luft, r0(d.a), "Luft-Index max.") + p(lvU(d.u), I.sun, n1(d.u), "UV max.") + "</span></li>";
    }).join("") + "</ul>";
  }
  function setH(el, html) { if (el.__h !== html) { el.innerHTML = html; el.__h = html; return true; } return false; }

  /* ---------- Panel ---------- */
  function render() { try { draw(); } catch (e) { ERR = "Darstellung: " + (e && e.message || e); D = null; try { draw(); } catch (e2) { } } }
  function draw() {
    if (!ROOT) return;
    var m = model();
    if (!m) {
      ROOT.className = "";
      setH(ROOT, '<div class="gx-tk-grid"><div class="gx-tk-col gx-tk-now">' + head(null) + '</div></div><div class="gx-lu-msg">' +
        (!LOK ? "Ort nicht konfiguriert" : ERR ? "⚠ Open-Meteo nicht erreichbar (" + esc(ERR) + ")" : "lädt …") + "</div>");
      tab(null); return;
    }
    var show = document.documentElement.getAttribute("data-gx-tab") === "lu";
    if (show && anim) { ROOT.__h = null; clearTimeout(inT); inT = setTimeout(function () { ROOT.classList.remove("gx-lu-in"); }, 2600); }
    var html = '<div class="gx-tk-grid">' +
      '<div class="gx-tk-col gx-tk-now">' + head(m) + verdicts(m) + tiles(m) + "</div>" +
      '<div class="gx-tk-col gx-lu-mid"><div class="gx-tk-hh"><span class="gx-tk-cap">Verlauf · <b>nächste 24 h</b></span></div>' + lanes(m) + "</div>" +
      '<div class="gx-tk-col gx-lu-nx"><div class="gx-tk-hh"><span class="gx-tk-cap">Nächste · <b>4 Tage</b></span></div>' + dayList(m) + "</div>" +
      '</div><div class="gx-tk-src"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · CAMS Europa' + (TROK ? ' · Quelle: <a href="https://www.dwd.de/" target="_blank" rel="noopener noreferrer">Deutscher Wetterdienst</a> (Pollenflug-Gefahrenindex)' : "") + '</div>';
    var cls = (m.lv === 2 ? "crit" : m.lv === 1 ? "warn" : "") + (ROOT.classList.contains("gx-lu-in") || (show && anim) ? " gx-lu-in" : "");
    ROOT.className = cls.trim();
    setH(ROOT, html);
    if (show) anim = false;
    tab(m);
  }
  function tab(m) {
    if (!BTN) return;
    var b = BTN.querySelector(".gx-tab-b"), lv = m ? m.lv : 0;
    b.textContent = m ? ["gut", "mäßig", "stark"][lv] : "–";
    b.className = "gx-tab-b" + (lv === 2 ? " h" : lv === 1 ? " w" : "");
    BTN.classList.toggle("warn", lv === 1); BTN.classList.toggle("crit", lv === 2);
  }

  /* ---------- Daten ---------- */
  function stamp(t) { var d = new Date(t), n = new Date(), s = hh(d.getHours()) + ":" + String(d.getMinutes()).padStart(2, "0");
    return d.toDateString() === n.toDateString() ? s : d.getDate() + "." + (d.getMonth() + 1) + ". " + s; }
  function load() {
    if (!LOK) return;  /* ungültige Koordinaten → kein Abruf */
    fetch(API, { cache: "no-store", signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        if (!ok(d)) throw new Error("unvollständige Daten");
        D = d; ERR = null; var t = Date.now(); TS = t; STAND = stamp(t);
        try { localStorage.setItem(KEY, JSON.stringify({ t: t, d: d })); } catch (e) { }
        render();
      })
      .catch(function (e) { ERR = String(e.message || e); render(); });
  }
  /* DWD Roggen: unabhängig von Open-Meteo; bei Fehler/ungültiger Datei bleiben die letzten Daten stehen.
     Nach einem Fehlschlag genau EIN Wiederholversuch nach 5 min je Fehlerserie (RG_RETRIED); scheitert auch er,
     folgt der nächste Versuch erst mit dem regulären 60-min-Takt (rgTick setzt den Zähler zurück). */
  function rgFail() {
    RG_FAIL = Date.now();
    if (RG_RETRY || RG_RETRIED) return;
    RG_RETRIED = 1;
    RG_RETRY = setTimeout(function () { RG_RETRY = 0; rgLoad(); }, 5 * 60 * 1000);
  }
  function rgTick() { RG_RETRIED = 0; rgLoad(); }
  function rgLoad() {
    if (!TROK) return;  /* ohne gültige Teilregion kein DWD-Abruf → Roggen „keine DWD-Daten“ */
    try {
      fetch(RG_URL, { cache: "no-store", signal: window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) {
          var R = rgParse(j); if (!R) throw new Error("DWD-Datei unvollständig");
          RG = R; RG_FAIL = 0; RG_RETRIED = 0; RG_OK = Date.now();
          try { localStorage.setItem(RGKEY, JSON.stringify({ t: Date.now(), R: R })); } catch (e) { }
          render();
        })
        .catch(function () { rgFail(); render(); });
    } catch (e) { rgFail(); render(); }
  }
  function rgCached() {
    if (!TROK) return Infinity;
    try {
      var c = JSON.parse(localStorage.getItem(RGKEY) || "null");
      if (c && typeof c.t === "number" && c.R && typeof c.R.issued === "string" && Array.isArray(c.R.st)) {
        RG = { issued: c.R.issued, st: c.R.st.slice(0, 3) };
        RG_OK = c.t <= Date.now() ? c.t : 0;
        var age = Date.now() - c.t;
        return age >= 0 ? age : Infinity; /* Zeitstempel in der Zukunft → Boot-Fetch erzwingen */
      }
    } catch (e) { }
    return Infinity;
  }
  function cached() {
    if (!LOK) return Infinity;  /* Cache stammt evtl. von einem anderen Ort */
    try { var c = JSON.parse(localStorage.getItem(KEY) || "null"); if (c && ok(c.d) && c.t) { D = c.d; TS = c.t; STAND = stamp(c.t); return Date.now() - c.t; } } catch (e) { }
    return Infinity;
  }

  function mount() {
    var wrap = document.getElementById("widgets-wrap"), tabs = document.getElementById("gx-tabs");
    if (!wrap || !tabs) return;
    if (!ROOT) {
      ROOT = document.createElement("section");
      ROOT.id = "gx-lu"; ROOT.setAttribute("aria-label", "Luft, Pollen und UV " + CPL);
    }
    if (!BTN) {
      BTN = document.createElement("button");
      BTN.className = "gx-tab"; BTN.setAttribute("role", "tab"); BTN.setAttribute("data-t", "lu");
      BTN.innerHTML = '<span class="gx-tab-i">' + sv(I.leaf, 17, 2) + '</span>Luft <span class="gx-tab-b">–</span>';
    }
    if (BTN.parentNode !== tabs) {
      tabs.appendChild(BTN);
      /* vor dem Umschalten die Höhe des sichtbaren Panels merken → kein Springen */
      tabs.addEventListener("click", function (e) {
        var b = e.target.closest(".gx-tab"); if (!b) return;
        /* Luft sichtbar → Müll übernimmt dessen Höhe (Müll-Block kennt #gx-lu nicht) */
        if (b.getAttribute("data-t") === "mu" && ROOT.offsetHeight) { var mu = document.getElementById("gx-mu"); if (mu) mu.style.setProperty("--mu-h", ROOT.offsetHeight + "px"); }
        if (b.getAttribute("data-t") !== "lu") return;
        var v = ["gx-wx", "gx-tk", "gx-mu"].map(function (id) { return document.getElementById(id); }).filter(function (x) { return x && x.offsetHeight; })[0];
        if (v) ROOT.style.setProperty("--lu-h", v.offsetHeight + "px");
      }, true);
    }
    if (ROOT.parentNode !== wrap) wrap.appendChild(ROOT);
    render();
  }

  function boot() {
    var age = cached(), rgAge = rgCached();
    mount();
    new MutationObserver(function () { if (!ROOT || !ROOT.isConnected || !BTN || !BTN.isConnected) mount(); })
      .observe(document.body, { childList: true, subtree: true });
    var last = document.documentElement.getAttribute("data-gx-tab");
    new MutationObserver(function () {
      var t = document.documentElement.getAttribute("data-gx-tab");
      if (t === last) return; last = t;
      if (t === "lu") { anim = true; ROOT && ROOT.classList.add("gx-lu-in"); render(); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-gx-tab"] });
    if (age > FETCH_MS) load();
    setInterval(load, FETCH_MS);
    if (rgAge > RG_MS) rgLoad();
    setInterval(rgTick, RG_MS);
    setInterval(function () { render(); }, 60000);
    window.addEventListener("hashchange", function () { anim = true; render(); });
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
/* ==============================================================
   Handy-Leistung (Pause außer Sicht) – NUR bis 700px Breite.
   Panels/Gruppen, die gerade nicht im Bild sind, bekommen .gx-oos;
   custom.css (HANDY-ANSICHT, Abschnitt 8) pausiert darin alle
   CSS-Animationen. Am PC läuft dieser Block nicht (matchMedia).
   ============================================================== */
(function () {
  if (window.__gxMobPerf) return;
  window.__gxMobPerf = true;
  if (!window.matchMedia || !window.IntersectionObserver) return;
  var MQ = window.matchMedia("(max-width: 700px)");
  var SEL = "#widgets-wrap > *, #information-widgets-right > *, #layout-groups > *, #gx-tabs, " +
            "#widgets-wrap > [id^=\"gx-\"] > * > *";   /* Spalten der Deck-Panels (am Handy ~1000 px hoch) */
  var io = null, seen = [], timer = 0;

  function scan() {
    var els = document.querySelectorAll(SEL);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.__gxOos || el.id === "gx-canvas") continue;
      /* display:contents hat keine Box → würde nie „sichtbar“ und bliebe pausiert */
      if (getComputedStyle(el).display === "contents") continue;
      el.__gxOos = true; seen.push(el); io.observe(el);
    }
  }
  function on() {
    if (io) return;
    io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) es[i].target.classList.toggle("gx-oos", !es[i].isIntersecting);
    }, { rootMargin: "120px 0px" });
    scan();
    timer = setInterval(scan, 3000);   /* Panels der anderen Blöcke kommen später dazu */
  }
  function off() {
    if (!io) return;
    io.disconnect(); io = null; clearInterval(timer);
    for (var i = 0; i < seen.length; i++) { seen[i].__gxOos = false; seen[i].classList.remove("gx-oos"); }
    seen = [];
  }
  function sync() { if (MQ.matches) on(); else off(); }
  if (MQ.addEventListener) MQ.addEventListener("change", sync); else if (MQ.addListener) MQ.addListener(sync);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync); else sync();
})();
