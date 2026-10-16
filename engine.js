/* Business Time: pure math (no DOM). Loaded in the browser as window.BT and
 * in Node by test/engine.test.js. Time is stored in whole seconds.
 */
(function (root) {
  function num(v) {
    const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[$,\s]/g, ""));
    return isFinite(n) ? n : 0;
  }

  // Seconds a stopwatch has run: banked time plus the live stretch since startedAt.
  // timer: { elapsed: seconds banked, startedAt: ISO string or null when stopped }
  function timerSeconds(timer, nowMs) {
    if (!timer) return 0;
    let s = num(timer.elapsed);
    if (timer.startedAt) {
      const live = Math.floor((nowMs - Date.parse(timer.startedAt)) / 1000);
      if (live > 0) s += live;
    }
    return Math.max(0, Math.floor(s));
  }

  // Stopwatch display: MM:SS under an hour, then H:MM:SS with no leading zero on
  // hours (1:05:09, 12:00:00). h is "" while there are no whole hours yet.
  function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return { h: h ? String(h) : "", m: String(m).padStart(2, "0"), s: String(r).padStart(2, "0") };
  }

  // Records and totals: hours and minutes, rounded to the nearest minute.
  // A few seconds of real time reads "<1m" rather than "0m".
  function hm(seconds) {
    const secs = Math.max(0, num(seconds));
    const mins = Math.round(secs / 60);
    if (!mins && secs > 0) return "<1m";
    const h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return m + "m";
    return h + "h " + String(m).padStart(2, "0") + "m";
  }

  function projectRecords(data, projectId) {
    return (data.records || []).filter(r => r.projectId === projectId);
  }

  // Revenue per hour is null with no revenue recorded, or under an hour of work
  // (a few minutes against a whole fee gives a meaningless number).
  const MIN_RATE_SECONDS = 3600;
  function rate(revenue, seconds) {
    const rev = num(revenue), hours = num(seconds) / 3600;
    if (num(seconds) < MIN_RATE_SECONDS || revenue === "" || revenue == null) return null;
    return rev / hours;
  }

  function projectStats(data, projectId) {
    const p = (data.projects || []).find(x => x.id === projectId) || {};
    const recs = projectRecords(data, projectId);
    const seconds = recs.reduce((a, r) => a + num(r.seconds), 0);
    const byCat = {};
    for (const r of recs) byCat[r.categoryId || ""] = (byCat[r.categoryId || ""] || 0) + num(r.seconds);
    const hasRevenue = !(p.revenue === "" || p.revenue == null);
    return { seconds, revenue: hasRevenue ? num(p.revenue) : null, rate: rate(hasRevenue ? p.revenue : null, seconds), count: recs.length, byCat };
  }

  // Totals across a set of projects. The blended rate only counts projects that
  // have revenue recorded, so unbilled work in progress doesn't drag it down.
  function totals(data, projectIds) {
    let seconds = 0, revenue = 0, paidSeconds = 0;
    for (const id of projectIds) {
      const s = projectStats(data, id);
      seconds += s.seconds;
      if (s.revenue !== null) { revenue += s.revenue; paidSeconds += s.seconds; }
    }
    return { seconds, revenue, rate: paidSeconds >= MIN_RATE_SECONDS ? revenue / (paidSeconds / 3600) : null };
  }

  // Newest first: by date, then by when the record was made.
  function sortRecords(recs) {
    return recs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  // Seconds from a manual entry of hours and minutes.
  function toSeconds(h, m) {
    return Math.max(0, Math.round(num(h) * 3600 + num(m) * 60));
  }

  // The Worked field: "1:30" is 1h 30m, a plain number is hours ("2", "1.5").
  // Returns seconds, or null when it can't be read.
  function parseWorked(text) {
    const t = String(text == null ? "" : text).trim();
    if (!t) return null;
    let m = t.match(/^(\d{0,4}):(\d{1,2})$/);
    if (m) { const mm = Number(m[2]); if (mm > 59) return null; return Number(m[1] || 0) * 3600 + mm * 60; }
    m = t.match(/^\d{0,4}(\.\d+)?$/);
    if (m && t !== ".") return Math.round(parseFloat(t) * 60) * 60;
    return null;
  }
  // Seconds as h:mm, the format for every total and record: "3:05", "0:45".
  function workedText(seconds) {
    const mins = Math.round(Math.max(0, num(seconds)) / 60);
    return Math.floor(mins / 60) + ":" + String(mins % 60).padStart(2, "0");
  }

  const BT = { num, timerSeconds, clock, hm, rate, projectStats, totals, sortRecords, toSeconds, projectRecords, parseWorked, workedText };
  if (typeof module !== "undefined" && module.exports) module.exports = BT;
  else root.BT = BT;
})(typeof window !== "undefined" ? window : globalThis);
