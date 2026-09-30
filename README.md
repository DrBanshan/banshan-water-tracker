# Banshan Water Tracker

Log your water in cups, watch a bottle fill up as you drink, and keep the whole history in
plain markdown inside your vault.

- **A bottle that actually fills.** It starts empty, and every entry raises the water by
  exactly the amount you logged. The surface animates, so it reads well on a phone.
- **Your data is text.** One markdown file per month, one table per day. No database, no
  binary blob, no plugin-owned format. Delete the plugin and your history is still readable.
- **Four bottles to choose from**, drawn from shared geometry so the rising water behaves the
  same in all of them.
- **Two tabs in one sidebar view.** Drink for logging, Analysis for looking back.
- **Desktop and iOS.** Same code path on both, no runtime dependencies.

## Where your data lives

Everything goes into `<data folder>/YYYY-MM.md`, one section per day:

```markdown
## 2026-09-29

| Time  | Amount |
| ----- | ------ |
| 09:05 | 250 |
| 13:40 | 150 |
```

Those table rows are the source of truth. Totals, streaks and charts are all recomputed when
the file is read, so a number can never drift out of sync with the entries beneath it. Edits
go through `vault.process`, which reads and rewrites the file as one operation; that is what
lets a desktop and a phone add to the same month without erasing each other's rows.

The time is the local wall clock at the moment you tapped, and amounts are always stored in
millilitres. Switching the displayed unit changes what you see, not what is on disk.

## Install

**Desktop.** Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/banshan-water-tracker/`, then enable it under
*Settings → Community plugins*. (Once it is in the community directory you can install it
from inside Obsidian instead.)

**iOS.** The same three files have to reach the vault, so put the vault somewhere your phone
can see it — Obsidian Sync is the least friction — then enable the plugin on the mobile app.
Nothing in this plugin is desktop-only.

## Using it

Click the droplet in the ribbon, or run **Water tracker: Open view** from the palette.

- **Drink.** The bottle shows today against your goal. Tap it to add one cup, or use the
  quick buttons for other sizes. There is an undo for the last cup of today.
- **Analysis.** Streak, how often you hit the goal, your daily average, best day, the weekday
  pattern, a month-by-month heatmap, and which cup sizes you actually reach for.

Palette commands:

| Command | What it does |
| --- | --- |
| `Water tracker: Open view` | Opens the sidebar view |
| `Water tracker: Add a cup` | Adds one cup of the configured tap size |
| `Water tracker: Undo the last cup of today` | Removes today's most recent entry |

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Data folder | `Water Tracker` | One `YYYY-MM.md` file per month inside it |
| Daily goal | `2000 ml` | Drives the bottle, the graduations and the analysis |
| One tap of the bottle | `250 ml` | What a tap on the bottle adds |
| Quick buttons | `150, 250, 500` | Up to four |
| Bottle | Slim | The four drawings below |
| Unit shown | `ml` | Display only; the file keeps millilitres |

The graduations printed on the glass follow your goal rather than being fixed marks: for a
2000 ml goal they read 500 / 1000 / 1500, for 2500 they read 600 / 1200 / 1800, and each line
sits at the height its own volume actually reaches. Change the goal and the bottle redraws.

## The bottles

`Slim glass bottle` · `Round flask` (a straight-mouthed bottle with a swing-top clasp) ·
`Sport bottle` · `Flat glass`

To see them without opening Obsidian. The argument is the style id — `slim`, `round`,
`sport`, `tumbler`:

```bash
npm run silhouette              # all four, half full
npm run silhouette -- round 1   # one of them, full
npm run silhouette -- tumbler   # the flat glass, half full
```

## Development

```bash
npm install
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # bundle, then copy into your dev vault and enable it there
npm run dev        # the same, watching
```

`npm run build` deploys into the vault named by `TEST_VAULT` at the top of `build.js`, and
switches the plugin on in that vault's `community-plugins.json`. Point it at a scratch vault
before you build the first time.

The bundle is built with esbuild and imports nothing at runtime beyond `obsidian`: `moment`,
`debounce`, `Notice`, `Setting` and friends all come from the host.

## Worth knowing

- **No reminders.** Obsidian's plugin API has no notification surface that also works on iOS,
  so this plugin deliberately does not promise one.
- **Today means your local day.** The date and time come from the device clock, not UTC.
- **Analysis reads a 90-day window**, so a streak longer than a chart's worth is not cut short.
- **Files are shared between devices**, so the vault's own sync (Obsidian Sync, iCloud,
  …) is what carries your history between them.

## License

Apache License 2.0. See [LICENSE](LICENSE).
