# Business Time project notes

- Time tracking for Delphina Photography. Live at bt.plantalog.com.
- Desktop web app only. No phone layouts, bottom nav, PWA manifest or touch icons. Layouts may assume a laptop-width window (about 1024px and up) but should still wrap cleanly in a narrower window.
- Never use em dashes anywhere in this project: not in app UI copy, not in commentary. Use a period, comma, colon, or semicolon instead.
- Same stack as GDBB and Plantalog: static `index.html`, React 18 + Babel in the browser (`bt.jsx`), plain-JS math in `engine.js`, Supabase (the Plantalog project) for login and storage, GitHub Pages with `CNAME`. No build step.
- All time and money math lives in `engine.js` (pure functions, no DOM). After changing it, open `test/index.html` through the local server (Node isn't installed on this Mac) or run `node test/engine.test.js` where Node exists; add a test for any new rule.
- `bt.jsx` is data, storage and UI only. Everything is one JSON document per user in Supabase table `bt_data` (see `supabase/schema.sql`); add new fields with defaults in `migrate()` so older saved data keeps loading.
- Projects and categories are only ever archived, never deleted. Time records can be deleted.
- Time is stored in whole seconds. The stopwatch shows H:MM:SS; everything else shows hours and minutes.
- The running stopwatch lives in the data (`timer`), so it survives closing the tab and follows her to another computer.
- Look: GDBB's light system. Inter 400/500/600, 500-weight headings, outlined primary buttons, hairline rules, small uppercase kickers, colors as tokens on `:root` in `styles.css`. Glitter wash in the header, the Delphinus constellation (the business is named after it) and a dolphin mark.
- On every deploy bump `version.txt`, `HERE` in `index.html`, and the `?v=` query strings.
- Local preview: `python3 dev.py` (a no-cache server, so a reload never mixes old and new files), then open `http://localhost:8760/?local` (saved in the browser only, no login).
