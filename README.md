# Business Time

Time tracking for Delphina Photography. Create projects, time the work with a big stopwatch (or add time by hand), tag each stretch of work with a work category and optional type, record what the project paid, and see revenue per hour. Live at **bt.plantalog.com**.

## Screens

- **Home**: projects on the left, each opening up to show its time worked, revenue, revenue per hour, time by work category and its time records. The stopwatch on the right times the selected project. Stop, then Save to record it (or Resume, or Discard).
- **Setup**: project categories and work categories (with colors), and the types within each work category.

## Setup

1. **Database**: in the Supabase dashboard of the Plantalog project, open SQL Editor and run `supabase/schema.sql`.
2. **Auth URLs**: Authentication → URL Configuration → add `https://bt.plantalog.com` to Redirect URLs (for password-reset emails).
3. **Pages**: repo Settings → Pages → Deploy from branch `main`, root. The `CNAME` file sets the domain.
4. **DNS**: at the plantalog.com DNS host, add `CNAME bt → matthewbaconyep.github.io`.

Sign-in uses the Plantalog login (same Supabase project). "Create an account" is there too; a new account starts with the default categories and no projects.

Local preview: `python3 dev.py`, then open `http://localhost:8760/?local` (device-only mode, no login).

Engine tests: open `http://localhost:8760/test/index.html` (with `dev.py` running), or `node test/engine.test.js`.
