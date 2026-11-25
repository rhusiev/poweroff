# PowerOff Lviv — final design

The owner rejected two earlier directions. The approved design came from a fresh
isolated pair that built an interactive prototype and drove it in a browser at
390×844 and 1280×800 before handing it over. Verdict and handoff:
`/tmp/opencode/poweroff/design/fresh/final-review.md`. The prototype is
`/tmp/opencode/poweroff/design/fresh/index.html`; design contract
`design/fresh/design.md`. Reproduce the prototype geometry exactly.

Every screen uses one design language: one grid, spacing scale, type scale,
status system and navigation. The bottom bar never moves. Status is always
icon + word + color + pattern, never color alone. No invented data, no invented
end times, no left borders, no duplicated facts.

## Tokens

| Role | Light | Dark |
|---|---|---|
| `--bg` | `#F6F7F8` | `#101315` |
| `--surface` | `#FFFFFF` | `#1A1E21` |
| `--surface2` | `#EDEFF1` | `#232A2E` |
| `--text` | `#171B1E` | `#F0F2F3` |
| `--text2` | `#565E64` | `#A6AFB5` |
| `--border` | `#D9DEE2` | `#333B40` |
| `--primary` | `#0B6E4F` | `#3DDC9E` |
| `--danger` | `#C62828` | `#FF7A7A` |
| on / planned / emergency / possible / unknown | `#15803D` / `#B7791F` / `#C62828` / `#6A5ACD` / `#7A858D` | `#4ADE80` / `#F2C14E` / `#FF7A7A` / `#B3A8F5` / `#9AA5AD` |

Theme is `data-theme="light|dark"` on `<html>`; auto follows the system.

## Grid and type

4px base; scale 4, 8, 12, 16, 20, 24, 32, 48. One column, full width on phone,
max 720px centered on desktop. Screen padding 16, card padding 16, card gap 12.
Radii: card 12, chip/pill/field 8, button 12. Type: hero 28/700, countdown
34/700 tabular, title 20/700, address 16/600, body 16/400, secondary 14/400,
caption 12/400. Nothing key under 12px; targets ≥44px, primary actions 48px.

## Status language

| State | Word | Icon | Pattern |
|---|---|---|---|
| on | Є світло | lightning | solid base |
| planned | Планове | clock | diagonal stripes |
| emergency | Аварійне | warning triangle | horizontal stripes |
| possible | Можливе | question box | dot grid |
| unknown | Немає даних | dashed circle | dashed vertical fill |

Severity for overlaps: emergency > planned > possible > on. Unknown only when
data is missing or older than 48 hours. Group values come from `chergGpv`:
`1.1`–`6.2` shows as «Черга X», `Не входить` as «Без черги» on cards.

## Components and navigation

- `PlaceCard`: name (one line, ellipsis), sub = group + address (one line),
  compact horizontal Timeline 36px with only the four-hour gridlines.
  Whole card opens detail. Pinned places sort first. No verbose event sentence.
- `Map`: OpenStreetMap tiles with a quiet CSS filter; no third-party key.
  Saved places are teardrop pins filled with the status color,
  the user is a concentric dot, and a chosen point is a ring. The GPS control
  is a 44 px icon overlaid on the map. The notice stack sits above map panes.
- Add-flow map search follows the grass-maps **prototype** layout, not its
  current app. On phone a magnifier search bar sits at the bottom in thumb
  reach; on desktop it sits at the top of the 360 px search panel. Result rows
  grow toward the bar with the best match nearest it, left-aligned, each with a
  street icon, road plus building and city. No invented distance,
  status, count or chip. Duplicate result rows collapse to one. A chosen place opens a separate bottom sheet with a
  working grab handle, headed «Обрана адреса», holding the official street,
  building, optional name and a save action pinned to the sheet bottom. The
  handle is a real button that folds the sheet to a peek and unfolds it again;
  it exposes `aria-expanded` and a Ukrainian name. Close dismisses fully. The
  hit list stays in state and renders only when no place is picked, so closing
  the sheet restores results instantly without another geocode request. Editing
  the query clears the chosen place. A stem that Nominatim cannot resolve is
  looked up in the official street directory, then re-geocoded for real
  coordinates; no name or coordinate is invented. «Нічого не знайдено» sits
  clear of the search field.
- `Timeline`: 48-hour horizontal strip, full 56px or compact 36px, two day
  blocks, now line, severity stacking. `DayTimeline` shows one 24-hour day in
  detail, groups and compare, full 56px or compact 36px, with a day switch, and
  uses the tall style in all three. Hour labels are every four hours and bold.
  Detail, groups and compare keep fine hourly gridlines with a stronger line at
  every four-hour boundary (24 + 6 on a day strip, 48 + 12 on a 48-hour strip).
  Dashboard cards show only the stronger four-hour lines (12 over 48 hours).
  The unknown state is a flat low-contrast tint, not a stripe pattern.
- `StatusPill`, `Field`, `Button`, states (empty, skeleton, banner, toast).
- Toast: top placement under the header on phone, bottom-right on desktop,
  `pointer-events:none`, only the 44px «Скасувати» action catches taps,
  auto-dismiss after 6 seconds. It never covers a bottom control or shifts any
  other element. The delete/undo toast takes priority: a generic notice renders
  only when no deletion is pending, so add-then-delete always leaves
  «Скасувати» available.
- Detail countdown: label and `XX г YY хв` value share one styled line in a
  rounded, subtly tinted strip with a divider and tabular figures. Known states
  do not repeat the status word as a second line.
- Fixed bottom bar, 64px + safe area, five equal tabs: Головна · Черги ·
  Порівняння · Мапа · Налаштування. `html { scrollbar-gutter: stable }`
  is mandatory. Detail and add are overlay screens; the bar stays fixed.

## Desktop layout

- One breakpoint at 768 px. Phone `<=767px` keeps the layout above unchanged.
  Desktop `>=768px` uses a persistent 232 px left sidebar instead of the bottom
  dock, with the same five destinations in the same order. The sidebar is fixed
  full height, stable on every screen and on scroll.
- The desktop column holds the same tokens, type, colors, Ukrainian copy and
  status patterns as the phone. No new palette or invented content.
- Multi-column layout: dashboard cards capped at 380 px, giving two balanced
  rows at 1280 and 1440; detail 1.5fr/1fr; groups and compare 320px/1fr;
  settings 1fr/1fr. Add-directory keeps a sticky search and a scrollable
  suggestion grid. Add-map puts the map beside a 360 px search column with the
  bar and sheet docked at its bottom. Saved map fills the width and fits bounds
  over all saved pins.
- The notice sits bottom-right inside the content column on desktop, clear of
  the sidebar and cards. On phone it stays at the top as a pure overlay and
  never shifts the layout. Hover affordances live under `@media (hover: hover)`.
- The full contract and review history are under
  `/tmp/opencode/poweroff/desktop/`.

## Build contract

- Add place: громада → місто → вулиця (search) → будинок → optional name.
  On save, open the new address detail immediately. No confirm card and no
  «Відкрити» step. The mutation must update React state immediately; the old
  bug was a storage write with no re-render. Both the directory and the map
  flow follow this rule.
- Delete → toast → undo restores the visible card at its original index. Undo
  also restores the compare selection. The delete toast wins over any notice
  already on screen; a new deletion clears the old notice.
- Compare: user intent only; never auto-reset selection; 2–4 places; hint below
  two and a cap notice at four; rows show name + group + strip, no repeated
  pills.
- Groups: use the «Сьогодні» / «Завтра» tabs and a one-day timeline, not one
  long 48-hour stripe.
- Settings: theme light/dark/auto as a three-tab bar with a sun, monitor and
  moon icon centred above each label and a 2px underline on the active tab;
  tabs expose `aria-selected`. A fresh profile starts on «Системна». Data
  source and third-party map disclosure.
- Offline: saved places with last sync; retry refetches place data without a
  reload. A failed fetch says «Не вдалося отримати дані». A published schedule
  dated to another day says «Графік на цю добу ще не опубліковано». Never claim
  «Без черги» when the group's official value never arrived; show that label
  only for the official «Не входить» value.
- Saved places survive stored-shape changes: every record with an `id` is kept
  and missing fields are backfilled instead of dropped.
- All data comes from the API. Prototype hash schedules and fake groups are
  never shipped. Stale sync (>48h) shows «Немає даних» everywhere.

## Verified acceptance

- Four places fit above the nav at 390×844 (fourth card bottom 726.3 < bar 780)
- Navigation geometry identical on every screen: mobile bottom dock 390×64 at
  y=780 with 78px tabs; desktop fixed left sidebar 232px full height with five
  48px rows and no left border on the active row
- Add via directory and map, delete, undo, rename, pin, group picker, compare,
  map pins, theme, reload all exercised with real clicks in the app
## What we learned in this session — 2026-11-21

### Design process

The owner rejected two complete design directions before accepting one. The
breakthrough was not a visual idea but a workflow change:

- Isolate the design agents from the existing app and from earlier designs.
- Build an **interactive** prototype, not static mockups.
- Both the designer and an independent critic **used the prototype in a
  browser** at 390×844 and 1280×800 with real clicks, and measured DOM
  geometry. Subjective complaints became measured defects: a 7.5px nav shift,
  undo that restored storage but not the screen, a toast that covered the add
  button, four cards overflowing by 38px.
- Fix in short, measured rounds. A designer's own "pass" is a lead; an
  independent critic who checks the visible result is the authority.

Keep design critiques verbatim with dates. The full record is
`/home/rad1an/dotfiles/local/share/ai-sessions/poweroff/review-notes.md` and
the design rounds are under `/tmp/opencode/poweroff/design/`.

### Product decisions from the owner's phone review

- Source line belongs in settings only, not on every screen.
- Legend swatches must use the same colors and patterns as the plot.
- Timeline needs vertical hour markings.
- Adding a place must be visible, not hidden behind a dock icon.
- A settings control must look like settings.
- Freshness comes from the operator's sync time; do not offer a manual refresh
  that leaves that time unchanged.
- Drop account-number check.
- A map is wanted: choose a building by search or by tapping, focus on GPS,
  and show saved places in status colors.
- A card must not change appearance when a tap does nothing.
- Short timelines need visible hour ticks and day breaks instead of explanatory
  sentences.
- The map and add-place flows are separate: the map tab only observes saved
  addresses; adding a place is a dedicated flow with search, map tap and GPS.
- Third-party map disclosures live in settings, not on every map screen.
- Never use a basemap that requires an API key unless the owner supplied one.
  CARTO raster tiles started showing an «API key required» watermark; OSM
  tiles with a CSS filter keep the quiet look without a key.

### Technical findings

- `crypto.randomUUID()` is undefined on a plain-HTTP origin such as
  `http://10.8.0.2:5201`; use a fallback id.
- Geolocation is a secure-context API. On the plain-HTTP VPN review URL it
  fails without a browser prompt; the message must say HTTPS is required.
- The official API's street names are peculiar: exact string matching against
  third-party geocoder road names fails. Normalize and fuzzy-match, then
  confirm against `pw_streets` filtered by `city.id` and `name`.
- Nominatim reverse geocoding returns a long `display_name` plus structured
  `address` fields; use `road`, `house_number` and `city`, never the long
  string, for form values.
- `scrollbar-gutter: stable` is required to stop the desktop column shifting
  when a scrollbar appears.
- Leaflet is the standard map library; OSM tiles and Nominatim are third
  parties and must be disclosed next to the control that uses them.
- Bound geocoder queries to Lviv Oblast and filter results by their `state`;
  a coarse bounding box still returns shops in neighbouring oblasts.
- Cache a stable notice callback. A new callback each render re-runs the search
  effect and loops zero-result queries against the geocoder.
- Let data-source methods throw. Swallowing errors and returning `null` makes
  the offline failure state unreachable.

## Final verification

The implemented app passed two independent interactive reviews in Chromium at
390×844 and 1280×800, in both themes, with real clicks and DOM measurements:

- Muse Ember, three rounds, `APPROVE` —
  `/tmp/opencode/poweroff/muse-review/report3.md`
- MiMo v2.6 Pro, four rounds, `APPROVE` —
  `/tmp/opencode/poweroff/mimo-final/report4.md`

The fresh MiMo run found and the app now passes: status language and patterns,
midnight and date-mismatch states, offline copy and retry, place preservation,
queue honesty, hourly gridlines, add via directory and map, compare cap and
undo, notice priority, pass-through taps and swipe, 44px targets, 12px text
floor, fixed nav geometry, quiet OSM tiles, and no console errors.

Build and lint pass. The working tree is uncommitted and not deployed remotely;
local HTTP 5201 and HTTPS 5443 serve the current build. When deployment is
authorized, bump `CACHE_NAME` in `public/sw.js` so clients fetch the new
hashed assets.
