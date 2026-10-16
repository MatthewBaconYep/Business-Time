// Run: node test/engine.test.js
const assert = require("assert");
const BT = require("../engine.js");

let n = 0;
function t(name, fn) { fn(); n++; console.log("ok  " + name); }

t("hm rounds to the nearest minute", () => {
  assert.strictEqual(BT.hm(0), "0m");
  assert.strictEqual(BT.hm(29), "<1m");
  assert.strictEqual(BT.hm(30), "1m");
  assert.strictEqual(BT.hm(59 * 60), "59m");
  assert.strictEqual(BT.hm(3600), "1h 00m");
  assert.strictEqual(BT.hm(3600 * 2 + 5 * 60 + 40), "2h 06m");
  assert.strictEqual(BT.hm(3600 * 125), "125h 00m");
});

t("clock: MM:SS under an hour, then hours with no leading zero", () => {
  assert.deepStrictEqual(BT.clock(0), { h: "", m: "00", s: "00" });
  assert.deepStrictEqual(BT.clock(3599), { h: "", m: "59", s: "59" });
  assert.deepStrictEqual(BT.clock(3725), { h: "1", m: "02", s: "05" });
  assert.deepStrictEqual(BT.clock(36000), { h: "10", m: "00", s: "00" });
});

t("timerSeconds adds banked and live time", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.strictEqual(BT.timerSeconds(null, now), 0);
  assert.strictEqual(BT.timerSeconds({ elapsed: 90, startedAt: null }, now), 90);
  assert.strictEqual(BT.timerSeconds({ elapsed: 90, startedAt: "2026-10-15T11:59:00Z" }, now), 150);
  // a clock running slightly behind never subtracts time
  assert.strictEqual(BT.timerSeconds({ elapsed: 10, startedAt: "2026-10-15T12:00:05Z" }, now), 10);
});

const data = {
  projects: [
    { id: "a", revenue: 1200 },
    { id: "b", revenue: "" },
    { id: "c", revenue: 0 },
  ],
  records: [
    { id: "1", projectId: "a", categoryId: "x", seconds: 3600 * 3, date: "2026-10-01" },
    { id: "2", projectId: "a", categoryId: "y", seconds: 3600 * 3, date: "2026-10-03" },
    { id: "3", projectId: "b", categoryId: "x", seconds: 3600, date: "2026-10-02" },
    { id: "4", projectId: "c", categoryId: "x", seconds: 1800, date: "2026-10-02" },
  ],
};

t("projectStats: time, revenue and revenue per hour", () => {
  const s = BT.projectStats(data, "a");
  assert.strictEqual(s.seconds, 21600);
  assert.strictEqual(s.revenue, 1200);
  assert.strictEqual(s.rate, 200);
  assert.deepStrictEqual(s.byCat, { x: 10800, y: 10800 });
});

t("projectStats: no revenue recorded means no rate", () => {
  const s = BT.projectStats(data, "b");
  assert.strictEqual(s.revenue, null);
  assert.strictEqual(s.rate, null);
});

t("projectStats: zero revenue is a real rate of zero", () => {
  assert.strictEqual(BT.projectStats({ projects: [{ id: "c", revenue: 0 }], records: [{ projectId: "c", seconds: 7200 }] }, "c").rate, 0);
});

t("rate: nothing under an hour of work", () => {
  assert.strictEqual(BT.rate(500, 3599), null);
  assert.strictEqual(BT.rate(500, 3600), 500);
  assert.strictEqual(BT.projectStats(data, "c").rate, null); // 30 minutes
});

t("projectStats: no time means no rate", () => {
  const s = BT.projectStats({ projects: [{ id: "z", revenue: 500 }], records: [] }, "z");
  assert.strictEqual(s.seconds, 0);
  assert.strictEqual(s.rate, null);
});

t("totals: blended rate ignores projects without revenue", () => {
  const tt = BT.totals(data, ["a", "b", "c"]);
  assert.strictEqual(tt.seconds, 21600 + 3600 + 1800);
  assert.strictEqual(tt.revenue, 1200);
  assert.strictEqual(tt.rate, 1200 / 6.5);
  // the blended rate also waits for an hour of paid work
  assert.strictEqual(BT.totals(data, ["c"]).rate, null);
});

t("sortRecords: newest date first", () => {
  const ids = BT.sortRecords(data.records).map(r => r.id);
  assert.strictEqual(ids[0], "2");
  assert.strictEqual(ids[3], "1");
});

t("toSeconds from hours and minutes", () => {
  assert.strictEqual(BT.toSeconds(1, 30), 5400);
  assert.strictEqual(BT.toSeconds("", "45"), 2700);
  assert.strictEqual(BT.toSeconds(-1, 0), 0);
});

t("parseWorked: h:mm, or a plain number of hours", () => {
  assert.strictEqual(BT.parseWorked("1:30"), 5400);
  assert.strictEqual(BT.parseWorked("0:45"), 2700);
  assert.strictEqual(BT.parseWorked(":45"), 2700);
  assert.strictEqual(BT.parseWorked("2"), 7200);
  assert.strictEqual(BT.parseWorked("1.5"), 5400);
  assert.strictEqual(BT.parseWorked(" 3:05 "), 11100);
  assert.strictEqual(BT.parseWorked(""), null);
  assert.strictEqual(BT.parseWorked("1:75"), null);
  assert.strictEqual(BT.parseWorked("abc"), null);
});

t("workedText formats seconds as h:mm", () => {
  assert.strictEqual(BT.workedText(11100), "3:05");
  assert.strictEqual(BT.workedText(13800), "3:50");
  assert.strictEqual(BT.workedText(0), "0:00");
});

console.log(`\n${n} tests passed`);
