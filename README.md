# PowerOff Lviv

A web app (PWA) that shows power outages for saved addresses in the Lviv region.
It reads the official data of the regional operator LOE and draws today and
tomorrow on one timeline per address. The design contract is in
[`docs/DESIGN.md`](docs/DESIGN.md).

## Run

Node 20 or later.

```sh
npm install
npm run dev      # Vite dev server with the API proxy and /gpv
npm test         # unit tests (Vitest)
npm run lint
npm run build    # type check and production build into dist/
node server.js   # serve dist/ with the API proxy and /gpv
```

`server.js` reads these environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `TLS_KEY`, `TLS_CERT` | unset | Paths to a key and certificate. When both are set, the server speaks HTTPS, for local review builds on other devices. Production runs behind Caddy and leaves them unset |

## Deploy

`Dockerfile` builds the app and runs `node server.js` on port 3000.
`docker-compose.yml` pulls `ghcr.io/rhusiev/poweroff:${VERSION:-latest}` and
joins the external `caddy` network.

Bump `CACHE_NAME` in `public/sw.js` with every release. The new name makes the
service worker delete the old cache, including the hashed `/assets/` files of
earlier builds, which otherwise pile up.

## Data sources

The app has no backend of its own. Both sources are official LOE data.

- `/api-proxy/*` forwards to `https://power-api.loe.lviv.ua/api`: the address
  directory (`/pw_otgs`, `/pw_cities`, `/pw_streets`), current and planned
  events for a street (`/pw_accidents`, `/pw_accident_planeds`), the schedule
  group of each account in a building (`/pw_accounts`), and the time of the
  operator's last sync (`/options`, key `successful_last_synk`)
- `/gpv` is the hourly outage schedule (GPV). `server/gpv.js` parses it from
  the HTML that LOE publishes at
  `https://api.loe.lviv.ua/api/menus?page=1&type=photo-grafic` and caches it
  for 5 minutes. When a refresh fails, it serves the last good copy with
  `stale: true`, which the app does not show as current. When no schedule was
  ever parsed, `/gpv` answers 503

Behavior of the LOE data that the code depends on, as seen on 2026-11-25:

- Timestamps carry a UTC offset such as `+02:00`. A timestamp without one is
  read as Kyiv time
- A group line «Електроенергія є.» means the group has no outage windows that
  day. The "tomorrow" item can be published empty
- `chergGpv` is `X.Y` or `Не входить`. Accounts in one building can disagree.
  The app takes the most common value and treats a tie as an unknown group
- Building lists are comma-separated names such as `33-1` or `109-А`. A hyphen
  between two numbers is part of a building name, not a range
- The meaning of the event codes `typeOff` and `switchSubReason` is not
  documented. `accidentStatus` in `src/lib/status.ts` holds the mapping in use,
  and an unknown code shows as «Немає даних»
- `/pw_accounts` answers 429 to bursts of requests. The app refetches each
  place every 5 minutes

Every request to LOE, `/gpv` and Nominatim gives up after 15 seconds and counts
as failed, so one hung request cannot hold back later polls and retries.

Map tiles come from OpenStreetMap, and address search uses Nominatim. The app
sends at most one Nominatim request per 1.1 seconds and searches only on
submit, as the Nominatim usage policy requires.

## License

See [`LICENSE.md`](LICENSE.md).
