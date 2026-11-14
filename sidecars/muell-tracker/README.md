# muell-tracker

Demo mode serves synthetic (mock) data.

Fetches a waste-collection calendar (iCal) and serves the upcoming pick-ups for the **waste** tab of the dashboard. Python standard library only.

- Endpoints (through the gateway: `/muell/…`): `/health`, `/termine`
- Listens on `:8080` inside the compose network (`PORT` overrides); last good state cached in `/data/termine.json` (`muell-data` volume).
- `DEMO=1` invents a plausible calendar (rest, bio, paper, yellow bag, hazardous waste) without any network access.
- Not tied to one region: the calendar source is configured by environment (below).

| Variable | Default | Meaning |
|---|---|---|
| `DEMO` | `0` (compose: `1`) | made-up appointments, no network |
| `ICS_URL` | – | iCal URL, `{year}` is replaced by the year (required without `DEMO`) |
| `ICS_FORM` | – | URL-encoded form body with `{year}` → POST instead of GET |
| `KIND_MAP` | – | `prefix=kind\|prefix=kind`; kinds `rest`, `bio`, `papier`, `gelb`. Empty = keyword detection |
| `KINDS` | `rest,bio,papier,gelb` | kinds to keep |
| `NOTICE_URL`, `NOTICE_HEAD` | – | scrape a notice box from a web page (set both) |
| `LABEL` | – | label in the panel |
| `SCHAD_ANCHOR` | – | first hazardous-waste date per plan year, comma-separated; repeated every `SCHAD_DAYS` (14) days |
| `SCHAD_ZEIT`, `SCHAD_PDF`, `SCHAD_CHECK_FROM` | `9–12 Uhr`, –, `12-01` | time label, plan-PDF URL pattern with `{year}`, date from which next year's plan is looked for |
| `POLL_SECONDS` | `21600` | poll interval (minimum 3600) |
| `PORT`, `CACHE_FILE`, `TZ` | `8080`, `/data/termine.json`, `Europe/Berlin` | standalone use only; in the compose stack `PORT`/`CACHE_FILE` keep their defaults, `TZ` comes from `.env` |

Without `ICS_URL` (and without `DEMO`) the service keeps running and reports the problem in `/health`.

## Tests

```
python3 -W error::ResourceWarning -m unittest discover -s tests -v
```
