# Wizards Supper Club

A public, read-only website that turns the Wizards' Google Sheet into a record of every supper club evening: scores, circuit winners, trends, records, and who is still to host this circuit.

The Sheet stays the single source of truth. GitHub Actions fetches two purpose-built public tabs, checks them, works out every statistic and publishes a static site to GitHub Pages. The browser never calls Google, so the site keeps working if the Sheet is unavailable.

## Owner setup (one-off)

### 1. In the Sheet

1. Add a tab **Public_Evenings** with this in A1:
   `=QUERY(Evenings!A:F,"select A,B,C,D,E,F where A is not null",1)`
2. Add a tab **Public_Scores** with this in A1:
   `=QUERY(Log!A:D,"select A,B,C,D where A is not null and C <> 'Note'",1)`
3. Optional: add a tab **Public_Status** with a header row `key`, `value` and rows `baton_holder`, `next_date` (as `YYYY-MM-DD`), `next_restaurant`, filled in by hand.
4. File → Share → Publish to web → choose each public tab separately → **Comma-separated values (.csv)** → Publish. Keep the three links.

Dates in the Date column must display as `YYYY-MM-DD` (Format → Number → Custom date and time). Blank dates are fine.

Never publish the Log, Form Responses or Links tabs. The site only ever needs the public tabs above.

### 2. In the GitHub repo

1. Settings → Secrets and variables → Actions → **Variables** tab → add `EVENINGS_CSV_URL`, `SCORES_CSV_URL` and (optional) `STATUS_CSV_URL` with the links from step 4.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Actions → **Build and deploy** → Run workflow. The site address appears on the finished run and under Settings → Pages.

After that the site rebuilds on every push to `main`, every 6 hours, and whenever you press Run workflow. If the Sheet cannot be fetched or fails a check, the run fails, nothing is published and the previous version stays live. The failed run's log lists every problem with its row number.

GitHub pauses scheduled runs in a repo with no activity for 60 days and emails you first. Pressing Run workflow, or any push, starts them again.

## How to add a wizard

1. Add their rows to the Sheet as usual, using one consistent name in the Wizard and Chooser columns.
2. Edit [config/wizards.json](config/wizards.json) and add an entry:

   ```json
   { "sheetName": "Jonathan", "displayName": "Jonny", "fullName": "Jonathan Hine", "memberFrom": 5, "memberUntil": null }
   ```

   - `sheetName`: the name exactly as it appears in the Sheet.
   - `displayName`: what the site shows.
   - `memberFrom`: their first circuit. `memberUntil`: their last circuit, or `null` while they are a member.
3. Commit to `main`. The site rebuilds.

When someone leaves, set `memberUntil` to their last circuit. They stop being "due" and their attendance is only counted for the circuits they were in.

A name in the Sheet that is not in `wizards.json` (a guest, a typo) fails the build on purpose, so guests never appear on the site.

## How to record an official winner

The site works out each circuit's winner as the chooser of the highest evening average among evenings with 3 or more scores. A circuit stays **provisional** while any of its evenings has a TBC or UNK status, or while a current member has yet to host in it.

To record a result the group has declared, edit [config/overrides.json](config/overrides.json):

```json
{
  "C6": { "winner": "Jeremy", "announced": "2024-08-16" },
  "C7": { "winner": "Thomas", "evening": "C7-06", "announced": "2026-12-01" },
  "C3": { "final": true }
}
```

- `winner`: sheet name or display name. The circuit is shown as Official and is no longer provisional.
- `evening`: only needed when the winner hosted more than one evening in that circuit.
- `announced`: optional date. The home page shows a finished circuit's winner for 60 days after it.
- `final`: marks a circuit as finished and keeps the calculated winner. Use it for old circuits that would otherwise stay provisional because of unknown attendance.

## Privacy

- The fetch script keeps only named columns (Evening ID, Circuit, No. in circuit, Date, Chooser, Restaurant; Evening ID, Wizard, Status, Score) and drops everything else, even if extra columns appear in the CSV.
- The build fails if any kept cell contains `@`, `http` or `docs.google.com`, or is longer than 60 characters (restaurant names: 80).
- After the build, `npm run check:dist` scans the output for email addresses, Google Forms and Sheets links, and the `Review` header, and blocks the deploy on a hit.
- `public/data/` is generated in CI and is not committed.

## Working on it locally

Needs Node 24.

```sh
npm install
npm run data:sample   # made-up data, clearly labelled on the site
npm run dev
```

To use the real Sheet locally, set the three variables in your shell and run `npm run data`. Each can be a link or a path to a saved CSV file.

| Command | What it does |
| --- | --- |
| `npm run data` | Fetch, whitelist, validate and compute from the real Sheet |
| `npm run data:sample` | The same pipeline over made-up data |
| `npm test` | Unit tests for the statistics and the data checks |
| `npm run test:known` | Acceptance check against the known values (below) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run check:dist` | Privacy scan of `dist/` |
| `npm run test:e2e` | Browser smoke test at 360 px, with accessibility checks (run `npx playwright install chromium` once first) |

### Known values

`npm run data && npm run test:known` checks the real data against the figures in the build spec (60 evenings, 324 scores, Ivan Mazemen 8.92, and so on) as the Sheet stood on 18 Nov 2026. It is a one-off acceptance check and not part of the deploy: those figures are a snapshot and will change as missing scores are filled in.

## Layout

```
config/wizards.json         roster, display names, membership periods
config/overrides.json       official winners
scripts/fetch-data.ts       fetch, whitelist, validate, compute
scripts/sample-data.ts      made-up data for local work
scripts/check-dist.mjs      privacy scan of the built site
src/lib/stats.ts            every metric (pure functions)
src/lib/ingest.ts           CSV parsing, privacy guards, data contract
src/lib/*.test.ts           unit tests
src/pages/                  Home, Circuits, Restaurants, Wizards, Trends, Records, Methods
tests/smoke.spec.ts         browser smoke test
public/data/                generated JSON (gitignored; built in CI)
.github/workflows/deploy.yml
```

The Methods page on the site explains each metric in plain words.
