# Local preview server: like `python3 -m http.server`, but tells the browser never
# to cache, so a reload always picks up every changed file together.
# Run: python3 dev.py   then open http://localhost:8760/?local
#
# It also takes the preview's data from /seed.html and writes it to
# supabase/seed.local.sql (git-ignored): a one-time insert that gives a real
# account that data to start with.
import http.server, json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "supabase", "seed.local.sql")

def strip_archived(d):
    """Leave archived projects (and their time), categories and types out of the seed."""
    live = lambda xs: [x for x in xs or [] if not x.get("archived")]
    d["projects"] = live(d.get("projects"))
    d["projectCategories"] = live(d.get("projectCategories"))
    d["workCategories"] = live(d.get("workCategories"))
    for c in d["workCategories"]:
        c["subs"] = live(c.get("subs"))
    projects = {p["id"] for p in d["projects"]}
    pcats = {c["id"] for c in d["projectCategories"]}
    wcats = {c["id"]: {s["id"] for s in c["subs"]} for c in d["workCategories"]}
    for p in d["projects"]:
        if p.get("categoryId") not in pcats: p["categoryId"] = ""
    recs = []
    for r in d.get("records") or []:
        if r.get("projectId") not in projects: continue
        if r.get("categoryId") not in wcats: r["categoryId"] = ""; r["subId"] = ""
        elif r.get("subId") and r["subId"] not in wcats[r["categoryId"]]: r["subId"] = ""
        recs.append(r)
    d["records"] = recs

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/save-seed":
            self.send_error(404); return
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        data["timer"] = None  # never seed a running stopwatch
        strip_archived(data)
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("'", "''")
        sql = (
            "-- Business Time: one-time starting data for one account. Keep this file private.\n"
            "-- 1. Run supabase/schema.sql first.\n"
            "-- 2. Replace HER_EMAIL below with her Plantalog login email.\n"
            "-- 3. Run this in the Supabase SQL editor. It replaces anything already saved for her.\n\n"
            "insert into public.bt_data (user_id, data, version)\n"
            f"select id, '{body}'::jsonb, 1 from auth.users where email = 'HER_EMAIL'\n"
            "on conflict (user_id) do update\n"
            "  set data = excluded.data, version = public.bt_data.version + 1, updated_at = now();\n"
        )
        with open(OUT, "w") as f:
            f.write(sql)
        msg = json.dumps({"ok": True, "file": "supabase/seed.local.sql"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)

os.chdir(ROOT)
http.server.ThreadingHTTPServer(("127.0.0.1", 8760), NoCache).serve_forever()
