# Handoff notes

Status: first deploy to https://bt.plantalog.com (GitHub Pages from `main`, root). Sign-in uses the Plantalog Supabase project; data lives in table `bt_data` (one row per user, row-level security, see `supabase/schema.sql`).

## How it's built
- `index.html` loads React 18, Babel standalone and supabase-js from CDNs, then `engine.js` and `bt.jsx`. No build step.
- `engine.js`: pure time and money math (stopwatch seconds, h:mm formats, the Worked field parser, revenue per hour). Tests: `test/engine.test.js`, run in the browser at `/test/index.html` with `python3 dev.py` running (Node isn't installed on this Mac).
- `bt.jsx`: all UI and storage. New data fields need defaults in `migrate()`.
- `styles.css`: tokens on `:root`; base copied from GDBB, Business Time rules appended below. Later rules override earlier ones.
- Deploy: bump `version.txt`, `HERE` in `index.html`, and every `?v=` query string, then push to `main`. Open tabs reload themselves when `version.txt` changes.

## Behavior worth knowing
- Home: projects on the left sorted by start date (done projects last), stopwatch on the right. Clicking a card selects it; clicking anywhere else on Home selects nothing; every load starts with nothing selected.
- The stopwatch lives in the data (`timer`), so it survives reloads. Picking another project while time is running or unsaved moves that time to it. Save needs a work category (the category buttons get a red outline and shake if not). The pencil sets the time by hand; Resume continues from it.
- Per hour shows only once a project has an hour of work and revenue is entered.
- Projects and categories are only archived, never deleted. Time records can be deleted.
- Times show as h:mm with no leading zero on hours; the stopwatch shows MM:SS until an hour, then H:MM:SS.
- `?local` runs the app in this browser only, no login (the preview mode used while designing).
