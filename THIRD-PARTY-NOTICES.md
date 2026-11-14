# Third-party notices

## Bundled third-party material

### Lucide (ISC License)

Some inline UI icons in homepage/config/custom.js are derived from Lucide icons.
Source: <https://github.com/lucide-icons/lucide> – the license text below is reproduced unchanged from
<https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE>.

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

## Referenced only (not included in this repository)

These sources are loaded by name or URL at runtime, or run as separate software; none of their files or code is part of this repository.

| Source | How it is used | Licence / terms |
|---|---|---|
| [Homepage](https://github.com/gethomepage/homepage) (gethomepage) | the dashboard itself, run as its own container image (`ghcr.io/gethomepage/homepage`); only `custom.css`, `custom.js` and the YAML configuration are added | GPL-3.0 – its code is not included here. Do not redistribute a built image without complying with GPL-3.0. |
| [Material Design Icons](https://pictogrammers.com/library/mdi/) (`mdi-…`), [Simple Icons](https://simpleicons.org) (`si-…`), [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) | service and bookmark icons, loaded by name from a CDN | Apache 2.0 (MDI, dashboard-icons), CC0 (Simple Icons); brand names and logos belong to their owners |
| [Open-Meteo](https://open-meteo.com/en/license) | weather forecast and air-quality data, fetched by the browser | CC BY 4.0 – attribution link shown next to the data. Free API: non-commercial use only (fewer than 10,000 calls per day, [terms](https://open-meteo.com/en/terms)) |
| [CAMS](https://atmosphere.copernicus.eu) / Copernicus Atmosphere Monitoring Service | air-quality and pollen model data, delivered through the Open-Meteo air-quality API | Copernicus licence; attribution through Open-Meteo |
| [Deutscher Wetterdienst](https://www.dwd.de) (DWD) | pollen index (`s31fg.json`) | CC BY 4.0, source note "Quelle: Deutscher Wetterdienst" – [legal notes](https://www.dwd.de/DE/service/rechtliche_hinweise/rechtliche_hinweise_node.html) |
| [Tankerkönig](https://creativecommons.tankerkoenig.de) (MTS-K data) | fuel prices in real operation of `sprit-tracker` (demo mode shows synthetic prices) | CC BY 4.0 – "Tankerkönig / MTS-K"; own API key, poll no more often than every 5 minutes, do not redistribute the data or expose `/sprit/` publicly ([terms](https://onboarding.tankerkoenig.de/geschaeftsbedingungen)); the demo shows synthetic prices and labels them as such |
| Waste calendar (`ICS_URL`, `NOTICE_URL`) | iCal feed and optional notice page of your waste authority in real operation of `muell-tracker` (demo mode uses made-up dates) | Respect your provider's terms when using `ICS_URL` / `NOTICE_URL` |
