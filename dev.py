# Local preview server: like `python3 -m http.server`, but tells the browser never
# to cache, so a reload always picks up every changed file together.
# Run: python3 dev.py   then open http://localhost:8760/?local
import http.server

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

http.server.ThreadingHTTPServer(("", 8760), NoCache).serve_forever()
