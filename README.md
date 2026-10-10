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

**Version.** Obsidian 1.13.7 or newer is required. That is what `minAppVersion` in
`manifest.json` promises, and `npm run app-version` checks the promise against the code by
reading the version tags in the installed typings: an API newer than the floor is not merely
an error at build time, it is `undefined` on the installs the floor lets through. The store
reads the same field, so someone on an older app is not offered the plugin at all rather than
handed one that breaks on them.

## Using it

Click the droplet in the ribbon, or run **Water tracker: Open view** from the palette.

- **Drink.** The bottle shows the day you are editing against your goal, which is today unless you
  have moved. Tap it to add one cup, or use the quick buttons for other sizes. There is an undo for
  the last cup of that day.
- **Analysis.** Streak, how often you hit the goal, your daily average, best day, the weekday
  pattern, a month-by-month heatmap, and which cup sizes you actually reach for.

### Filling in a day you forgot

The row at the bottom of the Drink tab moves the day you are editing: the chevrons step one day back
or forward, and touching a weekday in **Last 7 days** jumps straight to that day. The weekday goes
bold moves to the day you are editing, and the 30-day strip marks that day in a row of its own
beneath the bars, where it cannot crowd them, which is what tells you the bottle above is showing that
day rather than today. Arriving back on today clears both.

- A cup logged into a day that has already gone by is stamped `23:59` of that day, the last minute of
  it a forgotten drink can honestly belong to. Logging into today keeps the real clock time.
- Forward stops at today, because a cup claimed for a day that has not arrived is not a record.
- The 30-day strip moves to keep the day you are editing on screen. Once that day is out of the
  trailing range the strip runs forward from it instead of ending on it, so the day you are filling in
  and its marker are both in the first cell where you can see them, and the heading reads `Days from
  2026-08-20` rather than claiming to be the last 30. The 7-day strip stays where it is, so the bold
  weekday only shows while that day is inside it.
- The palette commands carry on working on today whichever day you have selected, which is what their
  names promise.

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

## Releasing

The version lives in `manifest.json` and nowhere else, because that is the file Obsidian reads
to decide an update exists, and because the store hands out files from the GitHub release whose
**tag equals that version**. The two have to agree, and only `x.y.z` is understood: no leading
`v`, no `-rc.1`, no `+build.7`. `package.json` is made to agree with the manifest rather than
being edited along side it:

```bash
npm run version-bump            # manifest.json is the source of truth, package.json follows
git tag -a 0.1.0 -m "0.1.0"    # the tag is the version itself, nothing else
git push origin 0.1.0
```

Pushing a tag runs `.github/workflows/release.yml`. It installs, typechecks, tests, builds, then
stops unless the tag and `manifest.json` name the same version; then it signs the build with a
provenance attestation and opens a **draft** release carrying `main.js`, `manifest.json` and
`styles.css`. You read the assets, write the notes, and press Publish. Draft on purpose: a draft
release that turns out wrong is yours to delete, while a published one has already told every
installed copy of this plugin that there is an update.

Every tag starts a run, including a mistyped one, and a mistyped one goes red rather than being
filtered out in silence - a tag that quietly matched nothing would leave you looking at a tag
with no release behind it and no clue where the release went.

Before you spend a tag, the gates in that workflow can be run here:

```bash
npm run release-dry-run
```

It takes its steps out of the workflow file rather than from a second list of them that could fall
out of step, and runs the ones that belong to this machine under the environment Actions hands a
workflow, so the tag expression is exercised the way CI writes it and not merely the script behind
it. Two kinds of step are left alone: the ones that belong to a runner (`checkout`, `setup-node`,
the attestation), and the one that publishes - that step is recognised by what its script says rather
than by what it is named, so renaming it does not make it runnable, because a rehearsal that could
publish is not a rehearsal. `npm ci` is skipped unless you pass `--install`, since it wipes
`node_modules` and wants the network. It runs against your working tree rather than a clean
checkout, so it is proof that the commands and their order are right, not a replacement for the run.

The first time, one setting outside the file is needed: in the repository, **Settings → Actions →
General → Workflow permissions → Read and write permissions**. Without it the attestation step is
refused, with an error that says nothing about what it wanted.

The same build by hand:

```bash
npm run release    # writes main.js and styles.css at the repository root, both git-ignored
npm run audit      # the manifest check on its own
npm run app-version # the declared floor against the APIs the code really calls
```

They sit at the root because that is where the workflow uploads and signs them from, which keeps
the names in the release exactly the three names the store downloads.

In release mode the manifest audit is fatal rather than advisory: a missing field, a version that
drifted from `package.json`, an `id` containing `obsidian`, a missing `README.md` or `LICENSE`, or
an `isDesktopOnly: true` that contradicts this plugin's iOS support all stop the build. Each of
those costs a user a broken install or a reviewer a rejected submission rather than a red build.
Day to day `npm run build` keeps the same checks as warnings, except an `id` mismatch with the
folder Obsidian loads, which is fatal there too: that one makes Obsidian run a stale copy of the
plugin and say nothing at all.

One more thing the store does that surprises people: the community directory reads
`manifest.json` at the HEAD of your default branch, so the committed file is part of a release,
not just the tag.

`npm run app-version` checks the other half of the version story. It asks the TypeScript compiler
which Obsidian APIs the code actually reaches, reads the `@since` tag above each one out of the
installed typings, and fails if any of them arrived after the declared floor. That is not a
linting nicety: a method the app does not have yet is `undefined` at runtime, so calling one is a
crash on an older install rather than an error at build time. The release build runs it, so the
workflow needs no step of its own, and in development it warns instead of blocking, because a stale
floor does not stop you working on the artwork.

## Worth knowing

- **No reminders.** Obsidian's plugin API has no notification surface that also works on iOS,
  so this plugin deliberately does not promise one.
- **Today means your local day.** The date and time come from the device clock, not UTC.
- **Analysis reads a 90-day window**, so a streak longer than a chart's worth is not cut short.
- **Files are shared between devices**, so the vault's own sync (Obsidian Sync, iCloud,
  …) is what carries your history between them.

## License

Apache License 2.0. See [LICENSE](LICENSE).
