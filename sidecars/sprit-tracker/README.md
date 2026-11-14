# sprit-tracker

Demo mode serves synthetic (mock) data.

Collects the fuel prices of one station every 5 minutes (Tankerkönig / MTS-K, CC BY 4.0) into SQLite and serves them as JSON for the **fuel** tab of the dashboard. Python standard library only. The first poll after a start is delayed once by a random 7–53 s so that requests do not fall on round clock times (Tankerkönig recommendation); the interval stays at least 300 s.

- Endpoints (through the gateway: `/sprit/…`): `/health`, `/current`, `/history?days=14`, `/stats?days=14&fuel=e5`
- Listens on `:8080` inside the compose network; data in the `sprit-data` volume (`/data`).

| Variable | Default | Meaning |
|---|---|---|
| `DEMO` | `0` (compose: `1`) | `1` = 14 days of synthetic prices, no key, no network. Uses its own database file (`prices-demo.db`) |
| `TK_APIKEY` | – | Tankerkönig API key |
| `STATION_ID` | – | Tankerkönig station UUID |
| `STATION_NAME` | `Tankstelle` | Display name |
| `PORT` | `8080` | HTTP port (standalone use; the compose stack keeps `8080` behind the gateway) |
| `POLL_SECONDS` | `300` | Poll interval (minimum 300) |
| `DB_FILE` | `/data/prices.db` | SQLite path |

The variables above apply to the service itself. `.env.example` in this folder is the standalone example (service variables incl. `PORT`); the compose stack reads the `.env` in the repository root (copied from `.env.example`) and passes in only `DEMO`, `TK_APIKEY`, `STATION_ID`, `STATION_NAME` and `TZ`.

Without key/station (and without `DEMO`) the service keeps running and `/health` reports `{"ok": false, "error": …}`.

## Tests

```
python3 -W error::ResourceWarning -m unittest discover -s tests -t . -v
```
