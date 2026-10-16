/* Business Time
 * One-file React app (Babel in the browser, like GDBB and Plantalog). The math
 * lives in engine.js (window.BT); this file is data, storage and UI.
 * Project rule: no em dashes anywhere in UI copy.
 */
const { useState, useEffect, useMemo, useRef, useCallback } = React;
const E = window.BT;

// ---------- formatting ----------
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, minimumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
function money(n) {
  const v = Number(n) || 0;
  return (v < 0 ? "−" : "") + (Math.round(Math.abs(v) * 100) % 100 ? usd2 : usd0).format(Math.abs(v));
}
function perHour(r) { return r === null || r === undefined ? "–" : usd0.format(r) + "/hr"; }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateLabel(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const yr = y !== new Date().getFullYear() ? ", " + y : "";
  return `${DOW[dt.getDay()]}, ${MONTHS[m - 1]} ${d}${yr}`;
}
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "Oct 12, 2026" for a YYYY-MM-DD date.
function dateLong(s) { if (!s) return ""; const [y, m, d] = s.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; }
function addMonths(ym, n) { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`; }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ---------- data ----------
// One JSON document per user:
// { v, projectCategories: [{id, name, archived}],
//   workCategories: [{id, name, archived, subs: [{id, name, archived}]}],
//   projects: [{id, name, categoryId, revenue ("" or number), start, end (YYYY-MM-DD or ""), done, archived, createdAt}],
//   records: [{id, projectId, categoryId, subId, date, seconds, source, createdAt, updatedAt}],
//   timer: null or {projectId, categoryId, subId, elapsed, startedAt, date} }
function defaultData() {
  const P = name => ({ id: uid(), name, archived: false });
  const W = (name, subs) => ({ id: uid(), name, archived: false, subs: subs.map(s => ({ id: uid(), name: s, archived: false })) });
  return {
    v: 1,
    projectCategories: ["Wedding", "Engagement", "Portrait", "Family", "Event", "Commercial"].map(P),
    workCategories: [
      W("Client communication", ["Email", "Calls", "Meetings"]),
      W("Planning", ["Shot list", "Timeline", "Location scouting"]),
      W("Shooting", ["Main session", "Second shooter"]),
      W("Travel", []),
      W("Editing", ["Culling", "Retouching", "Color grading"]),
      W("Delivery", ["Gallery", "Album design", "Prints"]),
      W("Business admin", ["Contracts", "Invoicing"]),
    ],
    projects: [],
    records: [],
    timer: null,
  };
}
function migrate(d) {
  const base = defaultData();
  d = d && typeof d === "object" ? d : base;
  for (const k of ["projectCategories", "workCategories", "projects", "records"]) if (!Array.isArray(d[k])) d[k] = base[k];
  d.workCategories.forEach(c => { if (!Array.isArray(c.subs)) c.subs = []; });
  d.projects.forEach(p => { if (p.start === undefined) p.start = ""; if (p.end === undefined) p.end = ""; if (p.done === undefined) p.done = false; });
  if (d.timer === undefined) d.timer = null;
  d.v = 1;
  return d;
}

// ---------- storage ----------
// Supabase: one row per user in bt_data (see supabase/schema.sql), with an
// integer version for "changed on another device" detection. Local mode
// (?local) keeps the same JSON in this browser only, for previews.
const LOCAL_KEY = "bt-local-v1";
const sb = () => window.__supabase_client || null;
const safeLS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const Store = {
  async loadRemote(userId) {
    const { data, error } = await sb().from("bt_data").select("data, version").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) {
      const fresh = defaultData();
      const ins = await sb().from("bt_data").insert({ user_id: userId, data: fresh, version: 1 }).select("version").single();
      if (ins.error) throw ins.error;
      return { data: fresh, version: 1 };
    }
    return { data: migrate(data.data), version: data.version };
  },
  async saveRemote(userId, d, version) {
    const res = await sb().from("bt_data")
      .update({ data: d, version: version + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("version", version).select("version");
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) return { conflict: true };
    return { version: res.data[0].version };
  },
  async remoteVersion(userId) {
    const { data, error } = await sb().from("bt_data").select("version").eq("user_id", userId).maybeSingle();
    if (error || !data) return null;
    return data.version;
  },
  loadLocal() { const s = safeLS.get(LOCAL_KEY); try { return s ? migrate(JSON.parse(s)) : null; } catch (e) { return null; } },
  saveLocal(d) { safeLS.set(LOCAL_KEY, JSON.stringify(d)); },
};

// ---------- lookups ----------
function byId(list, id) { return (list || []).find(x => x.id === id) || null; }
function workName(data, catId, subId) {
  const c = byId(data.workCategories, catId);
  if (!c) return "No category";
  const s = subId ? byId(c.subs, subId) : null;
  return s ? `${c.name} · ${s.name}` : c.name;
}
// A work category's color from Setup, or undefined to fall back to the built-in palette.
function catColor(data, id) { const c = byId(data.workCategories, id); return (c && c.color) || undefined; }
// Live choices: everything not archived, plus the current value so editing an
// old record never silently drops its archived category.
function liveOptions(list, keepId) { return (list || []).filter(x => !x.archived || x.id === keepId); }

// ---------- icons (inline stroke SVG) ----------
function Icon({ name, size = 18, stroke = 1.7 }) {
  const p = {
    plus: <path d="M12 5v14M5 12h14" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    chev: <path d="m9 6 6 6-6 6" />,
    left: <path d="m15 6-6 6 6 6" />,
    right: <path d="m9 6 6 6-6 6" />,
    cal: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
    play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />,
    stop: <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" fill="currentColor" stroke="none" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    archive: <><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" /></>,
    restore: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
    out: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l4-4-4-4M14 12H4" /></>,
    download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
    trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
    bin: <><path d="M4 6.5h16M9.5 6.5V4h5v2.5" /><path d="M6 6.5l1 13.5h10l1-13.5" /><path d="M10 10.5v6M14 10.5v6" /></>,
    floppy: <><path d="M5 4h11.5L20 7.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M8 4v5h7V4" /><rect x="7.5" y="13" width="9" height="7" rx="0.5" /></>,
  }[name];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>;
}

// ---------- Delphina: the dolphin mark and the Delphinus constellation ----------
// The mark: a leaping dolphin in the iridescent gradient with a sparkle.
function Mark({ size = 44 }) {
  const id = useMemo(() => "m" + uid(), []);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="mark">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6bfdc" />
          <stop offset="0.5" stopColor="#cfc6fb" />
          <stop offset="1" stopColor="#a6e2e1" />
        </linearGradient>
      </defs>
      <g stroke="#1b1d2b" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill={`url(#${id})`}>
        <path d={DOLPHIN} />
        <path d="M33 33.5c-1.5 4-4 6.5-7.5 8 1-3 1.6-5.4 1.8-7.7" />
      </g>
      <circle cx="47.6" cy="25.4" r="1.6" fill="#1b1d2b" />
      <path d="M22 26c.4 2.4 1.2 3.2 3.6 3.6-2.4.4-3.2 1.2-3.6 3.6-.4-2.4-1.2-3.2-3.6-3.6 2.4-.4 3.2-1.2 3.6-3.6z" fill="#fff" />
    </svg>
  );
}
// A dolphin arcing up and to the right: rostrum, melon, back, dorsal fin, tail stock, fluke, belly.
const DOLPHIN = "M60 30.5c-2.7-.9-5.4-1.8-7.6-3.3C50 22.4 45 19.2 38.5 19.3l-2.7-6.8c-1.1 2.4-2.3 4.8-4.4 7.6C22 23 15.2 30 11.6 39.3L5 37.8c1.6 2.4 3.3 4.4 5.1 6.1L7.4 50.2c3-1.5 5.6-3.4 7.6-5.6C20.2 37 29 33.4 39.4 33c6.9-.3 13.3-.6 20.6-2.5z";

// Delphinus as seen from Earth: the diamond (Gamma, Alpha, Beta, Delta) and the tail star Epsilon.
const DELPHINUS = { stars: [[0, 0, 2.3], [34, 4, 2.7], [44, 30, 2.9], [15, 20, 2], [65, 96, 2.4]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4]] };
function Constellation({ className, twinkle }) {
  const { stars, lines } = DELPHINUS;
  return (
    <svg className={"constellation " + (className || "") + (twinkle ? " twinkle" : "")} viewBox="-8 -8 82 112" aria-hidden="true">
      {lines.map(([a, b], i) => <line key={i} x1={stars[a][0]} y1={stars[a][1]} x2={stars[b][0]} y2={stars[b][1]} />)}
      {stars.map(([x, y, r], i) => (
        <g key={i} style={{ animationDelay: i * 0.45 + "s" }}>
          <circle cx={x} cy={y} r={r * 2.4} className="halo" />
          <circle cx={x} cy={y} r={r} className="star" />
        </g>
      ))}
    </svg>
  );
}

function Glitter() {
  const stars = [[6, 18, 9, 0], [18, 52, 6, 1.1], [29, 22, 7, 2.1], [41, 64, 5, .6], [52, 14, 10, 1.6], [63, 44, 6, .3],
    [74, 24, 8, 2.4], [86, 58, 6, 1.3], [94, 20, 7, .9], [12, 78, 5, 2.7], [58, 80, 5, 1.9], [80, 86, 4, .4], [35, 88, 4, 1.4]];
  return (
    <div className="glitter" aria-hidden="true">
      <div className="wash" />
      <div className="dust" />
      <div className="dust2" />
      <svg className="sparkles" viewBox="0 0 100 100" preserveAspectRatio="none">
        {stars.map(([x, y, s, d], i) => (
          <path key={i} style={{ animationDelay: d + "s" }}
            d={`M${x} ${y - s / 2} C${x + s * .06} ${y - s * .12} ${x + s * .12} ${y - s * .06} ${x + s * .28} ${y} C${x + s * .12} ${y + s * .06} ${x + s * .06} ${y + s * .12} ${x} ${y + s / 2} C${x - s * .06} ${y + s * .12} ${x - s * .12} ${y + s * .06} ${x - s * .28} ${y} C${x - s * .12} ${y - s * .06} ${x - s * .06} ${y - s * .12} ${x} ${y - s / 2}Z`} />
        ))}
      </svg>
    </div>
  );
}

// ---------- primitives ----------
function Sheet({ title, onClose, children, footer, narrow, wide, width, className, noClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const first = ref.current && ref.current.querySelector("input, select, textarea");
    if (first) setTimeout(() => first.focus(), 30);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"sheet" + (className ? " " + className : "")} role="dialog" aria-modal="true" aria-label={title} ref={ref} style={width ? { maxWidth: width } : narrow ? { maxWidth: 420 } : wide ? { maxWidth: 680 } : null}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {!noClose && <button className="btn btn-ghost btn-icon sheet-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>}
        </div>
        <div className="stack">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
function Field({ label, children, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function MoneyInput({ value, onChange, ariaLabel }) {
  return (
    <div className="money-wrap">
      <span className="cur">$</span>
      <input className="input num" inputMode="decimal" aria-label={ariaLabel} value={value} placeholder="0"
        onChange={e => onChange(e.target.value.replace(/[^0-9.,]/g, ""))} />
    </div>
  );
}
// GDBB's date picker: an input-styled button that opens a month calendar.
// clearable adds a Clear button for optional dates.
function DatePicker({ value, onChange, ariaLabel, min, placeholder, clearable }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value || today()).slice(0, 7));
  const [pos, setPos] = useState(null);
  const btn = useRef(null), pop = useRef(null);
  useEffect(() => {
    if (!open) return;
    const r = btn.current.getBoundingClientRect();
    const h = 330, below = window.innerHeight - r.bottom;
    setPos({ left: Math.min(r.left, window.innerWidth - 276), top: below > h + 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6) });
    const onDown = e => { if (!pop.current || pop.current.contains(e.target) || btn.current.contains(e.target)) return; setOpen(false); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  const [y, m] = view.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${view}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const t = today();
  const pickDay = d => { onChange(d); setOpen(false); };
  return (
    <>
      <button type="button" ref={btn} className={"input dp-btn" + (value ? "" : " is-empty")} aria-label={ariaLabel || "Date"} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { setView((value || (min && t < min ? min : t)).slice(0, 7)); setOpen(o => !o); }}>
        <span className="grow">{value ? dateLong(value) : (placeholder || "")}</span><Icon name="cal" size={16} />
      </button>
      {open && pos && (
        <div ref={pop} className="dp-pop" role="dialog" aria-label="Choose a date" style={{ left: pos.left, top: pos.top }}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => setView(addMonths(view, -1))}><Icon name="left" size={16} /></button>
            <span className="dp-title">{MONTHS_LONG[m - 1]} {y}</span>
            <button type="button" className="dp-nav" aria-label="Next month" onClick={() => setView(addMonths(view, 1))}><Icon name="right" size={16} /></button>
          </div>
          <div className="dp-grid dp-dow">{DOW.map(d => <span key={d}>{d.slice(0, 2)}</span>)}</div>
          <div className="dp-grid">
            {cells.map((d, i) => d ? (
              <button type="button" key={d} className={"dp-day" + (d === value ? " sel" : "") + (d === t ? " today" : "")}
                disabled={!!(min && d < min)} onClick={() => pickDay(d)}>{Number(d.slice(8))}</button>
            ) : <span key={"e" + i} />)}
          </div>
          <div className="dp-foot">
            {clearable && value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => pickDay("")}>Clear</button>}
            <span className="grow" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => pickDay(min && t < min ? min : t)}>Today</button>
          </div>
        </div>
      )}
    </>
  );
}
function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
// In-page confirmation (native confirm dialogs are blocked in some embeds).
let confirmSetter = null;
// opts.titleOnly: show the message as the title, with no body, in a small popup.
// opts.noMessage: just "Are you sure?" and the buttons, in a small popup.
function askConfirm(message, okLabel, opts) {
  return new Promise(res => (confirmSetter ? confirmSetter(Object.assign({ message, okLabel: okLabel || "Delete", res }, opts)) : res(true)));
}
function ConfirmHost() {
  const [c, setC] = useState(null);
  useEffect(() => { confirmSetter = setC; return () => { confirmSetter = null; }; }, []);
  if (!c) return null;
  const done = v => { c.res(v); setC(null); };
  return (
    <Sheet title={c.titleOnly ? c.message : "Are you sure?"} narrow={!(c.titleOnly || c.noMessage)} width={c.titleOnly || c.noMessage ? 340 : undefined} onClose={() => done(false)}
      className="confirm" noClose
      footer={<><button className="btn btn-secondary" onClick={() => done(false)}>Cancel</button><button className="btn btn-danger" onClick={() => done(true)}>{c.okLabel}</button></>}>
      {!c.titleOnly && !c.noMessage && <p>{c.message}</p>}
    </Sheet>
  );
}

// ---------- project sheet ----------
function ProjectSheet({ data, update, project, onClose, toast, onCreated }) {
  const [name, setName] = useState(project ? project.name : "");
  const [cat, setCat] = useState(project ? project.categoryId || "" : "");
  const [rev, setRev] = useState(project && project.revenue !== "" && project.revenue != null ? String(project.revenue) : "");
  const [start, setStart] = useState(project ? project.start || "" : "");
  const [end, setEnd] = useState(project ? project.end || "" : "");
  const timing = project && data.timer && data.timer.projectId === project.id;
  // Name and Category are required: a missing one just gets a red border.
  const [tried, setTried] = useState(false);
  const missName = tried && !name.trim(), missCat = tried && !cat;
  function save() {
    if (!name.trim() || !cat) { setTried(true); return; }
    if (start && end && end < start) { toast("The end date is before the start date"); return; }
    const revenue = rev.trim() === "" ? "" : E.num(rev);
    if (project) {
      update(d => { const p = byId(d.projects, project.id); Object.assign(p, { name: name.trim(), categoryId: cat, revenue, start, end }); });
    } else {
      const id = uid();
      update(d => { d.projects.push({ id, name: name.trim(), categoryId: cat, revenue, start, end, done: false, archived: false, createdAt: new Date().toISOString() }); });
      onCreated && onCreated(id);
    }
    onClose();
  }
  async function toggleArchive() {
    if (!project.archived && !(await askConfirm("", "Archive", { noMessage: true }))) return;
    update(d => { byId(d.projects, project.id).archived = !project.archived; });
    toast(project.archived ? "Project restored" : "Project archived");
    onClose();
  }
  return (
    <Sheet title={project ? "Edit Project" : "New Project"} onClose={onClose} wide
      footer={<>
        {project && <button className="btn btn-secondary" onClick={toggleArchive} disabled={timing && !project.archived}
          title={timing ? "Save or discard the running time first" : undefined}>
          {project.archived ? "Restore" : "Archive"}</button>}
        <span className="grow" />
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-solid" onClick={save}>{project ? "Save" : "Add"}</button>
      </>}>
      <div className="proj-form">
        <Field label="Name">
          <input className={"input" + (missName ? " invalid" : "")} value={name} aria-invalid={missName || undefined} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
        </Field>
        <Field label="Start"><DatePicker value={start} onChange={setStart} ariaLabel="Start date" clearable /></Field>
        <Field label="End"><DatePicker value={end} onChange={setEnd} ariaLabel="End date" min={start || undefined} clearable /></Field>
        <Field label="Category">
          <select className={"input" + (cat ? "" : " is-empty") + (missCat ? " invalid" : "")} value={cat} aria-invalid={missCat || undefined} onChange={e => setCat(e.target.value)}>
            <option value="" disabled hidden></option>
            {liveOptions(data.projectCategories, cat).map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? " (archived)" : ""}</option>)}
          </select>
        </Field>
        <div className="span2"><Field label="Revenue"><MoneyInput value={rev} onChange={setRev} ariaLabel="Revenue" /></Field></div>
      </div>
    </Sheet>
  );
}

// ---------- time record sheet ----------
// init: { record } to edit, or { projectId } to add time by hand.
function RecordSheet({ data, update, init, onClose, toast }) {
  const r = init.record;
  const projectId = r ? r.projectId : init.projectId;
  const [date, setDate] = useState(r ? r.date : today());
  const [cat, setCat] = useState(r ? r.categoryId || "" : "");
  const [sub, setSub] = useState(r ? r.subId || "" : "");
  const worked0 = r ? E.workedText(r.seconds) : "";
  const [worked, setWorked] = useState(worked0);
  // Missing or unreadable fields just get a red border, like the project popup.
  const [tried, setTried] = useState(false);
  const catObj = byId(data.workCategories, cat);
  const subs = catObj ? liveOptions(catObj.subs, sub) : [];
  const seconds = E.parseWorked(worked);
  const missWorked = tried && !seconds, missCat = tried && !cat;
  function save() {
    if (!cat || !seconds || !date) { setTried(true); return; }
    const now = new Date().toISOString();
    // Keep the exact seconds from the stopwatch unless the time was actually changed.
    const keep = r && worked.trim() === worked0;
    update(d => {
      const fields = { date, categoryId: cat, subId: sub, updatedAt: now };
      if (r) Object.assign(byId(d.records, r.id), fields, keep ? {} : { seconds });
      else d.records.push(Object.assign({ id: uid(), projectId, seconds, source: "manual", createdAt: now }, fields));
    });
    toast(r ? "Time updated" : "Time added");
    onClose();
  }
  async function remove() {
    if (!(await askConfirm(`Delete this ${E.workedText(r.seconds)} time record?`))) return;
    update(d => { d.records = d.records.filter(x => x.id !== r.id); });
    toast("Time record deleted");
    onClose();
  }
  return (
    <Sheet title={r ? "Edit Time" : "Add Time"} onClose={onClose}
      footer={<>
        {r && <button className="btn btn-danger" onClick={remove}><Icon name="trash" size={16} />Delete</button>}
        <span className="grow" />
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-solid" onClick={save}>Save</button>
      </>}>
      <div className="grid2">
        <Field label="Date">
          <DatePicker value={date} onChange={setDate} ariaLabel="Date" />
        </Field>
        <Field label="Worked">
          <input className={"input num" + (missWorked ? " invalid" : "")} value={worked} placeholder="00:00" aria-label="Worked" aria-invalid={missWorked || undefined}
            onChange={e => setWorked(e.target.value.replace(/[^0-9:.]/g, "").slice(0, 7))} onKeyDown={e => e.key === "Enter" && save()} />
        </Field>
      </div>
      <div className="grid2">
        <Field label="Category">
          <select className={"input" + (cat ? "" : " is-empty") + (missCat ? " invalid" : "")} value={cat} aria-invalid={missCat || undefined} onChange={e => { setCat(e.target.value); setSub(""); }}>
            <option value="" disabled hidden></option>
            {liveOptions(data.workCategories, cat).map(c => <option key={c.id} value={c.id}>{c.name}{c.archived ? " (archived)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className={"input" + (sub ? "" : " is-empty")} value={sub} onChange={e => setSub(e.target.value)} disabled={!subs.length}>
            <option value=""></option>
            {subs.map(s => <option key={s.id} value={s.id}>{s.name}{s.archived ? " (archived)" : ""}</option>)}
          </select>
        </Field>
      </div>
    </Sheet>
  );
}

// ---------- home: project list ----------
// Project order: by start date (earliest first, no date last), then name.
// Projects marked done drop to the bottom in the same order.
function byStart(a, b) {
  return (!!a.done - !!b.done) || ((a.start || "9999").localeCompare(b.start || "9999")) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

// onAdd puts a small + for adding time by hand in the Time worked tile.
// Empty Time worked and Per hour tiles stay blank (a no-break space keeps their height).
function StatTrio({ s, big, onAdd }) {
  return (
    <div className={"trio" + (big ? " big" : "")}>
      <div className="tile-time">
        <div className="label">Worked</div><div className="v">{s.seconds ? E.workedText(s.seconds) : "\u00a0"}</div>
        {onAdd && <button className="tile-add" onClick={onAdd} aria-label="Add time" title="Add time"><Icon name="plus" size={14} stroke={2} /></button>}
      </div>
      <div><div className="label">Revenue</div><div className="v">{s.revenue === null ? "–" : money(s.revenue)}</div></div>
      <div><div className="label">Per hour</div><div className="v accent">{s.rate === null ? "\u00a0" : perHour(s.rate)}</div></div>
    </div>
  );
}

// A record's category as a capsule in its color, with the type after it.
function RecCat({ data, r }) {
  const c = byId(data.workCategories, r.categoryId);
  const t = c && r.subId ? byId(c.subs, r.subId) : null;
  return <>
    <span className="rec-cap" style={c ? capStyle(c.color) : null}>{c ? c.name : "No category"}</span>
    {t && <span className="rec-type">{t.name}</span>}
  </>;
}

// M/D/YY with no leading zeros, like 9/20/26 (project dates and time records).
function shortDate(value) { const [y, m, d] = value.split("-").map(Number); return `${m}/${d}/${String(y).slice(-2)}`; }
// Start or end date in a project's header.
function DateTile({ label, value }) {
  const v = value ? shortDate(value) : "–";
  return <div className={"date-tile" + (value ? "" : " empty")}><span>{label}</span><b>{v}</b></div>;
}

function ProjectCapsule({ data, update, p, open, selected, onToggle, onSelect, openSheet }) {
  const s = E.projectStats(data, p.id);
  const recs = useMemo(() => E.sortRecords(E.projectRecords(data, p.id)), [data.records, p.id]);
  const cat = byId(data.projectCategories, p.categoryId);
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const canOpen = recs.length > 0;
  open = open && canOpen;
  return (
    // Clicking anywhere on the card selects it; the top row also opens and closes it,
    // but only once it has time recorded.
    <section className={"proj" + (selected ? " sel" : "") + (open ? " open" : "") + (p.done ? " done" : "")} onClick={() => onSelect(p.id)}>
      {/* The whole header toggles; the name is the keyboard-focusable toggle. */}
      <div className={"proj-head" + (canOpen ? "" : " no-open")} onClick={() => { if (canOpen) onToggle(p.id); }}>
        <button className="proj-toggle" aria-expanded={canOpen ? open : undefined}>
          {/* Name with its category underneath, in a box tinted with the category's color. Text stays black. */}
          <span className="proj-cap" style={cat && cat.color ? { background: cat.color + "24", borderColor: cat.color + "66" } : null} title={p.name + (cat ? " · " + cat.name : "")}>
            <span className="proj-name">{p.name}</span>
            {cat && <span className="proj-cap-cat">{cat.name}</span>}
          </span>
        </button>
        <DateTile label="Start" value={p.start} />
        <DateTile label="End" value={p.end} />
        <button className="btn btn-ghost btn-icon proj-edit" aria-label={`Edit ${p.name}`} title="Edit project"
          onClick={e => { e.stopPropagation(); openSheet({ type: "project", project: p }); }}><Icon name="edit" size={16} /></button>
        <button className={"proj-done" + (p.done ? " on" : "")} aria-pressed={!!p.done} aria-label={p.done ? `Mark ${p.name} not done` : `Mark ${p.name} done`}
          title={p.done ? "Done (click to undo)" : "Mark done"}
          onClick={e => { e.stopPropagation(); update(d => { byId(d.projects, p.id).done = !p.done; }); }}><Icon name="check" size={16} stroke={2.4} /></button>
        <svg className="chev" style={canOpen ? null : { visibility: "hidden" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </div>
      {/* Totals show even when collapsed; the breakdown and records only when open. */}
      <div className="proj-stats"><StatTrio s={s} onAdd={() => openSheet({ type: "record", init: { projectId: p.id } })} /></div>
      {open && (
        <div className="proj-body">
          {recs.length > 1 && cats.length > 1 && ( /* the meter only means something with more than one record and category */
            <div className="mix" aria-label="Time by work category">
              <div className="mix-bar">{cats.map(([id, sec], i) => <i key={id} className={"c" + (i % 6)} style={{ flexGrow: sec, background: catColor(data, id) }} title={`${workName(data, id)}: ${E.workedText(sec)}`} />)}</div>
              <div className="mix-key">{cats.map(([id, sec], i) => <span key={id}><b className={"c" + (i % 6)} style={{ background: catColor(data, id) }} />{workName(data, id)}</span>)}</div>
            </div>
          )}
          <div className="recs">
            {recs.map(r => (
              <button key={r.id} className="rec" onClick={() => openSheet({ type: "record", init: { record: r } })}>
                <span className="rec-date">{shortDate(r.date)}</span>
                <span className="rec-cat"><RecCat data={data} r={r} /></span>
                <span className="rec-time">{E.workedText(r.seconds)}</span>
                <span className="rec-edit"><Icon name="edit" size={14} /></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ProjectList({ data, update, selectedId, setSelectedId, openSheet }) {
  const [view, setView] = useState(() => safeLS.get("bt-view") || "active");
  const [expanded, setExpanded] = useState(() => { try { return JSON.parse(safeLS.get("bt-open")) || []; } catch (e) { return []; } });
  useEffect(() => safeLS.set("bt-view", view), [view]);
  useEffect(() => safeLS.set("bt-open", JSON.stringify(expanded)), [expanded]);
  const list = useMemo(() => data.projects.filter(p => (view === "archived") === !!p.archived).sort(byStart), [data.projects, view]);
  const tot = E.totals(data, list.map(p => p.id));
  const toggle = id => setExpanded(x => (x.includes(id) ? x.filter(y => y !== id) : [...x, id]));
  const archivedCount = data.projects.filter(p => p.archived).length;
  return (
    <div className="col-left">
      <div className="list-head">
        <h2>Projects</h2>
        <span className="grow" />
        {/* Shows archived projects while pressed. */}
        <button className="btn btn-sm arch-btn" aria-pressed={view === "archived"} title={view === "archived" ? "Back to active projects" : `Show archived projects${archivedCount ? " (" + archivedCount + ")" : ""}`}
          onClick={() => setView(view === "archived" ? "active" : "archived")}>Archive</button>
        <button className="btn btn-solid btn-icon add-plus" aria-label="New project" title="New project" onClick={() => openSheet({ type: "project" })}><Icon name="plus" size={18} /></button>
      </div>
      {list.length > 0 && (
        <div className="summary">
          <StatTrio s={tot} big />
        </div>
      )}
      {/* Only the cards scroll; the header and totals stay put. */}
      <div className="proj-scroll">
        {list.map(p => (
          <ProjectCapsule key={p.id} data={data} update={update} p={p} open={expanded.includes(p.id)} selected={selectedId === p.id}
            onToggle={toggle} onSelect={setSelectedId} openSheet={openSheet} />
        ))}
      </div>
    </div>
  );
}

// ---------- home: stopwatch ----------
// A selected picker pill in its category's color (types use their category's).
function pillStyle(color) {
  return color ? { background: color + "24", color: capInk(color), borderColor: color, boxShadow: `inset 0 0 0 0.5px ${color}` } : null;
}

function useTick(on) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set(x => x + 1), 250);
    return () => clearInterval(t);
  }, [on]);
}

function Stopwatch({ data, update, selectedId, toast }) {
  const t = data.timer;
  const running = !!(t && t.startedAt);
  useTick(running);
  // Category picks before the stopwatch starts live here; after that they live on the timer.
  const [draft, setDraft] = useState({ categoryId: "", subId: "" });
  // Save pressed without a category: outline and shake the category buttons (a new number reruns the shake).
  const [needCat, setNeedCat] = useState(0);
  const pillsRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const projectId = t ? t.projectId : selectedId;
  const project = byId(data.projects, projectId);
  const secs = E.timerSeconds(t, Date.now());
  const c = E.clock(secs);
  const pick = t ? { categoryId: t.categoryId || "", subId: t.subId || "" } : draft;
  const cat = byId(data.workCategories, pick.categoryId);
  const cats = liveOptions(data.workCategories, pick.categoryId);
  const subs = cat ? liveOptions(cat.subs, pick.subId) : [];
  const disabled = !project || project.archived;

  useEffect(() => {
    document.title = running ? `${c.h ? c.h + ":" : ""}${c.m}:${c.s} · Business Time` : "Business Time";
  });

  function setPick(categoryId, subId) {
    if (t) update(d => { d.timer.categoryId = categoryId; d.timer.subId = subId; });
    else setDraft({ categoryId, subId });
  }
  function start() {
    if (disabled) return;
    const now = new Date().toISOString();
    update(d => {
      if (d.timer) d.timer.startedAt = now;
      else d.timer = { projectId: project.id, categoryId: draft.categoryId, subId: draft.subId, elapsed: 0, startedAt: now, date: today() };
    });
  }
  // Set the stopwatch to an entered h:mm; Start or Resume carries on from there.
  function setTime(seconds) {
    update(d => {
      if (d.timer) { d.timer.elapsed = seconds; d.timer.startedAt = null; }
      else d.timer = { projectId: project.id, categoryId: draft.categoryId, subId: draft.subId, elapsed: seconds, startedAt: null, date: today() };
    });
    setEditing(false);
  }
  function stop() {
    const now = Date.now();
    update(d => { if (d.timer) { d.timer.elapsed = E.timerSeconds(d.timer, now); d.timer.startedAt = null; } });
  }
  function save() {
    if (!pick.categoryId) {
      setNeedCat(n => n + 1);
      if (pillsRef.current) pillsRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (secs < 1) return;
    const now = new Date().toISOString();
    setNeedCat(0);
    update(d => {
      const tm = d.timer;
      d.records.push({ id: uid(), projectId: tm.projectId, categoryId: tm.categoryId, subId: tm.subId || "", date: tm.date || today(), seconds: secs, source: "timer", createdAt: now, updatedAt: now });
      d.timer = null;
    });
    setDraft({ categoryId: pick.categoryId, subId: pick.subId });
    toast(`Saved ${E.workedText(secs)} to ${project ? project.name : "the project"}`);
  }
  async function discard() {
    if (!(await askConfirm("You sure about that?", "Discard", { titleOnly: true }))) return;
    setNeedCat(0);
    update(d => { d.timer = null; });
  }

  return (
    <div className={"watch" + (disabled ? " off" : "") + (running ? " running" : "")}>
      {/* Always present (blank with no project) so the card keeps its size. */}
      <div className="watch-top">
        <h2 className="watch-project grow">{project ? project.name : "\u00a0"}</h2>
        <button className="btn btn-ghost btn-icon watch-edit" aria-label="Edit the timer's time" title="Edit time"
          style={project ? null : { visibility: "hidden" }}
          disabled={running || disabled} onClick={() => setEditing(true)}><Icon name="edit" size={16} /></button>
      </div>

      <div className="face">
        <div className="face-wash" aria-hidden="true" />
        <Constellation className="face-const" twinkle={running} />
        {/* While running, Delphinus drifts across the sky every so often (like the leaping dolphin). */}
        <div className="drifter" aria-hidden="true"><Constellation twinkle /></div>
        {/* MM:SS until an hour has passed, then H:MM:SS. */}
        <div className="digits" role="timer" aria-live="off" aria-label={`${Number(c.h || 0)} hours ${Number(c.m)} minutes ${Number(c.s)} seconds`}>
          {c.h && <><span className="dg">{c.h}</span><span className="colon">:</span></>}
          <span className="dg">{c.m}</span>
          <span className="colon">:</span>
          <span className="dg">{c.s}</span>
        </div>
        <div className="sea" aria-hidden="true">
          <svg className="leaper" viewBox="0 0 64 64"><path d={DOLPHIN} /></svg>
          <svg className="waves" viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0 10 Q 25 2 50 10 T 100 10 T 150 10 T 200 10 T 250 10 T 300 10 T 350 10 T 400 10" /></svg>
        </div>
        {project && project.archived && !t && <div className="face-note">This project is archived. Restore it to track more time.</div>}
      </div>


      {/* Start (Resume once paused) and Stop, then a smaller centered Save and Discard.
          Save and Discard are greyed while running or with nothing to save; without a category it
          just marks the Category label red. */}
      <div className="controls">
        {/* Symbols instead of words; the names stay as labels for hover and screen readers. */}
        <button className="big-btn go" onClick={start} disabled={disabled || running} aria-label={t && !running ? "Resume" : "Start"} title={t && !running ? "Resume" : "Start"}><Icon name="play" size={36} /></button>
        <button className="big-btn halt" onClick={stop} disabled={!running} aria-label="Stop" title="Stop"><Icon name="stop" size={32} /></button>
      </div>
      <div className="controls-2">
        <button className="big-btn save" onClick={save} disabled={running || !t || secs < 1} aria-label="Save" title="Save"><Icon name="floppy" size={26} stroke={1.8} /></button>
        <button className="big-btn toss" onClick={discard} disabled={!t || running} aria-label="Discard" title="Discard"><Icon name="bin" size={26} stroke={1.8} /></button>
      </div>

      <div className="picker">
        <div className="label">Category</div>
        <div className={"pills" + (needCat && !pick.categoryId ? " need" : "")} ref={pillsRef} key={needCat && !pick.categoryId ? "need" + needCat : "ok"}>
          {cats.map(x => <button key={x.id} type="button" className="pill" aria-pressed={pick.categoryId === x.id} disabled={disabled}
            style={pick.categoryId === x.id ? pillStyle(x.color) : null}
            onClick={() => setPick(pick.categoryId === x.id ? "" : x.id, "")}>{x.name}</button>)}
          {!cats.length && <span className="small muted">Add work categories in Setup.</span>}
        </div>
        {subs.length > 0 && <>
          <div className="label" style={{ marginTop: 14 }}>Type</div>
          <div className="pills">
            {subs.map(x => <button key={x.id} type="button" className="pill sub" aria-pressed={pick.subId === x.id} disabled={disabled}
              style={pick.subId === x.id ? pillStyle(cat.color) : null}
              onClick={() => setPick(pick.categoryId, pick.subId === x.id ? "" : x.id)}>{x.name}</button>)}
          </div>
        </>}
      </div>
      {editing && <TimerEdit seconds={secs} onSave={setTime} onClose={() => setEditing(false)} />}
    </div>
  );
}

// Popup for setting the stopwatch's time by hand.
function TimerEdit({ seconds, onSave, onClose }) {
  const [v, setV] = useState(seconds ? E.workedText(seconds) : "");
  const [tried, setTried] = useState(false);
  const secs = E.parseWorked(v);
  const bad = tried && secs === null;
  const save = () => { if (secs === null) { setTried(true); return; } onSave(secs); };
  return (
    <Sheet title="Edit Time" width={340} onClose={onClose}
      footer={<><span className="grow" /><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-solid" onClick={save}>Save</button></>}>
      <Field label="Worked">
        <input className={"input num" + (bad ? " invalid" : "")} value={v} placeholder="00:00" aria-label="Worked" aria-invalid={bad || undefined}
          onChange={e => setV(e.target.value.replace(/[^0-9:.]/g, "").slice(0, 7))} onKeyDown={e => e.key === "Enter" && save()} />
      </Field>
    </Sheet>
  );
}

function HomeView({ data, update, openSheet, toast, selectedId, setSelectedId }) {
  return (
    <div className="home">
      <ProjectList data={data} update={update} selectedId={selectedId} setSelectedId={setSelectedId} openSheet={openSheet} />
      <div className="col-right"><Stopwatch data={data} update={update} selectedId={selectedId} toast={toast} /></div>
    </div>
  );
}

// ---------- admin ----------
// Built to match GDBB's Setup: Categories (one narrow card per kind, a color
// tile, a name you edit in place, a trash button that archives) and
// Types (as in GDBB: pick a work category, add, then chips).
function AddRow({ placeholder, onAdd, label }) {
  const [v, setV] = useState("");
  const go = () => { const t = v.trim(); if (!t) return; onAdd(t); setV(""); };
  return (
    <div className="row add-row">
      <input className="input" value={v} placeholder={placeholder} aria-label={label || placeholder}
        onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") go(); }} />
      <button className="btn btn-solid btn-icon add-plus" aria-label="Add" title="Add" onClick={go}><Icon name="plus" size={18} /></button>
    </div>
  );
}

// Category color themes. No color means no capsule.
const CAT_COLORS = ["#e5484d", "#f76b15", "#ffb224", "#f5d90a", "#99d52a", "#46a758", "#12a594", "#05a2c2", "#0091ff", "#3e63dd",
  "#6e56cf", "#8e4ec6", "#ab4aba", "#d6409f", "#e93d82", "#ff6b81", "#a18072", "#978365", "#2f9e8f", "#5b5bd6"];
// Readable text for a capsule tinted with a category color: the color darkened
// toward ink, more so for light colors like yellow and lime.
function capInk(color) {
  const n = parseInt(color.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const keep = light > 0.6 ? 38 : light > 0.45 ? 50 : 62;
  return `color-mix(in srgb, ${color} ${keep}%, #1b1d2b)`;
}
const capStyle = color => color ? { background: color + "24", color: capInk(color), boxShadow: `inset 0 0 0 1px ${color}55` } : null;
function ColorTile({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    // Open above the tile when there isn't room below it.
    const r = ref.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 220 && r.top > 220);
    const off = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span className="color-tile-wrap" ref={ref}>
      <button type="button" className={"color-tile" + (value ? "" : " none")} style={value ? { background: value } : null}
        aria-label="Category color" aria-expanded={open} title="Color" onClick={() => setOpen(o => !o)} />
      {open && (
        <div className={"color-pop" + (up ? " up" : "")} role="dialog" aria-label="Choose a color">
          <div className="color-grid">
            {CAT_COLORS.map(c => (
              <button type="button" key={c} className={"color-dot" + (value === c ? " sel" : "")} style={{ background: c }} aria-label={c} onClick={() => { onChange(c); setOpen(false); }} />
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm color-none" onClick={() => { onChange(null); setOpen(false); }}>No color</button>
        </div>
      )}
    </span>
  );
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
function stampDay(iso) { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; }

// Sorted by name. The order only refreshes when a name field loses focus or a
// category is added, archived or restored, so rows never jump while typing.
// New categories wait at the bottom until their name field is left.
function CategoryCard({ listKey, title, noun, data, update, toast }) {
  const all = data[listKey];
  const live = all.filter(c => !c.archived);
  const archived = all.filter(c => c.archived).sort(byName);
  const sorted = () => live.slice().sort(byName).map(c => c.id);
  const [order, setOrder] = useState(sorted);
  const [focusId, setFocusId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [tick, setTick] = useState(0);
  const resort = () => setTick(t => t + 1);
  useEffect(() => { if (tick) setOrder(sorted()); }, [tick]);
  const known = new Set(order);
  const cats = order.map(id => live.find(c => c.id === id)).filter(Boolean).concat(live.filter(c => !known.has(c.id)));
  async function archive(c) {
    if (!(await askConfirm("", "Archive", { noMessage: true }))) return;
    update(d => { const x = byId(d[listKey], c.id); if (x) { x.archived = true; x.archivedAt = new Date().toISOString(); } });
    resort();
    toast(`${c.name} archived`);
  }
  function restore(c) {
    update(d => { const x = byId(d[listKey], c.id); if (x) { x.archived = false; delete x.archivedAt; } });
    resort();
    toast(`${c.name} restored`);
  }
  const setCat = (id, fn) => update(d => fn(byId(d[listKey], id)));
  return (
    <div className="card">
      <div className="card-head"><span className="card-title">{title}</span></div>
      <AddRow placeholder="" label={`New ${noun}`} onAdd={name => {
        const id = uid();
        update(d => { d[listKey].push(Object.assign({ id, name, archived: false }, listKey === "workCategories" ? { subs: [] } : {})); });
        setFocusId(id);
      }} />
      {cats.map(c => (
        <div key={c.id} className="set-row nowrap">
          <ColorTile value={c.color || null} onChange={col => setCat(c.id, x => { if (col) x.color = col; else delete x.color; })} />
          <input className="input name" value={c.name} aria-label={`${noun} name`} autoFocus={focusId === c.id}
            onChange={e => setCat(c.id, x => { x.name = e.target.value; })}
            onBlur={e => {
              if (!e.target.value.trim()) setCat(c.id, x => { x.name = "Untitled"; });
              if (focusId === c.id) setFocusId(null);
              resort();
            }} />
          <button className="btn btn-ghost btn-icon" aria-label={`Archive ${c.name}`} title="Archive" onClick={() => archive(c)}><Icon name="trash" size={16} /></button>
        </div>
      ))}
      {archived.length > 0 && (
        <div className="archived">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowArchived(v => !v)} aria-expanded={showArchived}>
            {showArchived ? "Hide archived" : `Archived (${archived.length})`}
          </button>
          {showArchived && archived.map(c => (
            <div key={c.id} className="set-row archived-row">
              <span className="grow">{c.name}</span>
              <span className="tiny faint">archived {stampDay(c.archivedAt)}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => restore(c)}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// GDBB's Types card: types narrow down a work category.
function TypesCard({ data, update }) {
  const cats = data.workCategories.filter(c => !c.archived).sort(byName);
  const [catId, setCatId] = useState("");
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const pick = cats.some(c => c.id === catId) ? catId : "";
  const add = () => { const t = name.trim(); if (!t || !pick) return; update(d => { byId(d.workCategories, pick).subs.push({ id: uid(), name: t, archived: false }); }); setName(""); };
  const setSub = (cid, sid, fn) => update(d => fn(byId(byId(d.workCategories, cid).subs, sid)));
  const group = cats.filter(c => c.subs.some(s => !s.archived));
  const archivedSubs = cats.flatMap(c => c.subs.filter(s => s.archived).map(s => ({ s, c }))).sort((a, b) => byName(a.s, b.s));
  return (
    <div className="card">
      <div className="card-head"><span className="card-title">Types</span></div>
      <div className="row add-row">
        <select className={"input" + (pick ? "" : " is-empty")} style={{ width: 190, flex: "none" }} aria-label="Work category" value={pick} onChange={e => setCatId(e.target.value)}>
          <option value="" disabled hidden>Work Category</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" value={name} aria-label="Type" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
        <button className="btn btn-solid btn-icon add-plus" aria-label="Add type" title="Add" onClick={add} disabled={!pick || !name.trim()}><Icon name="plus" size={18} /></button>
      </div>
      {group.map(c => (
        <div key={c.id} className="set-row" style={{ alignItems: "flex-start" }}>
          <div style={{ width: 160, flex: "none", paddingTop: 4 }} className="small">{c.name}</div>
          <div className="chips grow">
            {c.subs.filter(s => !s.archived).sort(byName).map(s => (
              <span key={s.id} className="chip">
                {editing === s.id ? (
                  <input className="input" autoFocus defaultValue={s.name} aria-label="Type name" style={{ minHeight: 26, height: 26, padding: "2px 6px", width: 130, fontSize: 13 }}
                    onBlur={e => { const n = e.target.value.trim(); if (n) setSub(c.id, s.id, x => { x.name = n; }); setEditing(null); }}
                    onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditing(null); }} />
                ) : (
                  <button className="chip-name" onClick={() => setEditing(s.id)} aria-label={`Rename ${s.name}`}>{s.name}</button>
                )}
                <button aria-label={`Archive ${s.name}`} title="Archive" onClick={() => setSub(c.id, s.id, x => { x.archived = true; x.archivedAt = new Date().toISOString(); })}><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        </div>
      ))}
      {archivedSubs.length > 0 && (
        <div className="archived">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowArchived(v => !v)} aria-expanded={showArchived}>
            {showArchived ? "Hide archived" : `Archived (${archivedSubs.length})`}
          </button>
          {showArchived && archivedSubs.map(({ s, c }) => (
            <div key={s.id} className="set-row archived-row">
              <span className="grow">{s.name} <span className="tiny faint">in {c.name}</span></span>
              <span className="tiny faint">archived {stampDay(s.archivedAt)}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setSub(c.id, s.id, x => { x.archived = false; delete x.archivedAt; })}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Hidden for now (sign out and backup). Render it in AdminView to bring it back.
function AccountCard({ data, session, local, onSignOut }) {
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `business-time-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return (
    <section className="card">
      <div className="card-head"><span className="card-title">Account</span></div>
      <p className="small muted">{local ? "Preview mode: saved in this browser only." : <>Signed in as <b>{session && session.user.email}</b>.</>}</p>
      <div className="row wrap" style={{ marginTop: 10 }}>
        <button className="btn btn-secondary" onClick={exportJson}><Icon name="download" size={16} />Download a backup</button>
        <button className="btn btn-secondary" onClick={onSignOut}><Icon name="out" size={16} />{local ? "Leave preview" : "Sign out"}</button>
      </div>
    </section>
  );
}

const adminMemory = { sec: "categories" };
function AdminView(props) {
  const [sec, setSecRaw] = useState(adminMemory.sec);
  const setSec = v => { adminMemory.sec = v; setSecRaw(v); };
  return (
    <div className="admin">
      <div className="subnav" role="group" aria-label="Setup sections">
        {[["categories", "Categories"], ["subs", "Types"]].map(([k, l]) => (
          <button key={k} aria-pressed={sec === k} onClick={() => setSec(k)}>{l}</button>
        ))}
      </div>
      {sec === "categories" && (
        <div className="setup-cols">
          <CategoryCard listKey="projectCategories" title="Project" noun="project category" {...props} />
          <CategoryCard listKey="workCategories" title="Work" noun="work category" {...props} />
        </div>
      )}
      {sec === "subs" && <div className="types-cols"><TypesCard {...props} /></div>}
    </div>
  );
}

// ---------- auth ----------
// Same as GDBB's: log in, create an account, or get a reset link. Accounts are
// shared with Plantalog (same Supabase project); a new account starts with the
// default categories and no projects.
function AuthScreen() {
  const [mode, setMode] = useState("in"); // in | up | reset
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault();
    if (!sb()) { setMsg("Can’t reach the server right now."); return; }
    setBusy(true); setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await sb().auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      } else if (mode === "up") {
        const { data, error } = await sb().auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) setMsg("Check your email to confirm, then log in.");
      } else {
        const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setMsg("If that email has an account, a reset link is on its way.");
      }
    } catch (err) { setMsg(err.message || "Something went wrong."); }
    setBusy(false);
  }
  const to = m => { setMode(m); setMsg(null); };
  const title = mode === "in" ? "Log In" : mode === "up" ? "Create Account" : "Reset Password";
  return (
    <div className="app">
      <Glitter />
      <div className="auth">
        <div className="auth-brand"><Mark size={64} /><h1>Business Time</h1><div className="kicker" style={{ marginTop: 6 }}>Delphina Photography</div></div>
        <form className="card stack auth-card" onSubmit={go}>
          <h2 className="auth-title">{title}</h2>
          {mode === "reset" && <p className="small muted" style={{ margin: 0 }}>Enter your email and we’ll send a link to set a new password.</p>}
          <div className="field"><label>Email</label><input className="input" type="email" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} /></div>
          {mode !== "reset" && <div className="field"><label>Password</label><input className="input" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} required minLength={6} value={pw} onChange={e => setPw(e.target.value)} /></div>}
          {msg && <p className="small auth-msg">{msg}</p>}
          <button className="btn btn-solid btn-block" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Log In" : mode === "up" ? "Create Account" : "Send Reset Link"}</button>
          <div className="row wrap small auth-links">
            {mode === "in" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => to("reset")}>Forgot password?</button>}
            {mode === "in" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => to("up")}>Create an account</button>}
            {mode !== "in" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => to("in")}>Back to log in</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function NewPasswordSheet({ onClose, toast }) {
  const [pw, setPw] = useState("");
  return (
    <Sheet title="Set a New Password" onClose={onClose} narrow
      footer={<><span className="grow" /><button className="btn btn-solid" onClick={async () => {
        const { error } = await sb().auth.updateUser({ password: pw });
        if (error) toast(error.message); else { toast("Password updated"); onClose(); }
      }}>Save</button></>}>
      <Field label="New password"><input className="input" type="password" autoComplete="new-password" minLength={6} value={pw} onChange={e => setPw(e.target.value)} /></Field>
    </Sheet>
  );
}

// ---------- app ----------
// The same rotating loading messages as GDBB, one per load, in order.
const LOADING_MESSAGES = [
  "What a cool guy Bacon is...",
  "Right this way, Glitter Queen...",
  "WHAT IS WRONG WITH ME TODAY?!...",
  "I'll have the shrimp tacos...",
  "What even is money? ¯\\_(ツ)_/¯...",
  "What the hell's that's goin' on out there? POPPERRRRRS...",
  "Point for me...",
  "Budgeting isn't hard, fucktard...",
];

function App() {
  const [loadingMsg] = useState(() => {
    const i = (parseInt(safeLS.get("bt-load-msg"), 10) + 1) % LOADING_MESSAGES.length || 0;
    safeLS.set("bt-load-msg", String(i));
    return LOADING_MESSAGES[i];
  });
  const [held, setHeld] = useState(true); // keep the loading screen up long enough to read, like GDBB
  useEffect(() => { const t = setTimeout(() => setHeld(false), 3000); return () => clearTimeout(t); }, []);
  const [phase, setPhase] = useState("loading"); // loading | auth | ready | error
  const [session, setSession] = useState(null);
  const [local, setLocal] = useState(() => /[?&]local\b/.test(location.search));
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("saved");
  const [conflict, setConflict] = useState(false);
  const [tab, setTab] = useState(() => safeLS.get("bt-tab") || "home");
  const [sheet, setSheet] = useState(null);
  const [selectedId, setSelectedId] = useState(null); // every load starts with no project selected
  const [toastMsg, setToastMsg] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState(null);
  const versionRef = useRef(0);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const dataRef = useRef(null);
  const userRef = useRef(null);
  const skipSaveRef = useRef(true);
  dataRef.current = data;

  const toast = useCallback(m => { setToastMsg(m); clearTimeout(toast.t); toast.t = setTimeout(() => setToastMsg(null), 2600); }, []);
  useEffect(() => { safeLS.set("bt-tab", tab); window.scrollTo(0, 0); }, [tab]);

  const loadFor = useCallback(async user => {
    userRef.current = user;
    try {
      const r = await Store.loadRemote(user.id);
      versionRef.current = r.version; skipSaveRef.current = true; dirtyRef.current = false;
      setData(r.data); setPhase("ready"); setStatus("saved");
    } catch (e) {
      console.error(e);
      setErr(e.message || String(e)); setPhase("error");
    }
  }, []);

  // boot
  useEffect(() => {
    if (local) {
      skipSaveRef.current = true;
      setData(Store.loadLocal() || defaultData()); setPhase("ready");
      return;
    }
    if (!sb()) { setErr("Couldn’t load the sync library. Check the connection and reload."); setPhase("error"); return; }
    sb().auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadFor(session.user); else setPhase("auth");
    });
    const { data: sub } = sb().auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_IN" && s && (!userRef.current || userRef.current.id !== s.user.id)) { setPhase("loading"); loadFor(s.user); }
      if (event === "SIGNED_OUT") { userRef.current = null; setData(null); setPhase("auth"); }
    });
    return () => sub && sub.subscription && sub.subscription.unsubscribe();
  }, [local]);

  // save (debounced)
  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const d = dataRef.current;
    if (!d || !dirtyRef.current) return;
    if (local) { Store.saveLocal(d); dirtyRef.current = false; setStatus("saved"); return; }
    if (!userRef.current) return;
    setStatus("saving");
    try {
      const r = await Store.saveRemote(userRef.current.id, d, versionRef.current);
      if (r.conflict) { setConflict(true); setStatus("error"); return; }
      versionRef.current = r.version;
      if (dataRef.current === d) dirtyRef.current = false; else timerRef.current = setTimeout(flush, 400);
      setStatus(dirtyRef.current ? "saving" : "saved");
    } catch (e) {
      console.error(e); setStatus("error");
      timerRef.current = setTimeout(flush, 5000);
    }
  }, [local]);
  useEffect(() => {
    if (!data) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    dirtyRef.current = true; setStatus("saving");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [data]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) flush(); };
    const onVisible = async () => {
      if (document.hidden || local || !userRef.current || dirtyRef.current) return;
      const v = await Store.remoteVersion(userRef.current.id);
      if (v && v > versionRef.current) loadFor(userRef.current);
    };
    const onUnload = e => { if (dirtyRef.current) { flush(); e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("visibilitychange", onHide); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("beforeunload", onUnload); };
  }, [flush, local]);

  const update = useCallback(fn => {
    setData(prev => { const next = clone(prev); fn(next); return next; });
  }, []);
  const openSheet = useCallback(s => setSheet(s), []);
  const close = useCallback(() => setSheet(null), []);

  async function signOut() {
    await flush();
    if (local) { location.replace(location.pathname); return; }
    await sb().auth.signOut();
  }
  async function resolveConflict(keepMine) {
    const v = await Store.remoteVersion(userRef.current.id);
    setConflict(false);
    if (keepMine) { versionRef.current = v || versionRef.current; dirtyRef.current = true; flush(); }
    else loadFor(userRef.current);
  }

  if (phase === "loading" || held) return <div className="app"><Glitter /><div className="loading"><Mark size={64} /><p style={{ marginTop: 12 }}>{loadingMsg}</p></div></div>;
  if (phase === "auth") return <AuthScreen />;
  if (phase === "error") return (
    <div className="app"><Glitter /><div className="loading">
      <Mark size={64} />
      <p style={{ marginTop: 12 }}>Something went wrong loading your projects.</p>
      <p className="small faint" style={{ marginTop: 6 }}>{err}</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={() => location.reload()}>Try again</button>
        {!local && <button className="btn btn-ghost" onClick={() => sb() && sb().auth.signOut().then(() => setPhase("auth"))}>Sign out</button>}
      </div>
    </div></div>
  );

  const selProject = byId(data.projects, selectedId);
  const sel = data.timer ? data.timer.projectId : selProject ? selectedId : null;
  // Picking another project while time is running or unsaved moves that time to it
  // (for when the wrong project was picked). Archived projects can't take it.
  const pickProject = id => {
    setSelectedId(id);
    const p = byId(data.projects, id);
    if (data.timer && data.timer.projectId !== id && p && !p.archived) update(d => { d.timer.projectId = id; });
  };

  // On Home, a click anywhere that isn't on a project card, the timer, a control or a popup selects no project.
  const deselect = e => {
    if (tab === "home" && !e.target.closest(".proj, .watch, button, input, select, a, .overlay, .dp-pop")) pickProject(null);
  };

  return (
    <div className="app" onClick={deselect}>
      <Glitter />
      <Constellation className="sky" />
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <Mark size={48} />
            <div className="brand-name">Business Time<span>Delphina Photography</span></div>
          </div>
          <nav className="tabs-top" aria-label="Sections">
            {[["home", "Home"], ["admin", "Setup"]].map(([k, l]) => <button key={k} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>{l}</button>)}
          </nav>
        </header>

        {conflict && (
          <div className="banner">
            <span className="grow">Your projects were changed on another device.</span>
            <button className="btn btn-secondary btn-sm" onClick={() => resolveConflict(false)}>Load that version</button>
            <button className="btn btn-danger btn-sm" onClick={() => resolveConflict(true)}>Keep this one</button>
          </div>
        )}

        <main>
          {tab === "home" && <HomeView data={data} update={update} openSheet={openSheet} toast={toast} selectedId={sel} setSelectedId={pickProject} />}
          {tab === "admin" && <AdminView data={data} update={update} toast={toast} session={session} local={local} onSignOut={signOut} />}
        </main>
      </div>

      {sheet && sheet.type === "project" && <ProjectSheet data={data} update={update} project={sheet.project} onClose={close} toast={toast} onCreated={id => setSelectedId(id)} />}
      {sheet && sheet.type === "record" && <RecordSheet data={data} update={update} init={sheet.init} onClose={close} toast={toast} />}
      {recovery && <NewPasswordSheet onClose={() => setRecovery(false)} toast={toast} />}
      <ConfirmHost />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

// If anything crashes while drawing, show a way back instead of a blank page.
// Saved data is untouched; a reload usually fixes it (say, after a half-loaded update).
class CrashGuard extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.error(err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="app"><Glitter /><div className="loading">
        <Mark size={64} />
        <p style={{ marginTop: 12 }}>Something went wrong on this screen. Your saved work is safe.</p>
        <p className="small faint" style={{ marginTop: 6 }}>{String(this.state.err && this.state.err.message || this.state.err)}</p>
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="btn btn-solid" onClick={() => location.reload()}>Reload</button>
        </div>
      </div></div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<CrashGuard><App /></CrashGuard>);
