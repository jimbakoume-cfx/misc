"use strict";
/* Confiance Kiosk console. No framework: small, fast, and CSP-friendly (no inline scripts). */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  pkg: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="m5 12 5 5L20 7"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>', chevron: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
};
const ic = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] ?? ""}</svg>`;
const ago = (ts) => { if (!ts) return "never"; const s = Math.max(0, (Date.now() - ts) / 1000); return s < 90 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const when = (ts) => ts ? new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const hhmm = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const initials = (e) => (e || "?").split(/[@.\s_-]/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?";
const canWrite = () => me?.role === "admin";
const ro = () => (canWrite() ? "" : "disabled");

// ---------- loading bar: visible on every request ----------
let inflight = 0, barStartedAt = 0, barTick = 0, barWidth = 0;
function barStart() {
  if (inflight++ > 0) return;
  barStartedAt = Date.now(); barWidth = 8;
  const bar = $("#loadbar"), fill = $("#loadbar i");
  fill.style.transition = "none"; fill.style.width = "0"; void fill.offsetWidth; fill.style.transition = "";
  bar.classList.add("on"); fill.style.width = barWidth + "%";
  clearInterval(barTick);
  barTick = setInterval(() => { barWidth += (92 - barWidth) * 0.14; fill.style.width = barWidth + "%"; }, 220);
}
function barEnd() {
  if (--inflight > 0) return;
  inflight = 0;
  const wait = Math.max(0, 260 - (Date.now() - barStartedAt)); // always visible long enough to notice
  setTimeout(() => {
    if (inflight > 0) return;
    clearInterval(barTick);
    const fill = $("#loadbar i"); fill.style.width = "100%";
    setTimeout(() => { if (inflight === 0) $("#loadbar").classList.remove("on"); }, 260);
  }, wait);
}

// ---------- API + cache ----------
let me = null, tab = "overview";
const cache = new Map(); // GET url -> last response (shown instantly, then refreshed)
async function api(method, url, body, raw) {
  barStart();
  try {
    const res = await fetch(url, {
      method, credentials: "same-origin",
      headers: { "X-Requested-With": "confiance-dashboard", ...(body && !raw ? { "Content-Type": "application/json" } : raw ? { "Content-Type": "application/octet-stream" } : {}) },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== "/api/login") { showLogin(); throw new Error("Signed out"); }
    if (res.status === 403 && data.need2faSetup) { if (me) { me.mustSetup2fa = true; go("account"); } throw new Error(data.error); }
    if (!res.ok) { const err = new Error(data.error || `Error ${res.status}`); err.data = data; throw err; }
    if (method === "GET") cache.set(url, data); else cache.clear();
    return data;
  } finally { barEnd(); }
}
const get = (url) => api("GET", url);

// ---------- toasts, confirm, busy ----------
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = "toast" + (kind === "err" ? " err" : "");
  el.innerHTML = `${ic(kind === "err" ? "alert" : "check")}<div>${esc(msg)}</div>`;
  $("#toasts").append(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, kind === "err" ? 6000 : 3200);
}
const fail = (e) => { if (e.message !== "Signed out") toast(e.message, "err"); };
function ask({ title, body = "", ok = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const d = $("#cfm");
    $("#cfmBody").innerHTML = `<div class="hd"><div class="ic ${danger ? "bad" : "info"}" style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center">${ic(danger ? "alert" : "info")}</div><div class="grow"><h2>${esc(title)}</h2></div></div>
      <div class="bd" style="color:var(--text-2)">${body}</div>
      <div class="ft" style="justify-content:flex-end"><button class="btn ghost" id="cfmNo">Cancel</button><button class="btn ${danger ? "danger" : ""}" id="cfmOk">${esc(ok)}</button></div>`;
    let done = false;
    const finish = (v) => { if (done) return; done = true; d.close(); resolve(v); };
    $("#cfmOk").onclick = () => finish(true); $("#cfmNo").onclick = () => finish(false);
    d.onclose = () => finish(false);
    d.showModal(); $("#cfmOk").focus();
  });
}
async function busy(btn, fn) {
  if (btn) btn.classList.add("busy");
  try { return await fn(); } catch (e) { fail(e); } finally { if (btn) btn.classList.remove("busy"); }
}
function closeDlg() { $("#dlg").close(); }

// ---------- skeletons ----------
const skCards = (n = 4) => `<div class="grid g4">${Array.from({ length: n }, () => `<div class="card stat"><div class="sk t" style="width:50%"></div><div class="sk h"></div><div class="sk t" style="width:70%"></div></div>`).join("")}</div>`;
const skTable = (rows = 7) => `<div class="card tablecard"><div class="pad"><div class="sk t" style="width:30%;height:34px"></div></div>${Array.from({ length: rows }, () => `<div class="sk row"></div>`).join("")}</div>`;
const skForm = () => `<div class="grid g2">${[0, 1].map(() => `<div class="card pad"><div class="sk t" style="width:40%"></div><div class="sk t"></div><div class="sk t"></div><div class="sk h" style="width:100%"></div></div>`).join("")}</div>`;

// ---------- shell: navigation ----------
const NAV = [
  ["Fleet", [["overview", "Overview", "grid"], ["devices", "Devices", "phone"], ["groups", "Groups & apps", "layers"]]],
  ["Deploy", [["provision", "Add devices", "qr"], ["releases", "App versions", "pkg"]]],
  ["Admin", [["settings", "Settings", "sliders"], ["account", "Account", "user"], ["audit", "Activity", "activity"]]],
];
function buildNav() {
  $("#nav").innerHTML = NAV.map(([g, items]) => `<div class="navgroup">${g}</div>` + items.map(([k, l, i]) => `<button data-tab="${k}">${ic(i)}<span>${l}</span><span class="badge warn hidden" id="nb-${k}"></span></button>`).join("")).join("");
}
function showLogin() { clearInterval(refreshTimer); $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); cache.clear(); pageData = {}; }
const prefetchedAt = {};
function prefetch(t) { // warm the data for a page when the pointer reaches its menu entry
  const p = pages[t]; if (!p || Date.now() - (prefetchedAt[t] ?? 0) < 4000) return;
  prefetchedAt[t] = Date.now();
  p.load().then((d) => { pageData[t] = d; }).catch(() => {});
}
$("#nav").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { location.hash = "#/" + b.dataset.tab; } });
$("#nav").addEventListener("pointerenter", (e) => { const b = e.target.closest?.("[data-tab]"); if (b) prefetch(b.dataset.tab); }, true);
$("#nav").addEventListener("focusin", (e) => { const b = e.target.closest?.("[data-tab]"); if (b) prefetch(b.dataset.tab); });
$("#menu").onclick = () => { $("#side").classList.toggle("open"); $("#scrim").classList.toggle("open"); };
$("#scrim").onclick = () => { $("#side").classList.remove("open"); $("#scrim").classList.remove("open"); };
window.addEventListener("hashchange", () => { if (me) go(routeFromHash()); });
const routeFromHash = () => { const t = location.hash.replace(/^#\/?/, ""); return pages[t] ? t : "overview"; };

// ---------- page runner: instant from cache, then refresh in the background ----------
let pageData = {}, navId = 0, lastSig = "", refreshTimer = null;
function setHead(p, data) {
  $("#pageTitle").textContent = p.title; $("#pageSub").textContent = typeof p.sub === "function" ? p.sub(data) : p.sub ?? "";
  $("#pageActions").innerHTML = p.actions ? p.actions(data) : "";
}
function paint(t, data) {
  const p = pages[t];
  setHead(p, data);
  $("#view").innerHTML = p.render(data);
  lastSig = JSON.stringify(data);
  p.bind?.(data);
  if (p.after) p.after(data);
}
async function go(t, { quiet = false } = {}) {
  const my = ++navId; const changed = t !== tab; tab = t;
  if (t !== "devices") $("#bulk").classList.remove("show");
  const p = pages[t];
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  $("#side").classList.remove("open"); $("#scrim").classList.remove("open");
  document.title = `${p.title} · Confiance Kiosk`;
  const cached = pageData[t];
  if (!quiet) {
    if (cached) paint(t, cached);                       // show what we have immediately…
    else { setHead(p, undefined); $("#view").innerHTML = p.skeleton(); }  // …or a placeholder right away
    if (changed) window.scrollTo(0, 0);
  }
  clearInterval(refreshTimer);
  if (p.live) refreshTimer = setInterval(() => { if (!document.hidden && !$("#dlg").open && !$("#cfm").open && !isTyping()) go(tab, { quiet: true }); }, 20000);
  try {
    const data = await p.load();
    pageData[t] = data;
    if (my !== navId) return;                            // user already moved on
    if (JSON.stringify(data) !== lastSig || !cached) { if (!(quiet && isTyping())) paint(t, data); }
    updateBadges(data, t);
  } catch (e) { if (my === navId) { fail(e); if (!cached) $("#view").innerHTML = `<div class="card empty"><div class="ico">${ic("alert")}</div><h3>Could not load this page</h3><p>${esc(e.message)}</p><button class="btn" id="retry">Try again</button></div>`; $("#retry")?.addEventListener("click", () => go(t)); } }
}
const isTyping = () => { const a = document.activeElement; return a && $("#view").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.id !== "q"; };
const refresh = () => go(tab, { quiet: false });
function updateBadges(data, t) {
  if (t === "overview" && data?.[0]) { const n = data[0].pendingApproval; const b = $("#nb-devices"); b.textContent = n; b.classList.toggle("hidden", !n); }
  if (t === "devices" && data?.[0]) { const n = data[0].filter((d) => !d.approved).length; const b = $("#nb-devices"); b.textContent = n; b.classList.toggle("hidden", !n); }
}

// ---------- reusable bits ----------
const statePill = (d) => d.state === "online" ? `<span class="pill ok">Online</span>` : d.state === "stale" ? `<span class="pill warn">Missed check-in</span>` : `<span class="pill bad">Offline</span>`;
const battery = (d) => { if (d.battery == null || d.battery < 0) return `<span class="muted">—</span>`; const c = d.battery <= 20 ? "low" : d.battery <= 50 ? "mid" : ""; return `<span class="meter ${c}"><i><b style="width:${d.battery}%"></b></i>${d.battery}%${d.charging ? ` <span title="Charging" style="color:var(--ok)">${ic("zap")}</span>` : ""}</span>`; };
const stat = ({ label, value, sub = "", icon, tone = "", go: g, filter }) => `<div class="card stat ${tone} ${g ? "link" : ""}" ${g ? `data-go="${g}" ${filter ? `data-filter="${filter}"` : ""} tabindex="0"` : ""}><div class="k"><span class="ico">${ic(icon)}</span>${label}</div><div class="v">${value}</div><div class="d">${sub}</div></div>`;
const check = (id, label, hint, on, extra = "") => `<label class="check"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${extra}><span>${label}${hint ? `<small>${hint}</small>` : ""}</span></label>`;

// =====================================================================
// PAGES
// =====================================================================
const pages = {};

// ---------- Overview ----------
pages.overview = {
  title: "Overview", sub: "Your fleet at a glance", live: true,
  skeleton: () => skCards(4) + `<div class="grid g2 section">${skForm()}</div>`,
  load: () => Promise.all([get("/api/overview"), get("/api/audit")]),
  render([o, audit]) {
    const total = o.total || 0, pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const attention = [];
    if (o.pendingApproval) attention.push({ tone: "warn", icon: "shield", t: `${o.pendingApproval} new phone${o.pendingApproval > 1 ? "s" : ""} waiting for approval`, d: "They are locked down but show no apps until you approve them.", go: "devices", filter: "pending", cta: "Review" });
    if (o.notLocked) attention.push({ tone: "bad", icon: "alert", t: `${o.notLocked} phone${o.notLocked > 1 ? "s" : ""} not managed or not locked`, d: "Installed by hand or released. They cannot be controlled.", go: "devices", filter: "unmanaged", cta: "View" });
    if (o.offline) attention.push({ tone: "bad", icon: "phone", t: `${o.offline} phone${o.offline > 1 ? "s" : ""} offline`, d: "No check-in for over 30 minutes.", go: "devices", filter: "offline", cta: "View" });
    if (o.lowBattery) attention.push({ tone: "warn", icon: "zap", t: `${o.lowBattery} phone${o.lowBattery > 1 ? "s" : ""} with low battery`, d: "20% or less and not charging.", go: "devices", filter: "all", cta: "View" });
    if (o.outdated) attention.push({ tone: "info", icon: "pkg", t: `${o.outdated} phone${o.outdated > 1 ? "s" : ""} on an old app version`, d: `Latest is ${esc(o.currentVersion ?? "—")}.`, go: "releases", cta: "Update" });
    return `
    ${o.total === 0 ? `<div class="card empty"><div class="ico">${ic("phone")}</div><h3>No phones yet</h3><p>Create a setup code and set up your first phone. It takes about two minutes.</p><button class="btn" data-go="provision">${ic("plus")} Add your first phone</button></div>` : `
    <div class="grid g4">
      ${stat({ label: "Phones", value: o.total, sub: `${o.live}/${o.total} live for instant commands`, icon: "phone", go: "devices", filter: "all" })}
      ${stat({ label: "Online now", value: o.online, sub: `${pct(o.online)}% of the fleet`, icon: "activity", tone: "ok", go: "devices", filter: "online" })}
      ${stat({ label: "Need attention", value: attention.filter((a) => a.tone !== "info").length, sub: attention.length ? "See the list below" : "All clear", icon: "alert", tone: attention.some((a) => a.tone === "bad") ? "bad" : attention.length ? "warn" : "ok" })}
      ${stat({ label: "Latest app version", value: esc(o.currentVersion ?? "—"), sub: o.outdated ? `${o.outdated} phone${o.outdated > 1 ? "s" : ""} to update` : "Everyone is up to date", icon: "pkg", go: "releases" })}
    </div>
    <div class="grid g2 section" style="grid-template-columns:repeat(auto-fit,minmax(380px,1fr))">
      <div class="card">
        <div class="hd"><div><h3>Needs attention</h3><p>Things worth a look right now</p></div></div>
        ${attention.length ? attention.map((a) => `<div class="todo"><div class="ic ${a.tone}">${ic(a.icon)}</div><div class="tx"><b>${a.t}</b><span>${a.d}</span></div><button class="btn ghost sm" data-go="${a.go}" ${a.filter ? `data-filter="${a.filter}"` : ""}>${a.cta}</button></div>`).join("") : `<div class="todo"><div class="ic ok">${ic("check")}</div><div class="tx"><b>Everything looks good</b><span>No phones need your attention.</span></div></div>`}
      </div>
      <div class="grid" style="align-content:start">
        <div class="card pad">
          <h3>Fleet status</h3>
          <div class="split" aria-hidden="true"><i class="on" style="width:${pct(o.online)}%"></i><i class="st" style="width:${pct(o.stale)}%"></i><i class="off" style="width:${pct(o.offline)}%"></i></div>
          <div class="legend"><span><b>${o.online}</b> online</span><span><b>${o.stale}</b> missed a check-in</span><span><b>${o.offline}</b> offline</span></div>
          <p class="hint" style="margin-top:14px">${o.push ? "Buttons reach live phones within seconds; others pick them up at their next check-in." : "Instant commands are not configured, so buttons can take up to 5 minutes to reach a phone."} Updates every 20 s.</p>
        </div>
        <div class="card">
          <div class="hd"><div><h3>Recent activity</h3></div><button class="btn quiet sm" data-go="audit">View all ${ic("chevron")}</button></div>
          <div class="feed">${audit.filter((a) => !/^setup:|apk-download/.test(a.action)).slice(0, 6).map((a) => `<div class="it"><time>${hhmm(a.ts)}</time><span><b>${esc(a.actor.split("@")[0])}</b> ${esc(a.action.replace(/-/g, " "))} ${esc(a.detail)}</span></div>`).join("") || `<div class="it"><span class="muted">Nothing yet.</span></div>`}</div>
        </div>
      </div>
    </div>`}`;
  },
};

// ---------- Devices ----------
const dev = { q: "", group: "", status: "all", selected: new Set() };
let devAll = [], devGroups = [];
pages.devices = {
  title: "Devices", live: true,
  sub: ([all] = [[]]) => `${all?.length ?? 0} phone${all?.length === 1 ? "" : "s"} in your fleet`,
  skeleton: () => skTable(8),
  load: () => Promise.all([get("/api/devices"), get("/api/groups")]),
  actions: () => (canWrite() ? `<button class="btn" data-go="provision">${ic("plus")} Add phones</button>` : ""),
  render([all, groups]) {
    devAll = all; devGroups = groups;
    const c = { all: all.length, online: all.filter((d) => d.state === "online").length, offline: all.filter((d) => d.state !== "online").length, pending: all.filter((d) => !d.approved).length };
    const unmanaged = all.filter((d) => !d.deviceOwner).length;
    // A filter whose tab has vanished (e.g. the last waiting phone was just approved) falls back to "All".
    if ((dev.status === "pending" && !c.pending) || (dev.status === "unmanaged" && !unmanaged)) dev.status = "all";
    const seg = (k, l, n) => `<button data-st="${k}" class="${dev.status === k ? "on" : ""}">${l}<small>${n}</small></button>`;
    return `
    <div class="toolbar">
      <div class="search">${ic("search")}<input id="q" placeholder="Search name, model or serial" value="${esc(dev.q)}" autocomplete="off"></div>
      <div class="seg">${seg("all", "All", c.all)}${seg("online", "Online", c.online)}${seg("offline", "Not online", c.offline)}${c.pending ? seg("pending", "Needs approval", c.pending) : ""}${unmanaged ? seg("unmanaged", "Not managed", unmanaged) : ""}</div>
      <select id="fg" aria-label="Group"><option value="">All groups</option><option value="none">No group</option>${groups.map((g) => `<option value="${g.id}" ${String(dev.group) === String(g.id) ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
    </div>
    <div class="card tablecard"><div class="tablewrap"><table>
      <thead><tr><th class="chk"><input type="checkbox" id="all" aria-label="Select all"></th><th>Phone</th><th>Status</th><th>Battery</th><th>Group</th><th>App</th><th>Last seen</th><th></th></tr></thead>
      <tbody id="rows"></tbody></table></div></div>`;
  },
  bind() { drawRows(); },
};
function visibleDevices() {
  const q = dev.q.trim().toLowerCase();
  return devAll.filter((d) =>
    (!q || [d.name, d.model, d.serial, d.notes].some((x) => String(x ?? "").toLowerCase().includes(q))) &&
    (!dev.group || String(d.groupId ?? "none") === String(dev.group)) &&
    (dev.status === "all" || (dev.status === "online" && d.state === "online") || (dev.status === "offline" && d.state !== "online") || (dev.status === "pending" && !d.approved) || (dev.status === "unmanaged" && !d.deviceOwner)));
}
function drawRows() {
  const list = visibleDevices(), gname = (id) => devGroups.find((g) => g.id === id)?.name;
  const body = $("#rows"); if (!body) return;
  body.innerHTML = list.map((d) => `<tr class="clickable" data-id="${d.id}">
    <td class="chk"><input type="checkbox" class="sel" data-id="${d.id}" ${dev.selected.has(d.id) ? "checked" : ""} aria-label="Select ${esc(d.name)}"></td>
    <td><div class="dev"><div class="ph">${ic("phone")}</div><div><b>${esc(d.name)}</b><span>${esc(d.model || "Unknown model")}</span></div></div></td>
    <td><div class="row" style="gap:6px">${statePill(d)}${d.live ? `<span class="pill info plain" title="Connected for instant commands">${ic("zap")} live</span>` : ""}${!d.approved ? `<span class="pill warn">Needs approval</span>` : ""}${!d.deviceOwner ? `<span class="pill bad">Not managed</span>` : ""}${d.removing ? `<span class="pill warn">Removing…</span>` : ""}${d.released ? `<span class="pill bad">Released</span>` : ""}</div></td>
    <td>${battery(d)}</td>
    <td>${gname(d.groupId) ? esc(gname(d.groupId)) : `<span class="muted">—</span>`}${d.hasOverride ? ` <span class="pill plain">custom</span>` : ""}</td>
    <td class="nowrap">${esc(d.agentVersion ?? "—")}</td><td class="nowrap muted">${ago(d.lastSeen)}</td><td style="text-align:right;color:var(--text-3)">${ic("chevron")}</td></tr>`).join("") ||
    `<tr><td colspan="8"><div class="empty"><div class="ico">${ic("phone")}</div><h3>${devAll.length ? "No phones match" : "No phones yet"}</h3><p>${devAll.length ? "Try a different search or filter." : "Set up your first phone with a QR code."}</p>${devAll.length ? "" : `<button class="btn" data-go="provision">${ic("plus")} Add phones</button>`}</div></td></tr>`;
  const all = $("#all"); if (all) { all.checked = list.length > 0 && list.every((d) => dev.selected.has(d.id)); }
  renderBulk();
}
function renderBulk() {
  const n = dev.selected.size, b = $("#bulk");
  const pend = devAll.filter((d) => dev.selected.has(d.id) && !d.approved).length;
  b.classList.toggle("show", n > 0 && tab === "devices" && canWrite());
  b.innerHTML = `<b>${n} selected</b>${pend ? `<button class="btn" data-bulk="approve">${ic("check")} Approve ${pend}</button>` : ""}<button class="btn" data-bulk="refresh">${ic("refresh")} Refresh</button><button class="btn" data-bulk="lock">Lock screen</button><button class="btn" data-bulk="reboot">Reboot</button><button class="btn quiet" data-bulk="clear">Clear</button>`;
}

// --- device drawer ---
async function openDevice(id) {
  const row = devAll.find((d) => d.id === id);
  const dlg = $("#dlg"); dlg.className = "drawer";
  $("#dlgBody").innerHTML = `<div class="hd"><div class="grow"><h2>${esc(row?.name ?? "Phone")}</h2></div><button class="btn quiet icon" id="close" aria-label="Close">${ic("x")}</button></div><div class="bd"><div class="sk t" style="width:40%"></div><div class="sk t"></div><div class="sk t"></div><div class="sk h" style="width:100%"></div></div>`;
  if (!dlg.open) dlg.showModal();
  $("#close").onclick = closeDlg;
  let d, apps, gs;
  try { [d, apps, gs] = await Promise.all([get(`/api/devices/${id}`), get("/api/apps"), get("/api/groups")]); } catch (e) { closeDlg(); return fail(e); }
  const eff = d.effective.allowedApps.map((a) => a.pkg);
  const known = new Map(apps.map((a) => [a.pkg, a.label])); d.effective.allowedApps.forEach((a) => known.set(a.pkg, a.label));
  const kv = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  $("#dlgBody").innerHTML = `
    <div class="hd"><div class="dev"><div class="ph">${ic("phone")}</div><div class="grow"><h2>${esc(d.name)}</h2><span class="muted sm">${esc(d.model)} · ${esc(d.osVersion)}</span></div></div><span class="grow"></span>${statePill(d)}<button class="btn quiet icon" id="close" aria-label="Close">${ic("x")}</button></div>
    <div class="bd">
      ${!d.deviceOwner ? `<div class="banner bad" style="margin-bottom:16px">${ic("alert")}<div class="t"><b>This phone is not managed</b><span>The app is installed, but Android has not made it the device manager, so lock, reboot, release and updates cannot work. Reset the phone and set it up with the QR code or the USB script (see Add devices).</span></div></div>` : ""}
      ${!d.approved ? `<div class="banner warn" style="margin-bottom:16px">${ic("shield")}<div class="t"><b>Waiting for your approval</b><span>This phone is locked down but shows no apps until you approve it.</span></div></div>` : ""}
      <dl class="kv">
        ${kv("Battery", `${battery(d)}`)}${kv("Network", esc(d.network ?? "—"))}${kv("Last seen", ago(d.lastSeen))}
        ${kv("App version", esc(d.agentVersion ?? "—"))}${kv("Management", d.deviceOwner ? `<span class="pill ok">Managed</span>` : `<span class="pill bad">Not managed</span>`)}
        ${kv("Instant commands", d.live ? `<span class="pill info plain">${ic("zap")} live</span>` : `<span class="muted">not connected (uses check-ins)</span>`)}
        ${kv("Free storage", d.freeStorageMb != null ? `${d.freeStorageMb} MB` : "—")}${kv("Serial", esc(d.serial || "—"))}${kv("Enrolled", when(d.enrolledAt))}
      </dl>
      ${canWrite() ? `<h3 style="margin:24px 0 2px">Remote controls</h3><p class="hint" style="margin:0">${d.live ? "This phone is live: commands run within seconds." : "This phone runs commands at its next check-in."}</p>
      <div class="cmdgrid"><button class="btn ghost" data-cmd="refresh">${ic("refresh")} Refresh</button><button class="btn ghost" data-cmd="lock">Lock screen</button><button class="btn ghost" data-cmd="reboot">Reboot</button><button class="btn ghost" data-cmd="${d.released ? "relock" : "release"}">${d.released ? "Re-lock kiosk" : "Release from kiosk"}</button></div>` : ""}
      <h3 style="margin:24px 0 4px">Configuration</h3>
      <div class="field"><label for="dName">Name</label><input id="dName" value="${esc(d.name)}" ${ro()}></div>
      <div class="field"><label for="dGroup">Group</label><select id="dGroup" ${ro()}><option value="">No group</option>${gs.map((g) => `<option value="${g.id}" ${g.id === d.groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Allowed apps</label>
        ${check("dOverride", "Use custom apps for this phone", "Otherwise the group's apps are used", !!d.allowedOverride, ro())}
        <div class="apps" id="dApps">${[...known].map(([p, l]) => `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(l)}" ${eff.includes(p) ? "checked" : ""} ${ro()}> ${esc(l)} <small>${esc(p)}</small></label>`).join("") || '<label class="muted">No apps reported yet.</label>'}</div></div>
      <div class="field"><label for="dMsg">Message on the phone (optional)</label><input id="dMsg" value="${esc(d.messageOverride ?? "")}" placeholder="Uses the group message when empty" ${ro()}></div>
      <div class="field"><label for="dNotes">Notes</label><textarea id="dNotes" rows="2" ${ro()}>${esc(d.notes)}</textarea></div>
      ${d.lastCrash ? `<h3 style="margin:24px 0 8px">Last app crash</h3><pre class="box">${esc(d.lastCrash)}</pre>` : ""}
      <h3 style="margin:24px 0 8px">Recent commands</h3>
      <div class="card tablecard"><table><tbody>${d.commands.map((c) => `<tr><td><b>${esc(c.type)}</b></td><td>${c.status === "done" ? `<span class="pill ok">done</span>` : c.status === "failed" ? `<span class="pill bad">failed</span>` : `<span class="pill warn">${esc(c.status)}</span>`}${c.error ? ` <span class="muted sm">${esc(c.error)}</span>` : ""}</td><td class="muted sm nowrap">${ago(c.created_at)}</td></tr>`).join("") || '<tr><td class="muted">No commands sent yet.</td></tr>'}</tbody></table></div>
    </div>
    ${canWrite() ? `<div class="ft"><button class="btn" id="save">Save changes</button>${d.approved ? "" : '<button class="btn" id="approveOne">Approve phone</button>'}<span class="grow"></span><button class="btn ghost" id="del" style="color:var(--bad);border-color:var(--bad-bd)">${ic("trash")} Release &amp; remove</button></div>` : ""}`;
  $("#close").onclick = closeDlg;
  const reopen = () => openDevice(id);
  $$("[data-cmd]", dlg).forEach((b) => b.onclick = () => busy(b, async () => {
    const t = b.dataset.cmd;
    if (t !== "refresh" && !(await ask({ title: `${b.textContent.trim()} this phone?`, body: t === "reboot" ? "The phone restarts and comes back in kiosk mode." : t === "lock" ? "The screen locks." : t === "release" ? "The phone leaves kiosk mode and can be used normally until you re-lock it." : "The phone returns to kiosk mode.", ok: b.textContent.trim() }))) return;
    await api("POST", `/api/devices/${id}/commands`, { type: t });
    toast(d.live ? "Command sent. The phone is live and will run it in seconds." : "Command sent. The phone runs it at its next check-in.");
    reopen();
  }));
  if (!canWrite()) return;
  $("#approveOne")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", `/api/devices/${id}/approve`); toast("Phone approved"); reopen(); refresh(); }));
  $("#save").onclick = (e) => busy(e.currentTarget, async () => {
    const override = $("#dOverride").checked ? $$("#dApps input:checked").map((i) => ({ pkg: i.value, label: i.dataset.label })) : null;
    await api("PATCH", `/api/devices/${id}`, { name: $("#dName").value, groupId: $("#dGroup").value ? +$("#dGroup").value : null, allowedOverride: override, messageOverride: $("#dMsg").value || null, notes: $("#dNotes").value });
    toast("Saved"); reopen(); refresh();
  });
  $("#del").onclick = (e) => busy(e.currentTarget, async () => {
    if (!(await ask({ title: "Release and remove this phone?", body: "It unlocks itself the next time it checks in, then disappears from the list. You can set it up again later.", ok: "Release & remove", danger: true }))) return;
    const r = await api("DELETE", `/api/devices/${id}`);
    toast(r.removed ? "Phone removed" : "Unlock command sent. The phone is removed once it receives it.");
    closeDlg(); refresh();
  });
  if (d.removing) $("#del").insertAdjacentHTML("afterend", ` <button class="btn ghost" id="delNow">Delete now (phone lost)</button>`);
  $("#delNow")?.addEventListener("click", async () => { if (!(await ask({ title: "Delete immediately?", body: "A phone that is still locked will stay locked and unmanaged.", ok: "Delete now", danger: true }))) return; await api("DELETE", `/api/devices/${id}?force=1`).catch(fail); closeDlg(); refresh(); });
}

// ---------- Groups ----------
pages.groups = {
  title: "Groups & apps", sub: "Decide which apps each set of phones can open",
  actions: () => (canWrite() ? `<button class="btn" id="newGroup">${ic("plus")} New group</button>` : ""),
  skeleton: () => skForm(),
  load: () => Promise.all([get("/api/groups"), get("/api/apps")]),
  render([gs]) {
    return gs.length ? `<div class="grid g3">${gs.map((g) => `<div class="card pad"><div class="row between"><h3>${esc(g.name)}</h3><span class="pill plain">${g.devices} phone${g.devices === 1 ? "" : "s"}</span></div>
      <p class="muted" style="margin:10px 0 14px;min-height:40px">${g.allowedApps.length ? g.allowedApps.map((a) => esc(a.label)).join(", ") : "No apps allowed yet. Phones in this group show an empty kiosk."}</p>
      ${g.message ? `<p class="sm" style="margin:0 0 12px;color:var(--text-2)">“${esc(g.message)}”</p>` : ""}
      ${canWrite() ? `<button class="btn ghost sm" data-edit="${g.id}">Edit group</button>` : ""}</div>`).join("")}</div>`
      : `<div class="card empty"><div class="ico">${ic("layers")}</div><h3>No groups yet</h3><p>A group sets the apps a set of phones can open. Create one, then enrol phones into it.</p>${canWrite() ? `<button class="btn" id="newGroup2">${ic("plus")} Create a group</button>` : ""}</div>`;
  },
  bind([gs, apps]) {
    const open = (g) => groupDialog(g, apps);
    $("#newGroup")?.addEventListener("click", () => open(null)); $("#newGroup2")?.addEventListener("click", () => open(null));
    $$("[data-edit]").forEach((b) => b.onclick = () => open(gs.find((g) => g.id === +b.dataset.edit)));
  },
};
function groupDialog(g, apps) {
  const sel = (g?.allowedApps ?? []).map((a) => a.pkg);
  const known = new Map(apps.map((a) => [a.pkg, a.label])); (g?.allowedApps ?? []).forEach((a) => known.set(a.pkg, a.label));
  const dlg = $("#dlg"); dlg.className = "";
  $("#dlgBody").innerHTML = `<div class="hd"><div class="grow"><h2>${g ? "Edit group" : "New group"}</h2></div><button class="btn quiet icon" id="gX" aria-label="Close">${ic("x")}</button></div>
    <div class="bd">
      <div class="field"><label for="gName">Name</label><input id="gName" value="${esc(g?.name ?? "")}" placeholder="e.g. Sales team"></div>
      <div class="field"><label>Allowed apps</label><div class="apps" id="gApps">${[...known].map(([p, l]) => `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(l)}" ${sel.includes(p) ? "checked" : ""}> ${esc(l)} <small>${esc(p)}</small></label>`).join("") || '<label class="muted">No apps reported yet. Enrol a phone first, or add a package name below.</label>'}</div>
        <p class="hint">Apps appear once at least one phone has reported them.</p></div>
      <div class="field"><label for="gPkg">Add a package name manually</label><div class="row"><input id="gPkg" placeholder="com.company.app" style="flex:1"><button class="btn ghost" id="gAdd">Add</button></div></div>
      <div class="field"><label for="gMsg">Message shown on the phones (optional)</label><input id="gMsg" value="${esc(g?.message ?? "")}"></div>
    </div>
    <div class="ft"><button class="btn" id="gSave">Save group</button><button class="btn ghost" id="gCancel">Cancel</button>${g ? `<span class="grow"></span><button class="btn danger" id="gDel">${ic("trash")} Delete</button>` : ""}</div>`;
  dlg.showModal();
  $("#gX").onclick = $("#gCancel").onclick = closeDlg;
  $("#gAdd").onclick = () => { const p = $("#gPkg").value.trim(); if (!/^[A-Za-z0-9_.]+$/.test(p)) return toast("That is not a valid package name", "err"); $("#gApps").insertAdjacentHTML("beforeend", `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(p)}" checked> ${esc(p)}</label>`); $("#gPkg").value = ""; };
  $("#gSave").onclick = (e) => busy(e.currentTarget, async () => {
    const body = { name: $("#gName").value, message: $("#gMsg").value, allowedApps: $$("#gApps input:checked").map((i) => ({ pkg: i.value, label: i.dataset.label })) };
    g ? await api("PATCH", `/api/groups/${g.id}`, body) : await api("POST", "/api/groups", body);
    closeDlg(); toast("Group saved. Phones pick it up now."); refresh();
  });
  if (g) $("#gDel").onclick = async () => { if (!(await ask({ title: "Delete this group?", body: "Its phones keep running but show no apps until you move them to another group.", ok: "Delete group", danger: true }))) return; await api("DELETE", `/api/groups/${g.id}`).catch(fail); closeDlg(); refresh(); };
}

// ---------- Add devices ----------
pages.provision = {
  title: "Add devices", sub: "Set up new phones in a couple of minutes",
  skeleton: () => skForm(),
  load: () => Promise.all([get("/api/enroll-tokens"), get("/api/groups")]),
  render([tokens, gs]) {
    return `
    <div class="grid g2">
      <div class="card pad"><h3>How to set up a phone</h3>
        <ol class="steps" style="margin-top:16px">
          <li><div><b>Factory-reset the phone</b><div class="muted sm">Or unbox a new one.</div></div></li>
          <li><div><b>Tap the Welcome screen 6 times</b><div class="muted sm">Tap the same spot until a QR scanner opens.</div></div></li>
          <li><div><b>Scan the QR code</b><div class="muted sm">Choose a code below and press “Show QR”.</div></div></li>
          <li><div><b>Approve it here</b><div class="muted sm">The phone appears in Devices, waiting for your approval.</div></div></li>
        </ol>
        <div class="banner info" style="margin-top:18px">${ic("info")}<div class="t"><b>QR setup not working?</b><span>Use the USB setup script instead. It works on any phone. See <code>docs/USB_SETUP.md</code> in the project.</span></div></div>
      </div>
      ${canWrite() ? `<div class="card pad"><h3>New setup code</h3><p class="hint" style="margin-top:4px">One code can set up many phones until it expires.</p>
        <div class="field"><label for="tLabel">Name for the phones</label><input id="tLabel" value="Phone"><p class="hint">Phones are named like “Phone-001”.</p></div>
        <div class="field"><label for="tGroup">Group</label><select id="tGroup"><option value="">No group</option>${gs.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        <div class="row" style="margin-top:14px"><div class="field" style="margin:0;flex:1"><label for="tDays">Valid for (days)</label><input id="tDays" type="number" value="30" min="1" max="365"></div><div class="field" style="margin:0;flex:1"><label for="tMax">Max phones</label><input id="tMax" type="number" value="200" min="1"></div></div>
        <button class="btn" id="tCreate" style="margin-top:18px">${ic("qr")} Create code &amp; QR</button></div>` : ""}
    </div>
    <h3 style="margin:28px 0 12px">Setup codes</h3>
    <div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Code</th><th>Group</th><th>Used</th><th>Expires</th><th></th></tr></thead><tbody>
      ${tokens.map((t) => `<tr><td><b>${esc(t.label)}</b></td><td><code style="font-size:13.5px;letter-spacing:.05em">${esc(t.code)}</code> <button class="btn quiet sm icon" data-copy="${esc(t.code)}" title="Copy code" aria-label="Copy code">${ic("copy")}</button></td><td>${esc(t.groupName ?? "—")}</td><td>${t.uses}/${t.maxUses}</td><td class="muted">${when(t.expiresAt)}${t.expiresAt < Date.now() ? ` <span class="pill bad plain">expired</span>` : ""}</td>
        <td style="text-align:right" class="nowrap"><button class="btn ghost sm" data-qr="${esc(t.token)}">${ic("qr")} Show QR</button>${canWrite() ? ` <button class="btn quiet sm icon" data-rm="${esc(t.token)}" title="Delete" aria-label="Delete code">${ic("trash")}</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty"><div class="ico">${ic("qr")}</div><h3>No setup codes yet</h3><p>Create one to get a QR code.</p></div></td></tr>`}
    </tbody></table></div></div>`;
  },
  bind() {
    const showQr = async (token, btn) => {
      await busy(btn, async () => {
        const r = await get(`/api/provisioning/${encodeURIComponent(token)}`);
        const dlg = $("#dlg"); dlg.className = "";
        $("#dlgBody").innerHTML = `<div class="hd"><div class="grow"><h2>Scan on the Welcome screen</h2></div><button class="btn quiet icon" id="qX" aria-label="Close">${ic("x")}</button></div><div class="bd qr"><img src="${r.qr}" alt="Setup QR code"><p class="hint" style="margin-top:14px">Tap the Welcome screen 6 times first. Keep this QR private: anyone with it can enrol a phone.</p></div>
          <div class="ft" style="justify-content:center"><button class="btn" id="qPrint">Print</button><button class="btn ghost" id="qClose">Close</button></div>`;
        dlg.showModal(); $("#qX").onclick = $("#qClose").onclick = closeDlg; $("#qPrint").onclick = () => window.print();
      });
    };
    $("#tCreate")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const r = await api("POST", "/api/enroll-tokens", { label: $("#tLabel").value, groupId: $("#tGroup").value ? +$("#tGroup").value : null, days: +$("#tDays").value, maxUses: +$("#tMax").value });
      pageData.provision = await pages.provision.load(); paint("provision", pageData.provision); showQr(r.token);
    }));
    $$("[data-copy]").forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Code copied"); } catch { toast(b.dataset.copy); } });
    $$("[data-qr]").forEach((b) => b.onclick = () => showQr(b.dataset.qr, b));
    $$("[data-rm]").forEach((b) => b.onclick = async () => { if (await ask({ title: "Delete this code?", body: "Phones can no longer be set up with it. Phones already set up are not affected.", ok: "Delete", danger: true })) { await api("DELETE", `/api/enroll-tokens/${encodeURIComponent(b.dataset.rm)}`).catch(fail); refresh(); } });
  },
};

// ---------- App versions ----------
pages.releases = {
  title: "App versions", sub: "Update every phone remotely",
  skeleton: () => skTable(4),
  load: () => Promise.all([get("/api/releases"), get("/api/overview"), get("/api/groups")]),
  render([rs, o, gs]) {
    return `
    ${canWrite() ? `<div class="grid g2"><div class="card pad"><h3>Upload a new version</h3><p class="hint" style="margin-top:4px">Phones update by themselves, usually within minutes.</p>
        <div class="field"><label for="apk">APK file</label><input type="file" id="apk" accept=".apk" class="w100"></div>
        <div class="row"><div class="field" style="flex:1;margin-top:14px"><label for="vName">Version name</label><input id="vName" placeholder="1.4.0"></div><div class="field" style="flex:1;margin-top:14px"><label for="vCode">Version code</label><input id="vCode" type="number" placeholder="11"></div></div>
        <div class="field"><label for="vCert">Signing-certificate checksum <span class="muted">(first upload only)</span></label><input id="vCert" placeholder="base64url SHA-256"></div>
        <button class="btn" id="upload" style="margin-top:16px">${ic("download")} Upload</button></div>
      <div class="card pad"><h3>Push the latest version</h3><p class="hint" style="margin-top:4px">${o.outdated ? `${o.outdated} phone${o.outdated > 1 ? "s are" : " is"} on an older version.` : "Every phone is up to date."}</p>
        <div class="field"><label for="rollGroup">Which phones</label><select id="rollGroup"><option value="">All phones that need it</option>${gs.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        <button class="btn" id="rollAll" style="margin-top:16px" ${o.outdated ? "" : "disabled"}>Push update now</button>
        ${rs.length ? `<p class="hint" style="margin-top:16px"><a href="/apk/latest.apk">${ic("download")} Download the latest APK</a></p>` : ""}</div></div>` : ""}
    <h3 style="margin:28px 0 12px">Versions</h3>
    <div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>Version</th><th>Code</th><th>Size</th><th>Uploaded</th><th>Fingerprint</th></tr></thead><tbody>
      ${rs.map((r, i) => `<tr><td><b>${esc(r.versionName)}</b> ${i === 0 ? `<span class="pill ok plain">current</span>` : ""}</td><td>${r.versionCode}</td><td>${(r.size / 1048576).toFixed(1)} MB</td><td class="muted">${when(r.createdAt)}</td><td><code>${esc(r.sha256.slice(0, 12))}</code></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty"><div class="ico">${ic("pkg")}</div><h3>No versions uploaded</h3><p>Upload the app to start setting up phones.</p></div></td></tr>`}
    </tbody></table></div></div>`;
  },
  bind() {
    $("#upload")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const f = $("#apk").files[0]; if (!f) return toast("Choose an APK file first", "err");
      const q = new URLSearchParams({ versionName: $("#vName").value, versionCode: $("#vCode").value, certSha256: $("#vCert").value });
      await api("PUT", `/api/releases?${q}`, null, f); toast("Version uploaded"); refresh();
    }));
    $("#rollAll")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const r = await api("POST", "/api/releases/rollout", { groupId: $("#rollGroup").value ? +$("#rollGroup").value : null });
      toast(`Update sent to ${r.queued} phone${r.queued === 1 ? "" : "s"}`);
    }));
  },
};

// ---------- Settings ----------
pages.settings = {
  title: "Settings", sub: "Security and fleet behaviour",
  skeleton: () => skForm(),
  load: () => Promise.all([get("/api/settings"), get("/api/admins")]),
  render([s, admins]) {
    const d = ro();
    const row = (ok, text) => `<div class="todo" style="padding:10px 0"><div class="ic ${ok ? "ok" : "warn"}" style="width:26px;height:26px">${ic(ok ? "check" : "alert")}</div><div class="tx">${text}</div></div>`;
    return `<div class="grid g2" style="align-items:start">
      <div class="card"><div class="hd"><div><h3>Security</h3><p>How well protected your fleet is</p></div></div><div class="pad">
        ${row(me.twoFactor, "Your sign-in uses two-factor codes")}${row(s.require2fa, "Two-factor required for every dashboard user")}${row(s.requireApproval, "New phones need your approval")}${row(!s.pinEnabled, "No exit PIN on phones")}${row(s.disableDebugging, "USB debugging blocked on phones")}
        <div style="border-top:1px solid var(--border);margin-top:8px">
        ${check("reqAppr", "New phones must be approved", "They are locked down but get no apps until you approve them.", s.requireApproval, d)}
        ${check("req2fa", "Require two-factor for all users", me.twoFactor ? "Everyone must set up two-factor to use the dashboard." : "Set up two-factor for your own account first (Account page).", s.require2fa, d + (me.twoFactor ? "" : " disabled"))}
        ${check("noDebug", "Block USB debugging on phones", "Recommended. Stops anyone plugging a phone into a computer to bypass the lock.", s.disableDebugging, d)}</div>
      </div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="hd"><div><h3>Phone behaviour</h3></div></div><div class="pad">
          ${check("autoUpd", "Update phones automatically", "Install each new version as soon as you upload it.", s.autoUpdate, d)}
          <div class="row between" style="margin-top:6px"><div><b>Exit PIN</b> <span class="pill ${s.pinEnabled ? "warn" : ""} plain">${s.pinEnabled ? "on" : "off (recommended)"}</span><p class="hint" style="margin-top:2px">Off means only “Release” here can unlock a phone.</p></div></div>
          ${check("pinOn", "Allow an exit PIN on phones", "Supervisors tap the phone's name 5 times, then enter the PIN.", s.pinEnabled, d + (s.pinSet ? "" : " disabled"))}
          <div class="row"><input id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="${s.pinSet ? "New PIN (4-8 digits)" : "Choose a PIN (4-8 digits)"}" ${d}><button class="btn ghost" id="savePin" ${d}>${s.pinSet ? "Change PIN" : "Set PIN & turn on"}</button></div>
        </div></div>
        <div class="card"><div class="hd"><div><h3>Wi-Fi for new phones</h3><p>Optional: included in the setup QR</p></div></div><div class="pad">
          <div class="field"><label for="ssid">Network name</label><input id="ssid" value="${esc(s.wifiSsid)}" ${d}></div>
          <div class="field"><label for="wpass">Password ${s.wifiPasswordSet ? '<span class="muted">(leave empty to keep)</span>' : ""}</label><input id="wpass" type="password" ${d}></div>
          <div class="field"><label for="cert">Signing-certificate checksum</label><input id="cert" value="${esc(s.certSha256)}" ${d}></div>
          <button class="btn" id="saveNet" style="margin-top:16px" ${d}>Save</button></div></div>
      </div>
      <div class="card" style="grid-column:1/-1"><div class="hd"><div><h3>Dashboard users</h3><p>People who can sign in to this console</p></div></div>
        <div class="tablewrap"><table><thead><tr><th>User</th><th>Role</th><th>Two-factor</th><th></th></tr></thead><tbody>${admins.map((a) => `<tr><td><div class="row" style="gap:10px"><div class="avatar" style="width:30px;height:30px;font-size:12px">${esc(initials(a.email))}</div><b>${esc(a.email)}</b>${a.email === me.email ? ' <span class="pill plain">you</span>' : ""}</div></td><td>${a.role === "admin" ? "Admin" : "View only"}</td><td>${a.twoFactor ? `<span class="pill ok">On</span>` : `<span class="pill warn">Off</span>`}</td><td style="text-align:right">${canWrite() && a.email !== me.email ? `<button class="btn quiet sm" data-rmadmin="${a.id}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
        ${canWrite() ? `<div class="pad" style="border-top:1px solid var(--border)"><label class="lbl">Add a user</label><div class="row"><input id="aEmail" type="email" placeholder="name@company.com" style="flex:1;min-width:200px"><input id="aPass" type="password" placeholder="Password (12+ characters)" style="flex:1;min-width:200px"><select id="aRole"><option value="admin">Admin</option><option value="viewer">View only</option></select><button class="btn" id="aAdd">Add user</button></div></div>` : ""}</div>
    </div>`;
  },
  bind() {
    const put = (body, msg) => api("PUT", "/api/settings", body).then(() => { toast(msg); refresh(); }).catch((e) => { fail(e); refresh(); });
    $("#savePin")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ pin: $("#pin").value }, "PIN updated")));
    $("#pinOn")?.addEventListener("change", (e) => put({ pinEnabled: e.target.checked }, "Saved"));
    $("#reqAppr")?.addEventListener("change", (e) => put({ requireApproval: e.target.checked }, "Saved"));
    $("#req2fa")?.addEventListener("change", (e) => put({ require2fa: e.target.checked }, "Saved"));
    $("#autoUpd")?.addEventListener("change", (e) => put({ autoUpdate: e.target.checked }, "Saved"));
    $("#noDebug")?.addEventListener("change", (e) => put({ disableDebugging: e.target.checked }, "Saved"));
    $("#saveNet")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ wifiSsid: $("#ssid").value, wifiPassword: $("#wpass").value, certSha256: $("#cert").value }, "Saved")));
    $("#aAdd")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", "/api/admins", { email: $("#aEmail").value, password: $("#aPass").value, role: $("#aRole").value }); toast("User added"); refresh(); }));
    $$("[data-rmadmin]").forEach((b) => b.onclick = async () => { if (await ask({ title: "Remove this user?", body: "They can no longer sign in.", ok: "Remove", danger: true })) { await api("DELETE", `/api/admins/${b.dataset.rmadmin}`).catch(fail); refresh(); } });
  },
};

// ---------- Account ----------
pages.account = {
  title: "My account", sub: "Password and two-factor sign-in",
  skeleton: () => skForm(),
  load: () => get("/api/me"),
  render(m) {
    me = { ...me, ...m };
    return `${me.mustSetup2fa ? `<div class="banner bad" style="margin-bottom:16px">${ic("shield")}<div class="t"><b>Two-factor sign-in is required</b><span>Set it up below to keep using the dashboard.</span></div></div>` : ""}
    <div class="grid g2" style="align-items:start">
      <div class="card pad"><h3>Change password</h3><p class="hint" style="margin-top:4px">At least 12 characters. Changing it signs you out everywhere else.</p>
        <div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password"></div>
        <button class="btn" id="pwSave" style="margin-top:16px">Change password</button></div>
      <div class="card pad"><div class="row between"><h3>Two-factor sign-in</h3><span class="pill ${m.twoFactor ? "ok" : "warn"}">${m.twoFactor ? "On" : "Off"}</span></div>
        <p class="hint" style="margin-top:4px">Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) when you sign in.</p>
        <div id="tfa" style="margin-top:14px">${m.twoFactor
          ? `<div class="field"><label for="tfPw">Password</label><input id="tfPw" type="password"></div><div class="field"><label for="tfCode">Current code</label><input id="tfCode" inputmode="numeric" maxlength="6"></div><button class="btn danger" id="tfOff" style="margin-top:16px">Turn off two-factor</button>`
          : `<button class="btn" id="tfStart">${ic("shield")} Set up two-factor</button>`}</div></div>
    </div>`;
  },
  bind() {
    $("#pwSave").onclick = (e) => busy(e.currentTarget, async () => { await api("POST", "/api/me/password", { current: $("#pwCur").value, next: $("#pwNew").value }); toast("Password changed. Other sessions were signed out."); $("#pwCur").value = ""; $("#pwNew").value = ""; });
    $("#tfStart")?.addEventListener("click", (ev) => busy(ev.currentTarget, async () => {
      const r = await api("POST", "/api/me/2fa/setup");
      $("#tfa").innerHTML = `<ol class="steps"><li><div><b>Scan this with your authenticator app</b><div class="qr" style="margin-top:10px"><img src="${r.qr}" alt="Authenticator QR code" style="width:190px"></div><p class="hint">Or type this key: <code>${esc(r.secret)}</code></p></div></li>
        <li><div style="flex:1"><b>Enter the 6-digit code it shows</b><input id="tfCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="w100" style="margin-top:8px"></div></li></ol><button class="btn" id="tfOn" style="margin-top:16px">Turn on</button>`;
      $("#tfOn").onclick = (e2) => busy(e2.currentTarget, async () => {
        const e = await api("POST", "/api/me/2fa/enable", { code: $("#tfCode").value });
        $("#tfa").innerHTML = `<div class="banner warn">${ic("alert")}<div class="t"><b>Save these recovery codes now</b><span>Each works once if you lose your phone. They will not be shown again.</span></div></div><pre class="box" style="margin-top:12px;font-size:15px;line-height:1.8">${e.recoveryCodes.map(esc).join("\n")}</pre><button class="btn" id="tfDone" style="margin-top:14px">I have saved them</button>`;
        $("#tfDone").onclick = async () => { me.mustSetup2fa = false; me.twoFactor = true; await boot(); go("account"); };
      });
    }));
    $("#tfOff")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", "/api/me/2fa/disable", { password: $("#tfPw").value, code: $("#tfCode").value }); toast("Two-factor turned off"); await boot(); go("account"); }));
  },
};

// ---------- Activity ----------
pages.audit = {
  title: "Activity", sub: "Everything that happened, newest first", live: true,
  skeleton: () => skTable(8),
  load: () => get("/api/audit"),
  render(rows) {
    const label = (a) => a.replace(/^setup:/, "setup · ").replace(/-/g, " ");
    return `<div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td class="muted nowrap">${when(a.ts)}</td><td><b>${esc(a.actor)}</b></td><td><span class="pill plain ${/failed|delete|remove/.test(a.action) ? "bad" : /login|approve|enable/.test(a.action) ? "ok" : ""}">${esc(label(a.action))}</span></td><td class="muted">${esc(a.detail)}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty"><div class="ico">${ic("activity")}</div><h3>Nothing yet</h3></div></td></tr>`}
    </tbody></table></div></div>`;
  },
};

// =====================================================================
// events (delegated, so they survive re-renders)
// =====================================================================
// Anything with data-go="page" (and optional data-filter) navigates, wherever it sits (page body or header actions).
document.addEventListener("click", (e) => {
  const goBtn = e.target.closest("[data-go]"); if (!goBtn) return;
  const f = goBtn.dataset.filter; if (f) { dev.status = f; dev.group = ""; dev.q = ""; }
  const target = goBtn.dataset.go;
  if (location.hash === "#/" + target) go(target); else location.hash = "#/" + target;
});
$("#view").addEventListener("click", (e) => {
  const seg = e.target.closest("[data-st]");
  if (seg) { dev.status = seg.dataset.st; $$("[data-st]").forEach((b) => b.classList.toggle("on", b === seg)); drawRows(); return; }
  const sel = e.target.closest(".sel");
  if (sel) { e.stopPropagation(); sel.checked ? dev.selected.add(+sel.dataset.id) : dev.selected.delete(+sel.dataset.id); renderBulk(); const all = $("#all"); if (all) all.checked = visibleDevices().every((d) => dev.selected.has(d.id)); return; }
  if (e.target.id === "all") { visibleDevices().forEach((d) => (e.target.checked ? dev.selected.add(d.id) : dev.selected.delete(d.id))); $$(".sel").forEach((c) => (c.checked = e.target.checked)); renderBulk(); return; }
  const row = e.target.closest("tr.clickable"); if (row) openDevice(+row.dataset.id);
});
$("#view").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".stat.link")) e.target.click(); });
$("#view").addEventListener("input", (e) => { if (e.target.id === "q") { dev.q = e.target.value; drawRows(); } });
$("#view").addEventListener("change", (e) => { if (e.target.id === "fg") { dev.group = e.target.value; drawRows(); } });
$("#bulk").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bulk]"); if (!b) return;
  const t = b.dataset.bulk, ids = [...dev.selected];
  if (t === "clear") { dev.selected.clear(); $$(".sel").forEach((c) => (c.checked = false)); return renderBulk(); }
  await busy(b, async () => {
    if (t === "approve") {
      const pend = ids.filter((id) => devAll.find((d) => d.id === id && !d.approved));
      for (const id of pend) await api("POST", `/api/devices/${id}/approve`);
      toast(`${pend.length} phone${pend.length === 1 ? "" : "s"} approved`); dev.selected.clear(); return refresh();
    }
    if (t !== "refresh" && !(await ask({ title: `${b.textContent.trim()} ${ids.length} phone${ids.length === 1 ? "" : "s"}?`, body: t === "reboot" ? "They restart and come back in kiosk mode." : "Their screens lock.", ok: b.textContent.trim() }))) return;
    const r = await api("POST", "/api/commands/bulk", { ids, type: t });
    toast(`Sent to ${r.queued} phone${r.queued === 1 ? "" : "s"}${r.skipped ? `. ${r.skipped} skipped because they are not managed` : ""}`);
  });
});

// ---------- sign in / out ----------
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn"); btn.classList.add("busy");
  try {
    await api("POST", "/api/login", { email: $("#email").value, password: $("#password").value, code: $("#code").value });
    $("#password").value = ""; $("#code").value = ""; $("#codeRow").classList.add("hidden"); $("#loginErr").textContent = "";
    await boot();
  } catch (err) {
    if (err.data?.needs2fa) { $("#codeRow").classList.remove("hidden"); $("#code").focus(); }
    $("#loginErr").textContent = err.message;
  } finally { btn.classList.remove("busy"); }
};
$("#logout").onclick = async () => { await api("POST", "/api/logout").catch(() => {}); showLogin(); };

async function boot() {
  try { me = await api("GET", "/api/me"); } catch { return showLogin(); }
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#avatar").textContent = initials(me.email); $("#whoEmail").textContent = me.email; $("#whoRole").textContent = me.role === "admin" ? "Administrator" : "View only";
  buildNav();
  if (me.mustSetup2fa) { location.hash = "#/account"; return go("account"); }
  const t = routeFromHash();
  if (location.hash !== "#/" + t) history.replaceState(null, "", "#/" + t);
  await go(t);
  setTimeout(() => { for (const p of ["devices", "groups"]) if (p !== tab) prefetch(p); }, 600); // warm the busiest pages
}
fetch("/healthz").catch(() => {}); // wake the server while the page loads
boot();
