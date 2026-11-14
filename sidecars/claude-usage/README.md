# claude-usage (demo)

Demo mode serves synthetic (mock) data.

Demo data source for the AI-usage panel ("KI-Kontingent"). A real data source is intentionally not included. If you want real numbers, feed the same JSON shape from a source you are allowed to use (e.g. your own API usage via the official Admin/Usage API) – see [docs/configuration.md](../../docs/configuration.md).

Python standard library only. The service reads no credentials, mounts no host folder and makes no network calls; it always serves synthetic numbers that move with the clock (a 5-hour session window and a 7-day week window, each starting low and growing, always below the 70 % warning threshold).

- Endpoints (through the gateway: `/claude/…`): `/usage`, `/health`
- Listens on `:8080` inside the compose network. The only setting is `PORT` (default `8080`).

`/usage` has the shape the panel reads:

```json
{
  "ok": true, "stale": false, "error": null, "demo": true,
  "fetched_at": "2026-11-14T10:00:00+00:00", "server_time": "2026-11-14T10:00:00+00:00",
  "session": {"used": 41.3, "resets_at": "2026-11-14T13:00:00+00:00"},
  "week": {"used": 47.9, "resets_at": "2026-11-19T00:00:00+00:00"},
  "week_opus": null, "week_sonnet": null
}
```

`used` is a percentage (0–100), `resets_at` an ISO-8601 timestamp with UTC offset. The warning and critical states of the panel can be previewed with `#cldemo=warn` / `#cldemo=crit`.

## Tests

```
python3 -W error::ResourceWarning -m unittest discover -s tests -v
```
