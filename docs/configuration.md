# Configuration

All values shown here and in the shipped `KONFIG` blocks are example (mock) values for the demo, not the author's real setup.

## 1. `custom.js` – `GX_CFG`

At the top of `homepage/config/custom.js`, between the marker lines `/* KONFIG-START */` and `/* KONFIG-ENDE */`:

| Key | Meaning |
|---|---|
| `ort.name`, `ort.lat`, `ort.lon`, `ort.tz` | Place name shown in the weather/air/waste panels, coordinates and IANA time zone for Open-Meteo |
| `dwd.region`, `dwd.teilregion` | DWD pollen forecast area, both IDs from [`s31fg.json`](https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json): `region` = `region_id`, `teilregion` = `partregion_id`. Berlin = `region: 50`, `teilregion: -1` ("Brandenburg und Berlin" has no sub-regions). See below |
| `tanken.station` | Station name shown in the fuel panel |
| `luft.uvOrt` | Label of the UV verdict card in the air panel (e.g. "Balkon"); default "Draußen" |
| `muell.label` | Label of the waste panel (street / area) |
| `muell.quelle`, `muell.quelleLang` | Short and long name of the calendar source (notice box, footer) |
| `muell.schadOrt`, `muell.schadOrtKurz` | Place of the hazardous-waste collection |
| `muell.pdf` | Plan PDF URL pattern with `{year}` (`https://` only), empty = none |
| `hosts` | IP → `{ n: short name, l: long name, i: pi \| pc \| router \| server }` for the host notch |
| `domains.suffix` | Own domain suffix used in service links, empty if links use plain IPs |
| `domains.standard` | IP of the host that serves those domains (reverse proxy) |
| `domains.ausnahmen` | Domain → IP for services that run on another device |

**Finding the DWD IDs.** Open `s31fg.json` and look at the `content` entries: each has `region_id`, `region_name`, `partregion_id` and `partregion_name`. Pick the entry that covers your place, e.g. `{ "region_id": 50, "region_name": "Brandenburg und Berlin", "partregion_id": -1, "partregion_name": "" }` for Berlin. Sub-region IDs (`partregion_id` > 0) are unique in the file, so `teilregion` alone identifies the area. Regions **without** sub-regions all use `partregion_id: -1` (in the current file: region 20 and region 50), so for those you must also set `region` (the `region_id`); otherwise the entry cannot be told apart. Setting both is always safe. Berlin is such a case: `dwd: { region: 50, teilregion: -1 }`.

**Pollen.** The Air tab treats pollen as one category, *grass-family pollen*: the grass-pollen forecast of Open-Meteo/CAMS, plus the DWD index for rye as an extra lane (rye is botanically a grass; DWD publishes it as its own index). It is a deliberately chosen category, not two unrelated species. If the DWD data is unavailable, the lane is shown as "no DWD data" and counts as level 0.

`window.GX_CFG = window.GX_CFG || {…}` – a script that runs earlier may define `GX_CFG` and overrides the block (handy for tests).

If your service links use plain IPs (as in the demo), add each IP to `hosts`; without an entry the notch shows the bare IP.

## 2. `custom.css` – KONFIG block

`--gx-sub1` … `--gx-sub4` are the column titles of the four-column bookmark group (the group with the `mdi-crosshairs-gps` icon, "Gaming" in the demo). The links are assigned by position: links 1–2 → column 1, 3–4 → column 2, 5–6 → column 3, 7–8 → column 4.

## 3. YAML

- `settings.yaml` – title, favicon, theme and the `layout:` section. **The order and the icons of the groups position them** (one row per group in the desktop layout). Keep an icon unique per group; when you change one, change the matching `[style*="/<icon>.svg"]` selector in `custom.css`.
- `services.yaml` – the home-network deck. `siteMonitor` gives the status dot. A service whose name equals or starts another service's name on a different host gets a host tag.
- `bookmarks.yaml` – the web deck. Give every link `icon`, a unique 2-letter `abbr` and a one-word `description` (this also hides the `www.` host line). The "Gaming" group needs exactly 8 links, two per column.
- Category icons for new groups: the title prefix → icon map in the "Kategorie-Icons" block of `custom.js` (`MAP`).

## 4. Sidecars (`.env`)

Set `DEMO=0` and the variables of the sidecar you want to run for real – see [`.env.example`](../.env.example) and the README of each sidecar in `sidecars/`. A sidecar without its required variables keeps running and reports the problem at `/health`.

### AI plan usage panel data

`claude-usage` is a demo data source and has no real mode (a real source is intentionally not included, see [its README](../sidecars/claude-usage/README.md)). The panel reads this JSON from `/claude/usage`:

```json
{"ok": true, "stale": false, "error": null, "fetched_at": "2026-11-14T10:00:00+00:00",
 "session": {"used": 41.3, "resets_at": "2026-11-14T13:00:00+00:00"},
 "week": {"used": 47.9, "resets_at": "2026-11-19T00:00:00+00:00"}}
```

`used` is a percentage (0–100), `resets_at` an ISO-8601 timestamp with offset (5-hour session window, 7-day week window); `stale: true` or an `error` text marks old data. If you want real numbers, serve the same shape from a source you are allowed to use (for example your own API usage via the official Admin/Usage API) and point the `/claude/` location in `gateway/nginx.conf` at it instead of the `claude-usage` container.

## 5. Gateway / host check

`PORT` changes the published port, `HOMEPAGE_ALLOWED_HOSTS` must list the `host:port` you use in the browser.
