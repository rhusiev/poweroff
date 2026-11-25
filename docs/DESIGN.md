# PowerOff Lviv — design contract

Every screen uses one design language: one grid, spacing scale, type scale,
status system and navigation. The bottom bar never moves. Status is never color
alone. No invented data, no invented end times, no left borders, no duplicated
facts. When the app does not know something, it says so instead of showing
power as on.

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
| `--*-ink`: status text on a status tint | `#11692F` / `#8A5A12` / `#B71F1F` / `#5646B8` / `#5C666D` | same as the base color |

The base status colors fill timelines, pins and swatches. Text on a tinted
status background uses the `-ink` variant. In light mode each ink has a
contrast of at least 4.5:1 on its 14% tint over `--surface` (measured 5.05 to
5.87). Dark mode needs no separate ink.

Theme is `data-theme="light|dark"` on `<html>`; auto follows the system. The
saved theme is applied before the first render, so the page never flashes the
wrong theme. The `theme-color` meta follows `--bg`.

## Grid and type

4px base; scale 4, 8, 12, 16, 20, 24, 32, 48. On phone the content is one
column, full width up to 720px. Desktop layout is below. Screen padding 16,
card padding 16, card gap 12. Radii: card 12, chip/pill/field 8, button 12.
Type: hero 28/700, countdown 34/700 tabular, title 20/700, address 16/600,
body 16/400, secondary 14/400, caption 12/400. Nothing key under 12px; targets
≥44px, primary actions 48px.

## Status language

| State | Word | Icon | Timeline and legend fill |
|---|---|---|---|
| on | Є світло | lightning | quiet green tint |
| planned | Планове | clock | diagonal stripes |
| emergency | Аварійне | warning triangle | horizontal stripes |
| possible | Можливе | question box | dot grid |
| unknown | Немає даних | dashed circle | flat low-contrast tint |

The pill is icon, word and a 14% tint of the status color. The patterns appear
only on timelines and in the legend, which share one set of fill classes.

Severity for overlaps: emergency > planned > possible > unknown > on. Unknown
never hides a known outage. A place is unknown when its data never arrived,
its group is not known, today's schedule is missing, or the operator's last
sync is older than 48 hours.

Groups come from `chergGpv`. «X.Y» shows as «Черга X.Y». Only the official value
«Не входить» shows as «Без черги». The most common value among the building's
accounts wins. An empty or unparseable value, or a tie, means the group is
unknown, and the place is gray.

## Time

All times are Kyiv wall-clock time, whatever the device time zone. The axis is
minutes from 00:00 today and covers today and tomorrow (0–2880). Operator
stamps keep their own UTC offset; a stamp without one is read as Kyiv time. A
GPV window that ends before it starts («23:00–01:00») runs past midnight. The
day changes at Kyiv midnight, and the app reloads the schedule then.

The countdown is real elapsed time, so it stays correct on a DST day. It
counts to the next change of power: on, off or possible. A switch between two
outage kinds is not a change. The label names that change: «До відключення»,
«До повернення», «До можливого відключення» or «До кінця можливого». When the
next state is unknown there is no countdown. When tomorrow's schedule is not
published, the countdown stops at midnight and the timeline draws tomorrow as
unknown.

## Matching a building

An event applies to a place when its building list names the place's building
exactly, after normalization: case, spaces, Latin look-alike letters, dash
kinds and a trailing dot are ignored, and «12-А», «12 а» and «12а» are equal.
«33-1» is one building, not a range; the live data on 2026-11-25 had no ranges.
An event with no building list applies to the whole street. A possible-type
event that does not name the building still shows as possible, with the reason
«будинок не вказано в переліку події».

## Components and navigation

- `PlaceCard`: an `<article>` with name (one line, ellipsis), sub = group +
  address (one line), the next-change line, and a compact horizontal Timeline
  36px with only the four-hour gridlines. One stretched button covers the card
  and opens the detail, so the timeline segments stay their own buttons.
  Pinned places sort first, then emergency, planned, possible, on and unknown.
  No verbose event sentence. A place whose first answer has not arrived shows a
  skeleton card.
- `Map`: OpenStreetMap tiles with a quiet CSS filter; no third-party key.
  Attribution stays readable. Saved places are teardrop pins filled with the
  status color, the user is a concentric dot, and a chosen point is a ring. The
  GPS control is a 44 px icon overlaid on the map. The notice stack sits above
  map panes. Pin tooltips are plain text.
- Add-flow map search follows the grass-maps **prototype** layout, not its
  current app. That includes its fully round search bar and buttons, the one
  exception to the radius scale. On phone a magnifier search bar sits at the
  bottom in thumb reach; on desktop it sits at the top of the 360 px search
  panel. The search runs only when the reader submits it with «Знайти» or Enter,
  with at least 3 characters. Nominatim forbids search-as-you-type. Result rows
  grow toward the bar with the best match nearest it, left-aligned, each with a
  street icon, road plus building and city. No invented distance, status, count
  or chip. Duplicate result rows collapse to one. A chosen place opens a
  separate bottom sheet with a working grab handle, headed «Обрана адреса»,
  holding the official street, building, optional name and a save action pinned
  to the sheet bottom. When the point matches more than one official street, the
  reader picks one from a list of radio buttons. The handle is a real button
  that folds the sheet to a peek and unfolds it again; it exposes
  `aria-expanded` and a Ukrainian name. Close dismisses fully. The hit list
  stays in state and renders only when no place is picked, so closing the sheet
  restores results without another geocode request. Editing the query clears
  the chosen place. A stem that Nominatim cannot resolve is looked up in the
  official street directory, then re-geocoded for real coordinates; no name or
  coordinate is invented. «Нічого не знайдено» sits clear of the search field.
- `Timeline`: 48-hour horizontal strip, full 56px or compact 36px, two day
  blocks, now line, severity stacking. `DayTimeline` shows one 24-hour day in
  detail, groups and compare, full 56px or compact 36px, with a day switch, and
  uses the tall style in all three. Hour labels are every four hours and bold.
  Detail, groups and compare keep fine hourly gridlines with a stronger line at
  every four-hour boundary (24 + 6 on a day strip, 48 + 12 on a 48-hour strip).
  Dashboard cards show only the stronger four-hour lines (12 over 48 hours).
  Past the last known minute the strip shows the unknown tint, never green.
  Each segment is a button that opens a popup with its time and status.
- `Tabs`: one tab component for the day switch, the add-flow modes and the
  theme. Arrow, Home and End keys move between tabs; tabs expose
  `aria-selected`.
- `StatusPill`, `Field`, `Button`, states (empty, skeleton, banner, toast).
- Toast: top placement under the header on phone, bottom-right on desktop,
  `pointer-events:none`, only the 44px «Скасувати» action catches taps,
  auto-dismiss after 6 seconds. A re-render does not restart the timer. It
  never covers a bottom control or shifts any other element. The delete/undo
  toast takes priority: a generic notice renders only when no deletion is
  pending, so add-then-delete always leaves «Скасувати» available.
- Detail countdown: label and `XX г YY хв` value share one styled line in a
  rounded, subtly tinted strip with a divider and tabular figures. Known states
  do not repeat the status word as a second line.
- Fixed bottom bar, 64px + safe area, five equal tabs: Головна · Черги ·
  Порівняння · Мапа · Налаштування. A short bar marks the active tab on phone.
  `html { scrollbar-gutter: stable }` is mandatory. Detail and add are overlay
  screens; the bar stays fixed.

## Desktop layout

- One breakpoint at 768 px. Phone `<=767px` keeps the layout above unchanged.
  Desktop `>=768px` uses a persistent 232 px left sidebar instead of the bottom
  dock, with the same five destinations in the same order. The sidebar is fixed
  full height, stable on every screen and on scroll. The content column is up
  to 1080px wide.
- The desktop column holds the same tokens, type, colors, Ukrainian copy and
  status patterns as the phone. No new palette or invented content.
- Multi-column layout: dashboard cards 320–380 px wide, giving two balanced
  rows at 1280 and 1440; detail 1.5fr/1fr; groups and compare 320px/1fr;
  settings 1fr/1fr. Add-directory keeps a sticky search and a scrollable
  suggestion grid. Add-map puts the map beside a 360 px search column with the
  bar and sheet docked at its bottom. Saved map fills the width and fits bounds
  over all saved pins.
- The notice sits bottom-right inside the content column on desktop, clear of
  the sidebar and cards. On phone it stays at the top as a pure overlay and
  never shifts the layout. Hover affordances live under `@media (hover: hover)`.

## Build contract

- Add place: громада → місто → вулиця (search) → будинок → optional name.
  The steps are an ordered list. When the directory fails to load, a banner
  says «Не вдалося завантажити довідник» with a retry. On save, open the new
  address detail immediately. No confirm card and no «Відкрити» step. The
  mutation must update React state immediately. Both the directory and the map
  flow follow this rule.
- Delete → toast → undo restores the visible card at its original index. Undo
  also restores the compare selection. The delete toast wins over any notice
  already on screen; a new deletion clears the old notice.
- Compare: user intent only; nothing is preselected and the selection never
  resets on its own; 2–4 places. Below two the hint says «Оберіть 2–4 адреси»;
  at four it says «Обрано максимум: 4 адреси», and a fifth pick shows a
  notice. Rows show name + group + strip, no repeated pills.
- Groups: use the «Сьогодні» / «Завтра» tabs and a one-day timeline, not one
  long 48-hour stripe. A stale sync makes every group unknown.
- Settings: theme light/dark/auto as a three-tab bar with a sun, monitor and
  moon icon centered above each label and a 2px underline on the active tab. A
  fresh profile starts on «Системна». Data source and third-party map
  disclosure.
- Offline: the last good answer for each place is kept on the device, so a
  cold start without a network still shows the saved places with their last
  sync time. «Офлайн» replaces the sync time in the header. Retry refetches
  without a reload, and the app refetches on reconnect. A place still loading
  says «Оновлюємо дані…». A failed fetch says «Не вдалося отримати дані». A
  published schedule dated to another day says «Графік на цю добу ще не
  опубліковано».
- Saved places survive stored-shape changes: every record is kept and missing
  fields are backfilled instead of dropped. Places saved by the older build
  under `saved_addresses` are read when `po:places` is absent and left in
  place. An unreadable value is copied to `po:places-unreadable` before it can
  be overwritten.
- All data comes from the API. Prototype hash schedules and fake groups are
  never shipped.

## Verified acceptance

Checked in headless Chromium on 2026-11-25 against the live operator data.

- Four places fit above the nav at 390×844 (fourth card bottom 778 < bar 780)
- Navigation geometry identical on every screen: mobile bottom dock 390×64 at
  y=780 with 78px tabs; desktop fixed left sidebar 232px full height with five
  48px rows and no left border on the active row
- Add via directory and map, delete, undo, rename, pin, group picker, compare,
  map pins, theme, reload all exercised with real clicks in the app
- Typing in the map search sends no geocode request; a submit sends one
- An offline reload shows the last data and its sync time
- Not checked: real phones, Safari, Firefox, widths 768–1279 px
