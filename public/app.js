"use strict";
/* Confiance Kiosk console. No framework: small, fast, and CSP-friendly (no inline scripts). Strings live in i18n.js. */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// The console may be served under a prefix (e.g. /functions/v1/kiosk/), so every address is relative to the page,
// unless <meta name="kiosk-api"> names the API (static hosting elsewhere): then a bearer token replaces the cookie.
const API_META = (document.querySelector('meta[name="kiosk-api"]')?.content ?? "").trim().replace(/\/$/, "");
const BASE = API_META ? API_META + "/" : new URL(".", location.href).pathname;
const CROSS = !!API_META && new URL(BASE, location.href).origin !== location.origin;
const api_ = (p) => BASE + p.replace(/^\//, "");
const tokenStore = { get: () => { try { return sessionStorage.getItem("kiosk.token") || localStorage.getItem("kiosk.token") || ""; } catch { return ""; } }, set: (v) => { try { v ? localStorage.setItem("kiosk.token", v) : localStorage.removeItem("kiosk.token"); } catch { /* private mode */ } } };
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
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>', shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14.5 14.5 0 0 1 20 0"/><path d="M12 20h.01"/>',
  signal: '<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>',
  nonet: '<path d="M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.2-2.7M12 20h.01M16.4 9.4A10 10 0 0 1 19 12.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  pin: '<path d="M12 22s7-7.6 7-12a7 7 0 1 0-14 0c0 4.4 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  car: '<path d="M5 17h14M5 17a2 2 0 1 0 0 .1M19 17a2 2 0 1 0 0 .1M3 12l2-5h14l2 5v5H3Z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const ic = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] ?? ""}</svg>`;
const ago = (ts) => { if (!ts) return t("common.never"); const s = Math.max(0, (Date.now() - ts) / 1000); return s < 90 ? t("common.justnow") : s < 3600 ? t("common.minago", { n: Math.round(s / 60) }) : s < 86400 ? t("common.hago", { n: Math.round(s / 3600) }) : t("common.dago", { n: Math.round(s / 86400) }); };
const when = (ts) => ts ? new Date(ts).toLocaleString(LOCALE(), { dateStyle: "medium", timeStyle: "short" }) : "—";
const hhmm = (ts) => new Date(ts).toLocaleTimeString(LOCALE(), { hour: "2-digit", minute: "2-digit" });
const initials = (e) => (e || "?").split(/[@.\s_-]/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "?";
const canWrite = () => me?.role === "admin";
const ro = () => (canWrite() ? "" : "disabled");
const nf = (n, d = 0) => Number(n ?? 0).toLocaleString(LOCALE(), { maximumFractionDigits: d, minimumFractionDigits: 0 });
const fmtBytes = (b) => { b = Number(b) || 0; if (b < 1048576) return `${nf(b / 1024)} ${t("bytes.kb")}`; if (b < 1073741824) return `${nf(b / 1048576, b < 10 * 1048576 ? 1 : 0)} ${t("bytes.mb")}`; return `${nf(b / 1073741824, 2)} ${t("bytes.gb")}`; };
const fmtMb = (mb) => fmtBytes((Number(mb) || 0) * 1048576);
const fmtGbFromMb = (mb) => mb == null ? "—" : mb >= 1024 ? `${nf(mb / 1024, 1)} ${t("bytes.gb")}` : `${nf(mb)} ${t("bytes.mb")}`;
const MODELS = { "SM-A175": "Galaxy A17", "SM-A176": "Galaxy A17 5G", "SM-A165": "Galaxy A16", "SM-A166": "Galaxy A16 5G", "SM-A155": "Galaxy A15", "SM-A156": "Galaxy A15 5G", "SM-A145": "Galaxy A14", "SM-A065": "Galaxy A06", "SM-A057": "Galaxy A05s", "SM-A055": "Galaxy A05", "SM-A266": "Galaxy A26", "SM-A356": "Galaxy A35", "SM-A366": "Galaxy A36", "SM-A556": "Galaxy A55", "SM-A566": "Galaxy A56" };
function modelName(m) {
  if (!m) return "—";
  const code = /SM-[A-Z]\d{3}/.exec(m)?.[0];
  if (code && MODELS[code]) return `Samsung ${MODELS[code]}`;
  const gen = /SM-A(\d{2})\d/.exec(m); if (gen) return `Samsung Galaxy A${gen[1]}`;
  return m.replace(/^(\w)(\w*)\s+\1\w*/i, (s) => s).replace(/^samsung/i, "Samsung").replace(/^(\w)/, (c) => c.toUpperCase());
}
const NET_ICON = { wifi: "wifi", cellular: "signal", ethernet: "globe", none: "nonet", other: "globe" };
const netLabel = (n) => n ? t(`net.${n}`) : "—";
const netPill = (d) => d.network ? `<span class="net ${d.network}" title="${esc(netLabel(d.network))}">${ic(NET_ICON[d.network] ?? "globe")}<span>${esc(netLabel(d.network))}</span></span>` : `<span class="muted">—</span>`;
const androidShort = (v) => (v || "").replace(/^Android\s*/, "").replace(/\s*\(API.*\)$/, "");

// ---------- loading bar ----------
let inflight = 0, barTimer = null;
function barStart() {
  const b = $("#loadbar"), i = $("#loadbar i");
  if (inflight++ === 0) { i.style.width = "0"; b.classList.add("on"); requestAnimationFrame(() => (i.style.width = "70%")); clearTimeout(barTimer); barTimer = setTimeout(() => (i.style.width = "88%"), 900); }
}
function barEnd() {
  if (--inflight > 0) return;
  const b = $("#loadbar"), i = $("#loadbar i");
  clearTimeout(barTimer); i.style.width = "100%";
  setTimeout(() => { b.classList.remove("on"); setTimeout(() => (i.style.width = "0"), 220); }, 180);
}

// ---------- api ----------
let me = null, tab = "overview", pageData = {}, refreshTimer = null;
const cache = new Map(); // GET url -> last response (shown instantly, then refreshed)
async function api(method, url, body, raw) {
  barStart();
  try {
    // The session token is always sent as a bearer header: it works through any proxy (Netlify, GitHub Pages) and
    // does not depend on the API's cookie reaching this origin. The cookie remains a fallback for same-origin setups.
    const tok = tokenStore.get();
    const res = await fetch(api_(url), {
      method, credentials: CROSS ? "omit" : "same-origin",
      headers: { "x-requested-with": "confiance-dashboard", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(raw ? { "content-type": "application/octet-stream" } : body ? { "content-type": "application/json" } : {}) },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== "/api/login") { tokenStore.set(""); showLogin(); throw new Error("Signed out"); }
    if (data.token && /^\/api\/(login|me\/password|me\/2fa\/enable)$/.test(url)) tokenStore.set(data.token);
    if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.data = data; throw e; }
    if (data.need2faSetup) { location.hash = "#/account"; }
    if (method === "GET") cache.set(url, data);
    return data;
  } finally { barEnd(); }
}
const get = (url) => api("GET", url);

// ---------- ui primitives ----------
function toast(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind === "err" ? "err" : ""}`;
  el.innerHTML = `${ic(kind === "err" ? "alert" : "check")}<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, kind === "err" ? 6000 : 3200);
}
const fail = (e) => { if (e.message !== "Signed out") toast(e.message, "err"); };
function ask({ title, body = "", ok = t("common.confirm"), danger = false, input = null }) {
  return new Promise((resolve) => {
    const dlg = $("#cfm");
    $("#cfmBody").innerHTML = `<div class="hd"><h2>${esc(title)}</h2></div><div class="bd">${body ? `<p style="margin:0;color:var(--text-2)">${esc(body)}</p>` : ""}${input ? `<div class="field"><label for="cfmIn">${esc(input.label)}</label><input id="cfmIn" placeholder="${esc(input.placeholder ?? "")}" autocomplete="off"></div>` : ""}</div>
      <div class="ft"><button class="btn ${danger ? "danger" : ""}" id="cfmOk">${esc(ok)}</button><button class="btn ghost" id="cfmNo">${esc(t("common.cancel"))}</button></div>`;
    dlg.showModal();
    const done = (v) => { dlg.close(); resolve(v); };
    $("#cfmOk").onclick = () => done(input ? $("#cfmIn").value : true);
    $("#cfmNo").onclick = () => done(false);
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };
    (input ? $("#cfmIn") : $("#cfmNo")).focus();
  });
}
async function busy(btn, fn) {
  btn?.classList.add("busy");
  try { return await fn(); } catch (e) { fail(e); } finally { btn?.classList.remove("busy"); }
}
function closeDlg() { $("#dlg").close(); }
function openDlg(html, drawer = false) {
  const dlg = $("#dlg"); dlg.className = drawer ? "drawer" : "";
  $("#dlgBody").innerHTML = html;
  if (!dlg.open) dlg.showModal();
  $$("[data-close]", dlg).forEach((b) => (b.onclick = closeDlg));
  return dlg;
}
const skCards = (n = 4) => `<div class="grid g4">${Array.from({ length: n }, () => `<div class="card stat"><div class="sk t" style="width:50%"></div><div class="sk h"></div><div class="sk t" style="width:70%"></div></div>`).join("")}</div>`;
const skTable = (rows = 7) => `<div class="card tablecard"><div class="pad"><div class="sk t" style="width:30%;height:34px"></div></div>${Array.from({ length: rows }, () => `<div class="sk row"></div>`).join("")}</div>`;
const skForm = () => `<div class="grid g2">${[0, 1].map(() => `<div class="card pad"><div class="sk t" style="width:40%"></div><div class="sk t"></div><div class="sk t"></div><div class="sk h" style="width:100%"></div></div>`).join("")}</div>`;

// ---------- navigation ----------
const NAV = [
  ["nav.fleet", [["overview", "nav.overview", "grid"], ["devices", "nav.devices", "phone"], ["groups", "nav.groups", "layers"]]],
  ["nav.deploy", [["provision", "nav.provision", "qr"], ["releases", "nav.releases", "pkg"]]],
  ["nav.admin", [["settings", "nav.settings", "sliders"], ["account", "nav.account", "user"], ["audit", "nav.audit", "activity"]]],
];
function buildNav() {
  $("#nav").innerHTML = NAV.map(([g, items]) => `<div class="navgroup">${t(g)}</div>` + items.map(([k, l, i]) => `<button data-tab="${k}">${ic(i)}<span>${t(l)}</span><span class="badge warn hidden" id="nb-${k}"></span></button>`).join("")).join("");
}
function showLogin() { clearInterval(refreshTimer); $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); cache.clear(); pageData = {}; }
const prefetchedAt = {};
function prefetch(tn) {
  if (!pages[tn]?.load || Date.now() - (prefetchedAt[tn] ?? 0) < 15000) return Promise.resolve();
  prefetchedAt[tn] = Date.now();
  return pages[tn].load().then((d) => { pageData[tn] = d; }).catch(() => {});
}
const routeFromHash = () => { const r = location.hash.replace(/^#\/?/, ""); return pages[r] ? r : "overview"; };
window.addEventListener("hashchange", () => go(routeFromHash()));
function setHead(p, data) {
  $("#pageTitle").textContent = t(p.title);
  $("#pageSub").textContent = typeof p.sub === "function" ? p.sub(data) : p.sub ? t(p.sub) : "";
  $("#pageActions").innerHTML = p.actions ? p.actions(data) : "";
}
function paint(tn, data) {
  const p = pages[tn];
  setHead(p, data);
  $("#view").innerHTML = p.render(data);
  p.bind?.(data);
  updateBadges(data, tn);
}
async function go(tn, { quiet = false } = {}) {
  const p = pages[tn]; if (!p) return;
  const changed = tab !== tn; tab = tn;
  $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tn));
  $("#side").classList.remove("open"); $("#scrim").classList.remove("open");
  if (changed) { window.scrollTo(0, 0); if (pageData[tn]) paint(tn, pageData[tn]); else { setHead(p); $("#view").innerHTML = p.skeleton ? p.skeleton() : ""; } }
  clearInterval(refreshTimer);
  try {
    const data = p.load ? await p.load() : null;
    if (tab !== tn) return;
    pageData[tn] = data;
    if (!quiet || !isTyping()) paint(tn, data);
  } catch (e) { if (!quiet) fail(e); }
  // Live pages refresh once a minute while the tab is visible.
  if (p.live) refreshTimer = setInterval(() => { if (document.visibilityState === "visible" && !$("#dlg").open) go(tn, { quiet: true }); }, 60_000);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && pages[tab]?.live && !$("#dlg").open) go(tab, { quiet: true }); });
const isTyping = () => { const a = document.activeElement; return a && $("#view").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.id !== "q"; };
const refresh = () => go(tab, { quiet: false });
function updateBadges(data, tn) {
  if (tn === "overview") { const n = (data?.[0]?.pendingApproval ?? 0) + (data?.[0]?.alerts?.length ?? 0); const b = $("#nb-devices"); if (b) { b.textContent = n; b.classList.toggle("hidden", !n); } }
}

// ---------- shared renderers ----------
const statePill = (d) => d.state === "online" ? `<span class="pill ok">${t("state.online")}</span>` : d.state === "stale" ? `<span class="pill warn">${t("state.stale")}</span>` : `<span class="pill bad">${t("state.offline")}</span>`;
const battery = (d) => { if (d.battery == null || d.battery < 0) return `<span class="muted">—</span>`; const c = d.battery <= 20 ? "low" : d.battery <= 50 ? "mid" : ""; return `<span class="meter ${c}"><i><b style="width:${d.battery}%"></b></i>${d.battery}%${d.charging ? ` <span title="Charging" style="color:var(--ok)">${ic("zap")}</span>` : ""}</span>`; };
const stat = ({ label, value, sub = "", icon, tone = "", go: g, filter }) => `<div class="card stat ${tone} ${g ? "link" : ""}" ${g ? `data-go="${g}" ${filter ? `data-filter="${filter}"` : ""} tabindex="0" role="button"` : ""}><div class="k"><span class="ico">${ic(icon)}</span>${label}</div><div class="v">${value}</div><div class="d">${sub}</div></div>`;
const check = (id, label, hint, on, extra = "") => `<label class="check"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${extra}><span>${label}${hint ? `<small>${hint}</small>` : ""}</span></label>`;
/** Cellular vs Wi-Fi split for one phone this month; red when over budget. */
function dataCell(d, budgetMb) {
  const u = d.dataMonth; if (!u || (!u.mobileBytes && !u.wifiBytes)) return `<span class="muted">—</span>`;
  const budget = (budgetMb || 0) * 1048576, over = budget && u.mobileBytes > budget;
  const total = u.mobileBytes + u.wifiBytes, pm = total ? (u.mobileBytes / total) * 100 : 0;
  return `<span class="datacell ${over ? "over" : ""}" title="${esc(t("d.data.mobile"))} ${fmtBytes(u.mobileBytes)} · ${esc(t("d.data.wifi"))} ${fmtBytes(u.wifiBytes)}"><b>${fmtBytes(u.mobileBytes)}</b><i><em class="m" style="width:${pm}%"></em><em class="w" style="width:${100 - pm}%"></em></i></span>`;
}
const alertKind = (k) => t(`alert.${k}`) === `alert.${k}` ? k.replace(/_/g, " ") : t(`alert.${k}`);
/** Alert texts are stored in English with the numbers inside; show them in the console language. */
function alertMsg(a) {
  const nums = (a.message.match(/\d+/g) ?? []).map(Number);
  switch (a.kind) {
    case "data_budget": return nums.length >= 2 ? t("alert.data_budget.msg", { used: fmtMb(nums[0]), budget: fmtMb(nums[1]) }) : a.message;
    case "battery": return nums.length ? t("alert.battery.msg", { n: nums[0] }) : a.message;
    case "offline": return nums.length ? t("alert.offline.msg", { n: nums[0] }) : a.message;
    case "sim_changed": { const op = /\(([^)]+)\)/.exec(a.message)?.[1]; return op && op !== "?" ? t("alert.sim_changed.msg", { op }) : ""; }
    case "unmanaged": return /Released/.test(a.message) ? t("alert.unmanaged.released") : t("alert.unmanaged.msg");
    default: return a.message;
  }
}
const alertWho = (a) => a.driverName || a.deviceName || "";
const ALERT_TONE = { data_budget: "warn", sim_changed: "bad", unmanaged: "bad", battery: "warn", offline: "bad", problem: "info" };
const ALERT_ICON = { data_budget: "signal", sim_changed: "shield", unmanaged: "alert", battery: "zap", offline: "phone", problem: "bell" };
const alertRow = (a, withDevice = true) => `<div class="todo" data-alert="${a.id}"><div class="ic ${ALERT_TONE[a.kind] ?? "info"}">${ic(ALERT_ICON[a.kind] ?? "bell")}</div><div class="tx"><b>${withDevice && alertWho(a) ? `${esc(alertWho(a))} · ` : ""}${esc(alertKind(a.kind))}</b><span>${alertMsg(a) ? `${esc(alertMsg(a))} · ` : ""}${ago(a.ts)}</span></div>${a.deviceId ? `<button class="btn ghost sm" data-open="${a.deviceId}">${t("common.view")}</button>` : ""}${canWrite() ? `<button class="btn quiet sm icon" data-dismiss="${a.id}" title="${esc(t("common.dismiss"))}" aria-label="${esc(t("common.dismiss"))}">${ic("x")}</button>` : ""}</div>`;
function bindAlertRows(root = document) {
  $$("[data-dismiss]", root).forEach((b) => b.onclick = (e) => { e.stopPropagation(); busy(b, async () => { await api("POST", `/api/alerts/${b.dataset.dismiss}/dismiss`); b.closest("[data-alert]")?.remove(); }); });
  $$("[data-open]", root).forEach((b) => b.onclick = (e) => { e.stopPropagation(); openDevice(+b.dataset.open); });
}

// =====================================================================
// pages
// =====================================================================
const pages = {};

// ---------- Overview ----------
pages.overview = {
  title: "ov.title", sub: "ov.sub", live: true,
  skeleton: () => skCards(4) + `<div class="grid g2 section">${skForm()}</div>`,
  load: () => Promise.all([get("/api/overview"), get("/api/audit?limit=12")]),
  render([o, audit]) {
    const total = o.total || 0, pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const items = [];
    if (o.pendingApproval) items.push({ tone: "warn", icon: "shield", t: t("ov.pending", { n: o.pendingApproval }), d: t("ov.pending.d"), go: "devices", filter: "pending", cta: t("common.review") });
    if (o.lost) items.push({ tone: "bad", icon: "pin", t: t("ov.lost", { n: o.lost }), d: t("ov.lost.d"), go: "devices", filter: "lost", cta: t("common.view") });
    if (o.offline) items.push({ tone: "bad", icon: "phone", t: t("ov.offline", { n: o.offline }), d: t("ov.offline.d"), go: "devices", filter: "offline", cta: t("common.view") });
    if (o.lowBattery) items.push({ tone: "warn", icon: "zap", t: t("ov.lowbat", { n: o.lowBattery }), d: t("ov.lowbat.d"), go: "devices", filter: "all", cta: t("common.view") });
    if (o.outdated) items.push({ tone: "info", icon: "pkg", t: t("ov.outdated", { n: o.outdated }), d: t("ov.outdated.d", { v: o.currentVersion ?? "—" }), go: "releases", cta: t("common.update") });
    const alerts = (o.alerts ?? []).filter((a) => !["offline", "unmanaged"].includes(a.kind) || true);
    const attention = items.filter((a) => a.tone !== "info").length + alerts.length;
    const budget = o.data?.budgetMb || 0;
    return `
    ${o.total === 0 ? `<div class="card empty"><div class="ico">${ic("phone")}</div><h3>${t("ov.empty.h")}</h3><p>${t("ov.empty.p")}</p>${canWrite() ? `<button class="btn" data-go="provision">${ic("plus")} ${t("ov.empty.btn")}</button>` : ""}</div>` : `
    <div class="grid g4">
      ${stat({ label: t("ov.phones"), value: o.total, sub: t("ov.phones.sub", { live: o.live, total: o.total }), icon: "phone", go: "devices", filter: "all" })}
      ${stat({ label: t("ov.online"), value: o.online, sub: t("ov.online.sub", { pct: pct(o.online) }), icon: "activity", tone: "ok", go: "devices", filter: "online" })}
      ${stat({ label: t("ov.attention"), value: attention, sub: attention ? t("ov.attention.sub") : t("ov.attention.ok"), icon: "alert", tone: items.some((a) => a.tone === "bad") || alerts.some((a) => ALERT_TONE[a.kind] === "bad") ? "bad" : attention ? "warn" : "ok", go: "devices", filter: attention ? "alerts" : "all" })}
      ${stat({ label: t("ov.data"), value: fmtBytes(o.data?.mobileBytes ?? 0), sub: budget ? t("ov.data.sub", { wifi: fmtBytes(o.data?.wifiBytes ?? 0), budget: fmtGbFromMb(budget) }) : t("ov.data.nobudget", { wifi: fmtBytes(o.data?.wifiBytes ?? 0) }), icon: "signal", go: "devices", filter: "all" })}
    </div>
    <div class="card pad section strip">
      <div class="row between"><h3>${t("ov.status")}</h3><span class="hint" style="margin:0">${o.push ? t("ov.push.on") : t("ov.push.off", { min: Math.round(o.intervalSec / 60) })} ${t("ov.refresh")}</span></div>
      <div class="split" aria-hidden="true"><i class="on" style="width:${pct(o.online)}%"></i><i class="st" style="width:${pct(o.stale)}%"></i><i class="off" style="width:${pct(o.offline)}%"></i></div>
      <div class="legend"><span><b>${o.online}</b> ${t("ov.online.n")}</span><span><b>${o.stale}</b> ${t("ov.stale.n")}</span><span><b>${o.offline}</b> ${t("ov.offline.n")}</span></div>
    </div>
    <div class="grid g2 section" style="grid-template-columns:repeat(auto-fit,minmax(380px,1fr))">
      <div class="card">
        <div class="hd"><div><h3>${t("ov.needs")}</h3><p>${t("ov.needs.sub")}</p></div>${alerts.length && canWrite() ? `<button class="btn quiet sm" id="dismissAll">${t("common.dismissAll")}</button>` : ""}</div>
        ${items.map((a) => `<div class="todo"><div class="ic ${a.tone}">${ic(a.icon)}</div><div class="tx"><b>${a.t}</b><span>${a.d}</span></div><button class="btn ghost sm" data-go="${a.go}" ${a.filter ? `data-filter="${a.filter}"` : ""}>${a.cta}</button></div>`).join("")}
        ${alerts.map((a) => alertRow(a)).join("")}
        ${items.length + alerts.length ? "" : `<div class="todo"><div class="ic ok">${ic("check")}</div><div class="tx"><b>${t("ov.needs.none")}</b><span>${t("ov.needs.none.sub")}</span></div></div>`}
      </div>
      <div class="grid" style="align-content:start">
        <div class="card">
          <div class="hd"><div><h3>${t("ov.top")}</h3><p>${t("ov.top.sub")}</p></div></div>
          ${o.data?.top?.length ? `<div class="toplist">${o.data.top.map((x) => { const max = o.data.top[0].mobileBytes || 1; return `<div class="topitem" data-open="${x.id}" tabindex="0" role="button"><span class="nm">${esc(x.driverName || x.name)}</span><i><b style="width:${Math.max(4, (x.mobileBytes / max) * 100)}%"></b></i><span class="val ${budget && x.mobileBytes > budget * 1048576 ? "over" : ""}">${fmtBytes(x.mobileBytes)}</span></div>`; }).join("")}</div>` : `<div class="pad muted sm">${t("ov.top.none")}</div>`}
        </div>
        <div class="card">
          <div class="hd"><div><h3>${t("ov.recent")}</h3></div><button class="btn quiet sm" data-go="audit">${t("ov.viewall")} ${ic("chevron")}</button></div>
          <div class="feed">${audit.filter((a) => !/^setup:|apk-download/.test(a.action)).slice(0, 6).map((a) => `<div class="it"><time>${hhmm(a.ts)}</time><span><b>${esc(a.actor.split("@")[0])}</b> ${esc(actionLabel(a.action).toLowerCase())} ${esc(a.detail)}</span></div>`).join("") || `<div class="it"><span class="muted">${t("ov.nothing")}</span></div>`}</div>
        </div>
      </div>
    </div>`}`;
  },
  bind() {
    bindAlertRows();
    $$(".topitem").forEach((el) => el.onclick = () => openDevice(+el.dataset.open));
    $("#dismissAll")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { if (await ask({ title: t("common.dismissAll") + "?" })) { await api("POST", "/api/alerts/dismiss-all"); refresh(); } }));
  },
};

// ---------- Devices ----------
const dev = { q: "", group: "", status: "all", selected: new Set() };
let devAll = [], devGroups = [], devBudget = 0;
pages.devices = {
  title: "dev.title", live: true,
  sub: ([all] = [[]]) => t("dev.sub", { n: all?.length ?? 0 }),
  skeleton: () => skTable(8),
  load: () => Promise.all([get("/api/devices"), get("/api/groups"), get("/api/settings").catch(() => ({}))]),
  actions: () => `<button class="btn ghost" id="csv" title="${esc(t("common.export"))}">${ic("download")}<span class="lbl">${t("common.export")}</span></button>${canWrite() ? `<button class="btn" data-go="provision" title="${esc(t("dev.add"))}">${ic("plus")}<span class="lbl">${t("dev.add")}</span></button>` : ""}`,
  render([all, groups, settings]) {
    devAll = all; devGroups = groups; devBudget = settings?.dataBudgetMb || 0;
    const c = { all: all.length, online: all.filter((d) => d.state === "online").length, offline: all.filter((d) => d.state !== "online").length, pending: all.filter((d) => !d.approved).length,
      unmanaged: all.filter((d) => !d.deviceOwner).length, lost: all.filter((d) => d.lostMode).length, alerts: all.filter(hasAlert).length };
    if ((dev.status === "pending" && !c.pending) || (dev.status === "unmanaged" && !c.unmanaged) || (dev.status === "lost" && !c.lost) || (dev.status === "alerts" && !c.alerts)) dev.status = "all";
    const seg = (k, l, n) => `<button data-st="${k}" class="${dev.status === k ? "on" : ""}">${l}<small>${n}</small></button>`;
    return `
    <div class="toolbar">
      <div class="search">${ic("search")}<input id="q" placeholder="${esc(t("dev.search"))}" value="${esc(dev.q)}" autocomplete="off"></div>
      <div class="seg">${seg("all", t("dev.seg.all"), c.all)}${seg("online", t("dev.seg.online"), c.online)}${seg("offline", t("dev.seg.offline"), c.offline)}${c.alerts ? seg("alerts", t("dev.seg.alerts"), c.alerts) : ""}${c.pending ? seg("pending", t("dev.seg.pending"), c.pending) : ""}${c.unmanaged ? seg("unmanaged", t("dev.seg.unmanaged"), c.unmanaged) : ""}${c.lost ? seg("lost", t("dev.seg.lost"), c.lost) : ""}</div>
      <select id="fg" aria-label="${esc(t("th.group"))}"><option value="">${t("dev.groups.all")}</option><option value="none" ${dev.group === "none" ? "selected" : ""}>${t("dev.groups.none")}</option>${groups.map((g) => `<option value="${g.id}" ${String(dev.group) === String(g.id) ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
    </div>
    <div class="card tablecard devtable"><div class="tablewrap"><table>
      <thead><tr><th class="chk"><input type="checkbox" id="all" aria-label="Select all"></th><th>${t("th.phone")}</th><th>${t("th.status")}</th><th>${t("th.battery")}</th><th>${t("th.network")}</th><th>${t("th.data")}</th><th>${t("th.group")}</th><th>${t("th.seen")}</th><th></th></tr></thead>
      <tbody id="rows"></tbody></table></div></div>
    <div class="devcards" id="cards"></div>`;
  },
  bind() { drawRows(); $("#csv")?.addEventListener("click", exportCsv); },
};
const hasAlert = (d) => d.lostMode || !!d.problem || !d.deviceOwner || d.released || (devBudget && d.dataMonth && d.dataMonth.mobileBytes > devBudget * 1048576);
function visibleDevices() {
  const q = dev.q.trim().toLowerCase();
  return devAll.filter((d) =>
    (!q || [d.name, d.driverName, d.vehicle, d.model, modelName(d.model), d.serial, d.imei, d.notes].some((x) => String(x ?? "").toLowerCase().includes(q))) &&
    (!dev.group || String(d.groupId ?? "none") === String(dev.group)) &&
    (dev.status === "all" || (dev.status === "online" && d.state === "online") || (dev.status === "offline" && d.state !== "online") || (dev.status === "pending" && !d.approved) ||
      (dev.status === "unmanaged" && !d.deviceOwner) || (dev.status === "lost" && d.lostMode) || (dev.status === "alerts" && hasAlert(d))));
}
const devTitle = (d) => d.driverName ? `${esc(d.driverName)}` : esc(d.name);
const devSubtitle = (d) => [d.driverName ? d.name : null, d.vehicle || null, modelName(d.model)].filter(Boolean).map(esc).join(" · ");
const flags = (d) => `${d.live ? `<span class="pill info plain" title="${esc(t("state.live.title"))}">${ic("zap")} ${t("state.live")}</span>` : ""}${!d.approved ? `<span class="pill warn">${t("state.pending")}</span>` : ""}${!d.deviceOwner ? `<span class="pill bad">${t("state.unmanaged")}</span>` : ""}${d.lostMode ? `<span class="pill bad">${ic("pin")} ${t("state.lost")}</span>` : ""}${d.problem ? `<span class="pill info">${t("state.problem")}</span>` : ""}${d.removing ? `<span class="pill warn">${t("state.removing")}</span>` : ""}${d.released ? `<span class="pill bad">${t("state.released")}</span>` : ""}`;
function drawRows() {
  const list = visibleDevices(), gname = (id) => devGroups.find((g) => g.id === id)?.name;
  const body = $("#rows"); if (!body) return;
  body.innerHTML = list.map((d) => `<tr class="clickable ${d.lostMode ? "lostrow" : ""}" data-id="${d.id}">
    <td class="chk"><input type="checkbox" class="sel" data-id="${d.id}" ${dev.selected.has(d.id) ? "checked" : ""} aria-label="Select ${esc(d.name)}"></td>
    <td><div class="dev"><div class="ph">${ic(d.driverName ? "user" : "phone")}</div><div><b>${devTitle(d)}</b><span>${devSubtitle(d)}</span></div></div></td>
    <td><div class="row" style="gap:6px">${statePill(d)}${flags(d)}</div></td>
    <td>${battery(d)}</td>
    <td>${netPill(d)}</td>
    <td>${dataCell(d, devBudget)}</td>
    <td>${gname(d.groupId) ? esc(gname(d.groupId)) : `<span class="muted">—</span>`}${d.hasOverride ? ` <span class="pill plain">${t("state.custom")}</span>` : ""}</td>
    <td class="nowrap muted">${ago(d.lastSeen)}</td><td style="text-align:right;color:var(--text-3)">${ic("chevron")}</td></tr>`).join("") ||
    `<tr><td colspan="9"><div class="empty"><div class="ico">${ic("phone")}</div><h3>${devAll.length ? t("dev.nomatch") : t("dev.none")}</h3><p>${devAll.length ? t("dev.nomatch.p") : t("dev.none.p")}</p>${devAll.length || !canWrite() ? "" : `<button class="btn" data-go="provision">${ic("plus")} ${t("dev.add")}</button>`}</div></td></tr>`;
  // phone-sized screens get cards instead of a wide table
  const cards = $("#cards"); if (cards) cards.innerHTML = list.map((d) => `<div class="card devcard clickable ${d.lostMode ? "lostrow" : ""}" data-id="${d.id}" tabindex="0" role="button">
    <div class="row between"><div class="dev"><div class="ph">${ic(d.driverName ? "user" : "phone")}</div><div><b>${devTitle(d)}</b><span>${devSubtitle(d)}</span></div></div>${statePill(d)}</div>
    <div class="row" style="gap:6px;margin-top:8px">${flags(d)}</div>
    <div class="devmeta">${battery(d)}${netPill(d)}${dataCell(d, devBudget)}<span class="muted">${ago(d.lastSeen)}</span></div></div>`).join("");
  const all = $("#all"); if (all) { all.checked = list.length > 0 && list.every((d) => dev.selected.has(d.id)); }
  renderBulk();
}
function renderBulk() {
  const n = dev.selected.size, b = $("#bulk");
  const pend = devAll.filter((d) => dev.selected.has(d.id) && !d.approved).length;
  b.classList.toggle("show", n > 0 && tab === "devices" && canWrite());
  b.innerHTML = `<b>${t("dev.selected", { n })}</b>${pend ? `<button class="btn" data-bulk="approve">${ic("check")} ${t("bulk.approve", { n: pend })}</button>` : ""}<button class="btn" data-bulk="refresh">${ic("refresh")} ${t("bulk.refresh")}</button><button class="btn" data-bulk="lock">${t("bulk.lock")}</button><button class="btn" data-bulk="reboot">${t("bulk.reboot")}</button><button class="btn quiet" data-bulk="clear">${t("bulk.clear")}</button>`;
}
function exportCsv() {
  const gname = (id) => devGroups.find((g) => g.id === id)?.name ?? "";
  const cols = ["name", "driverName", "driverPhone", "vehicle", "model", "serial", "imei", "simOperator", "state", "battery", "network", "dataMobileMB", "dataWifiMB", "group", "agentVersion", "lastSeen"];
  const rows = visibleDevices().map((d) => ({ ...d, model: modelName(d.model), dataMobileMB: Math.round((d.dataMonth?.mobileBytes ?? 0) / 1048576), dataWifiMB: Math.round((d.dataMonth?.wifiBytes ?? 0) / 1048576), group: gname(d.groupId), lastSeen: d.lastSeen ? new Date(d.lastSeen).toISOString() : "" }));
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = `confiance-phones-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

// --- usage chart: 30 days of cellular (blue) and Wi-Fi (orange) per phone ---
const CHART = { mobile: "#2a78d6", wifi: "#eb6834" };
function usageChart(u) {
  const days = u.days ?? [];
  if (!days.length) return `<p class="hint">${t("d.data.none")}</p>`;
  const W = 600, H = 150, padL = 44, padB = 22, padT = 8, n = Math.max(days.length, 14);
  const max = Math.max(1, ...days.map((d) => d.mobileBytes + d.wifiBytes));
  const unit = max >= 1073741824 ? 1073741824 : 1048576, unitLabel = max >= 1073741824 ? t("bytes.gb") : t("bytes.mb");
  const step = niceStep(max / unit); const top = Math.ceil(max / unit / step) * step * unit;
  const bw = (W - padL - 8) / n, inner = Math.max(2, bw - 3), y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const bars = days.map((d, i) => {
    const x = padL + i * bw + (bw - inner) / 2, yM = y(d.mobileBytes), yW = y(d.mobileBytes + d.wifiBytes);
    const gap = d.mobileBytes && d.wifiBytes ? 2 : 0;
    return `<g class="bar" data-i="${i}"><rect x="${x.toFixed(1)}" y="${yM.toFixed(1)}" width="${inner.toFixed(1)}" height="${Math.max(0, y(0) - yM).toFixed(1)}" fill="${CHART.mobile}" rx="2"/>
      <rect x="${x.toFixed(1)}" y="${yW.toFixed(1)}" width="${inner.toFixed(1)}" height="${Math.max(0, yM - yW - gap).toFixed(1)}" fill="${CHART.wifi}" rx="2"/>
      <rect class="hit" x="${(padL + i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"><title>${esc(dayLabel(d.day, true))}: ${esc(t("d.data.mobile"))} ${fmtBytes(d.mobileBytes)} · ${esc(t("d.data.wifi"))} ${fmtBytes(d.wifiBytes)}</title></rect></g>`;
  }).join("");
  const ticks = []; for (let v = 0; v <= top / unit + 1e-9; v += step) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${padL}" x2="${W - 8}" y1="${y(v * unit).toFixed(1)}" y2="${y(v * unit).toFixed(1)}" class="grid"/><text x="${padL - 6}" y="${(y(v * unit) + 4).toFixed(1)}" class="tick" text-anchor="end">${nf(v, step < 1 ? 1 : 0)}</text>`).join("");
  const every = days.length > 20 ? 5 : days.length > 10 ? 3 : 1;
  const xl = days.map((d, i) => i % every === 0 || i === days.length - 1 ? `<text x="${(padL + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="tick" text-anchor="middle">${esc(dayLabel(d.day))}</text>` : "").join("");
  return `<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(t("d.data.h"))}">${grid}${bars}<line x1="${padL}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}" class="axis"/>${xl}</svg>
    <div class="legend chartlegend"><span><i style="background:${CHART.mobile}"></i>${t("d.data.mobile")}</span><span><i style="background:${CHART.wifi}"></i>${t("d.data.wifi")}</span><span class="muted">${esc(unitLabel)}</span></div></div>`;
}
const niceStep = (range) => { const raw = range / 4 || 1, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const dayLabel = (day, long = false) => { const d = new Date(day + "T12:00:00"); return d.toLocaleDateString(LOCALE(), long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" }); };
const usageTable = (u) => `<div class="card tablecard" style="margin-top:10px"><table><thead><tr><th>${t("d.data.day")}</th><th>${t("d.data.mobile")}</th><th>${t("d.data.wifi")}</th></tr></thead><tbody>${[...(u.days ?? [])].reverse().map((d) => `<tr><td>${esc(dayLabel(d.day, true))}</td><td>${fmtBytes(d.mobileBytes)}</td><td>${fmtBytes(d.wifiBytes)}</td></tr>`).join("")}</tbody></table></div>`;
const minutes = (m) => m >= 60 ? t("d.data.h.short", { h: Math.floor(m / 60), m: m % 60 }) : t("d.data.min", { n: m });

// --- device drawer ---
async function openDevice(id) {
  const row = devAll.find((d) => d.id === id);
  openDlg(`<div class="hd"><div class="grow"><h2>${esc(row?.driverName || row?.name || "")}</h2></div><button class="btn quiet icon" data-close aria-label="${esc(t("common.close"))}">${ic("x")}</button></div><div class="bd"><div class="sk t" style="width:40%"></div><div class="sk t"></div><div class="sk t"></div><div class="sk h" style="width:100%"></div></div>`, true);
  let d, apps, gs, usage, managed;
  try { [d, apps, gs, usage, managed] = await Promise.all([get(`/api/devices/${id}`), get("/api/apps"), get("/api/groups"), get(`/api/devices/${id}/usage?days=30`), get("/api/managed-apps")]); } catch (e) { closeDlg(); return fail(e); }
  const everyone = apps.filter((a) => a.allowed);
  const eff = d.effective.allowedApps.map((a) => a.pkg);
  const known = new Map(apps.filter((a) => !a.allowed).map((a) => [a.pkg, a.label])); d.effective.allowedApps.forEach((a) => { if (!everyone.some((x) => x.pkg === a.pkg)) known.set(a.pkg, a.label); });
  const kv = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const budget = usage.budgetMb || 0, overPct = budget ? Math.round((usage.month.mobileBytes / (budget * 1048576)) * 100) : 0;
  const today = usage.days.find((x) => x.day === usage.today);
  const appUsage = today ? Object.entries(today.appUsage ?? {}).sort((a, b) => b[1] - a[1]) : [];
  const dlg = openDlg(`
    <div class="hd"><div class="dev"><div class="ph">${ic(d.driverName ? "user" : "phone")}</div><div class="grow"><h2>${esc(d.driverName || d.name)}</h2><span class="muted sm">${[d.driverName ? d.name : null, d.vehicle].filter(Boolean).map(esc).join(" · ") || esc(modelName(d.model))}</span></div></div><span class="grow"></span>${statePill(d)}<button class="btn quiet icon" data-close aria-label="${esc(t("common.close"))}">${ic("x")}</button></div>
    <div class="bd">
      ${d.lostMode ? `<div class="banner bad" style="margin-bottom:16px">${ic("pin")}<div class="t"><b>${t("d.lost.h")}</b><span>${esc(t("d.lost.p", { msg: d.lostMessage || d.effective.lostMode?.message || "", phone: d.effective.lostMode?.phone || "—" }))}</span></div>${canWrite() ? `<button class="btn sm" data-cmd="found">${t("d.lost.found")}</button>` : ""}</div>` : ""}
      ${d.problem ? `<div class="banner info" style="margin-bottom:16px">${ic("bell")}<div class="t"><b>${t("d.problem.h")}</b><span>“${esc(d.problem)}” · ${ago(d.problemAt)}</span></div>${canWrite() ? `<button class="btn ghost sm" id="clearProblem">${t("d.problem.resolve")}</button>` : ""}</div>` : ""}
      ${!d.deviceOwner ? `<div class="banner bad" style="margin-bottom:16px">${ic("alert")}<div class="t"><b>${t("d.unmanaged.h")}</b><span>${t("d.unmanaged.p")}</span></div></div>` : ""}
      ${!d.approved ? `<div class="banner warn" style="margin-bottom:16px">${ic("shield")}<div class="t"><b>${t("d.pending.h")}</b><span>${t("d.pending.p")}</span></div></div>` : ""}
      <dl class="kv">
        ${kv(t("d.k.battery"), battery(d))}${kv(t("d.k.network"), `${netPill(d)}${d.signal != null && d.signal >= 0 ? ` <span class="muted sm">· ${Math.min(4, d.signal)}/4</span>` : ""}${d.simOperator ? ` <span class="muted sm">· ${esc(d.simOperator)}</span>` : ""}`)}
        ${kv(t("d.k.seen"), ago(d.lastSeen))}${kv(t("d.k.app"), `${esc(d.agentVersion ?? "—")}${pageData.overview?.[0]?.currentVersionCode && d.agentVersionCode && d.agentVersionCode < pageData.overview[0].currentVersionCode ? ` <span class="pill warn plain">${t("d.outdated")}</span>` : ""}`)}
        ${kv(t("d.k.mgmt"), d.deviceOwner ? `<span class="pill ok">${t("d.managed")}</span>` : `<span class="pill bad">${t("d.notmanaged")}</span>`)}
        ${kv(t("d.k.live"), d.live ? `<span class="pill info plain">${ic("zap")} ${t("state.live")}</span>` : `<span class="muted">${t("d.k.live.no")}</span>`)}
        ${kv(t("d.k.android"), `${esc(androidShort(d.osVersion)) || "—"}${d.securityPatch ? ` <span class="muted sm">· ${t("d.k.patch")} ${esc(d.securityPatch)}</span>` : ""}`)}
        ${kv(t("d.k.storage"), fmtGbFromMb(d.freeStorageMb))}${kv(t("d.k.serial"), esc(d.serial || "—"))}${kv(t("d.k.imei"), esc(d.imei || "—"))}
        ${d.phoneNumber ? kv(t("d.k.sim"), esc(d.phoneNumber)) : ""}
        ${kv(t("d.k.location"), d.location ? `<a href="https://www.openstreetmap.org/?mlat=${d.location.lat}&mlon=${d.location.lon}#map=16/${d.location.lat}/${d.location.lon}" target="_blank" rel="noopener">${ic("pin")} ${t("d.k.location.map")}</a> <span class="muted sm">· ${ago(d.location.at)}${d.location.accuracy ? ` · ±${Math.round(d.location.accuracy)} m` : ""}</span>` : `<span class="muted">—</span>`)}
        ${kv(t("d.k.usage"), d.usageAccess ? `<span class="pill ok plain">${t("common.on")}</span>` : `<span class="muted">${t("d.k.usage.no")}</span>`)}
        ${kv(t("d.k.enrolled"), when(d.enrolledAt))}
      </dl>

      <h3 style="margin:24px 0 8px">${t("d.data.h")} <span class="muted sm" style="font-weight:400">· ${t("d.data.month")}</span></h3>
      <div class="datasum">
        <div><span class="k"><i style="background:${CHART.mobile}"></i>${t("d.data.mobile")}</span><b class="${budget && overPct > 100 ? "over" : ""}">${fmtBytes(usage.month.mobileBytes)}</b>${budget ? `<div class="budget"><i style="width:${Math.min(100, overPct)}%" class="${overPct > 100 ? "over" : overPct > 80 ? "warn" : ""}"></i></div><span class="hint">${t("d.data.budget", { b: fmtGbFromMb(budget), pct: overPct })}</span>` : ""}</div>
        <div><span class="k"><i style="background:${CHART.wifi}"></i>${t("d.data.wifi")}</span><b>${fmtBytes(usage.month.wifiBytes)}</b></div>
        <div><span class="k">${t("d.data.today")}</span><b>${fmtBytes((today?.mobileBytes ?? 0) + (today?.wifiBytes ?? 0))}</b></div>
      </div>
      <div class="row between" style="margin-top:12px"><span></span><div class="seg sm"><button class="on" data-uview="chart">${t("d.data.chart")}</button><button data-uview="table">${t("d.data.table")}</button></div></div>
      <div id="uchart">${usageChart(usage)}</div><div id="utable" class="hidden">${usageTable(usage)}</div>
      ${appUsage.length ? `<h4 class="subh">${t("d.data.apps")}</h4><div class="apptime">${appUsage.slice(0, 8).map(([pkg, m]) => `<div><span>${esc(known.get(pkg) ?? pkg)}</span><i><b style="width:${Math.min(100, (m / Math.max(1, appUsage[0][1])) * 100)}%"></b></i><span class="nowrap">${minutes(m)}</span></div>`).join("")}</div>` : ""}

      ${canWrite() ? `<h3 style="margin:24px 0 2px">${t("d.controls")}</h3><p class="hint" style="margin:0">${d.live ? t("d.controls.live") : t("d.controls.poll")}</p>
      <div class="cmdgrid">
        <button class="btn ghost" data-cmd="refresh">${ic("refresh")} ${t("cmd.refresh")}</button><button class="btn ghost" data-cmd="lock">${ic("lock")} ${t("cmd.lock")}</button><button class="btn ghost" data-cmd="reboot">${t("cmd.reboot")}</button>
        <button class="btn ghost" data-cmd="${d.released ? "relock" : "release"}">${d.released ? t("cmd.relock") : t("cmd.release")}</button>
        <button class="btn ghost" data-cmd="ring">${ic("bell")} ${t("cmd.ring")}</button><button class="btn ghost" data-cmd="locate">${ic("pin")} ${t("cmd.locate")}</button>
        ${d.lostMode ? `<button class="btn" data-cmd="found">${t("cmd.found")}</button>` : `<button class="btn ghost" id="lostBtn" style="color:var(--bad);border-color:var(--bad-bd)">${ic("pin")} ${t("cmd.lost")}</button>`}
        <button class="btn ghost" id="wipeBtn" style="color:var(--bad);border-color:var(--bad-bd)">${ic("trash")} ${t("cmd.wipe")}</button>
      </div>` : ""}

      <h3 style="margin:24px 0 4px">${t("d.config")}</h3>
      <div class="grid g2" style="gap:0 14px">
        <div class="field"><label for="dDriver">${t("d.f.driver")}</label><input id="dDriver" value="${esc(d.driverName)}" ${ro()}></div>
        <div class="field"><label for="dDriverPhone">${t("d.f.driverPhone")}</label><input id="dDriverPhone" value="${esc(d.driverPhone)}" ${ro()}></div>
        <div class="field"><label for="dVehicle">${t("d.f.vehicle")}</label><input id="dVehicle" value="${esc(d.vehicle)}" placeholder="Toyota Prado · LT 452 AB" ${ro()}></div>
        <div class="field"><label for="dName">${t("d.f.name")}</label><input id="dName" value="${esc(d.name)}" ${ro()}></div>
      </div>
      <div class="field"><label for="dGroup">${t("d.f.group")}</label><select id="dGroup" ${ro()}><option value="">${t("d.f.group.none")}</option>${gs.map((g) => `<option value="${g.id}" ${g.id === d.groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("d.f.apps")}</label>
        ${check("dOverride", t("d.f.override"), t("d.f.override.h"), !!d.allowedOverride, ro())}
        <div class="apps" id="dApps">${[...known].map(([p, l]) => `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(l)}" ${eff.includes(p) ? "checked" : ""} ${ro()}> ${esc(l)} <small>${esc(p)}${managed.some((m) => m.pkg === p) ? ` · ${ic("pkg")}` : ""}</small></label>`).join("") || `<label class="muted">${t("d.f.noapps")}</label>`}</div>${everyone.length ? `<p class="hint">${t("a.also", { list: everyone.map((a) => esc(a.label)).join(", ") })}</p>` : ""}</div>
      <div class="field"><label for="dMsg">${t("d.f.msg")} <span class="muted">${t("common.optional")}</span></label><input id="dMsg" value="${esc(d.messageOverride ?? "")}" placeholder="${esc(t("d.f.msg.ph"))}" ${ro()}></div>
      <div class="field"><label for="dNotes">${t("d.f.notes")}</label><textarea id="dNotes" rows="2" ${ro()}>${esc(d.notes)}</textarea></div>
      ${d.lastError ? `<h3 style="margin:24px 0 8px">${t("d.error")}</h3>${/VERIFICATION_FAILURE|Install not allowed/i.test(d.lastError) ? `<div class="banner warn" style="margin-bottom:10px">${ic("alert")}<div class="t"><b>${t("d.error.autoblocker")}</b><span>${t("d.error.autoblocker.p")}</span></div></div>` : ""}<pre class="box">${esc(d.lastError)}</pre>` : ""}
      ${d.lastCrash ? `<h3 style="margin:24px 0 8px">${t("d.crash")}</h3><pre class="box">${esc(d.lastCrash)}</pre>` : ""}
      <h3 style="margin:24px 0 8px">${t("d.cmds")}</h3>
      <div class="card tablecard"><table><tbody>${d.commands.map((c) => `<tr><td><b>${esc(t(`cmd.${c.type}`) === `cmd.${c.type}` ? c.type : t(`cmd.${c.type}`).replace(/…$/, ""))}</b></td><td>${c.status === "done" ? `<span class="pill ok">${t("cmd.done")}</span>` : c.status === "failed" ? `<span class="pill bad">${t("cmd.failed")}</span>` : `<span class="pill warn">${esc(c.status)}</span>`}${c.error ? ` <span class="muted sm">${esc(c.error)}</span>` : ""}</td><td class="muted sm nowrap">${ago(c.created_at)}</td></tr>`).join("") || `<tr><td class="muted">${t("d.cmds.none")}</td></tr>`}</tbody></table></div>
    </div>
    ${canWrite() ? `<div class="ft"><button class="btn" id="save">${t("d.save")}</button>${d.approved ? "" : `<button class="btn" id="approveOne">${t("d.approve")}</button>`}<span class="grow"></span><button class="btn ghost" id="del" style="color:var(--bad);border-color:var(--bad-bd)">${ic("trash")} ${t("d.remove")}</button></div>` : ""}`, true);
  $$("[data-uview]", dlg).forEach((b) => b.onclick = () => { $$("[data-uview]", dlg).forEach((x) => x.classList.toggle("on", x === b)); $("#uchart").classList.toggle("hidden", b.dataset.uview !== "chart"); $("#utable").classList.toggle("hidden", b.dataset.uview !== "table"); });
  const reopen = () => openDevice(id);
  const send = async (type, body = {}, msgOk = true) => { await api("POST", `/api/devices/${id}/commands`, { type, ...body }); if (msgOk) toast(d.live ? t("cmd.sent.live") : t("cmd.sent.poll")); reopen(); refresh(); };
  $$("[data-cmd]", dlg).forEach((b) => b.onclick = () => busy(b, async () => {
    const type = b.dataset.cmd;
    const desc = { reboot: "cmd.reboot.d", lock: "cmd.lock.d", release: "cmd.release.d", relock: "cmd.relock.d", ring: "cmd.ring.d", locate: "cmd.locate.d" }[type];
    if (desc && !(await ask({ title: t("cmd.ask", { action: b.textContent.trim() }), body: t(desc), ok: b.textContent.trim() }))) return;
    await send(type);
  }));
  if (!canWrite()) return;
  $("#clearProblem")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", `/api/devices/${id}/problem/clear`); reopen(); refresh(); }));
  $("#lostBtn")?.addEventListener("click", () => lostDialog(d, send));
  $("#wipeBtn")?.addEventListener("click", async () => {
    const typed = await ask({ title: t("wipe.title"), body: t("wipe.p"), ok: t("wipe.go"), danger: true, input: { label: t("d.f.name"), placeholder: d.name } });
    if (typed === false) return;
    if (String(typed).trim() !== d.name) return toast(t("wipe.mismatch"), "err");
    await send("wipe").catch(fail);
  });
  $("#approveOne")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", `/api/devices/${id}/approve`); toast(t("d.approved")); reopen(); refresh(); }));
  $("#save").onclick = (e) => busy(e.currentTarget, async () => {
    const override = $("#dOverride").checked ? $$("#dApps input:checked").map((i) => ({ pkg: i.value, label: i.dataset.label })) : null;
    await api("PATCH", `/api/devices/${id}`, { name: $("#dName").value, driverName: $("#dDriver").value, driverPhone: $("#dDriverPhone").value, vehicle: $("#dVehicle").value, groupId: $("#dGroup").value ? +$("#dGroup").value : null, allowedOverride: override, messageOverride: $("#dMsg").value || null, notes: $("#dNotes").value });
    toast(t("common.saved")); reopen(); refresh();
  });
  $("#del").onclick = (e) => busy(e.currentTarget, async () => {
    if (!(await ask({ title: t("d.remove.ask"), body: t("d.remove.p"), ok: t("d.remove"), danger: true }))) return;
    const r = await api("DELETE", `/api/devices/${id}`);
    toast(r.removed ? t("d.removed") : t("d.remove.sent"));
    closeDlg(); refresh();
  });
  if (d.removing) $("#del").insertAdjacentHTML("afterend", ` <button class="btn ghost" id="delNow">${t("d.removeNow")}</button>`);
  $("#delNow")?.addEventListener("click", async () => { if (!(await ask({ title: t("d.delnow.ask"), body: t("d.delnow.p"), ok: t("d.removeNow"), danger: true }))) return; await api("DELETE", `/api/devices/${id}?force=1`).catch(fail); closeDlg(); refresh(); });
}
function lostDialog(d, send) {
  const dispatch = pageData.settings?.[0]?.dispatchPhone ?? "";
  const dlg = $("#cfm");
  $("#cfmBody").innerHTML = `<div class="hd"><h2>${t("lost.title")}</h2></div><div class="bd"><p style="margin:0 0 8px;color:var(--text-2)">${t("lost.p")}</p>
    <div class="field"><label for="lMsg">${t("lost.msg")}</label><textarea id="lMsg" rows="3">${esc(t("lost.msg.default"))}</textarea></div>
    <div class="field"><label for="lPhone">${t("lost.phone")}</label><input id="lPhone" value="${esc(dispatch)}" placeholder="+237 6 00 00 00 00"></div></div>
    <div class="ft"><button class="btn danger" id="lGo">${ic("pin")} ${t("lost.go")}</button><button class="btn ghost" id="lNo">${t("common.cancel")}</button></div>`;
  dlg.showModal();
  $("#lNo").onclick = () => dlg.close();
  $("#lGo").onclick = (e) => busy(e.currentTarget, async () => { await send("lost", { message: $("#lMsg").value, phone: $("#lPhone").value }); dlg.close(); });
}

// Apps the Galaxy phones ship with, so they can be allowed before any phone has reported its list.
const SYSTEM_APPS = [
  ["com.samsung.android.dialer", "Phone"], ["com.samsung.android.messaging", "Messages"], ["com.samsung.android.app.contacts", "Contacts"],
  ["com.sec.android.app.camera", "Camera"], ["com.sec.android.gallery3d", "Gallery"], ["com.android.chrome", "Chrome"],
  ["com.sec.android.app.sbrowser", "Samsung Internet"], ["com.google.android.apps.maps", "Google Maps"], ["com.waze", "Waze"],
  ["com.whatsapp", "WhatsApp"], ["com.google.android.gm", "Gmail"], ["com.google.android.youtube", "YouTube"],
  ["com.sec.android.app.clockpackage", "Clock"], ["com.sec.android.app.popupcalculator", "Calculator"], ["com.samsung.android.calendar", "Calendar"],
  ["com.sec.android.app.myfiles", "My Files"], ["com.google.android.googlequicksearchbox", "Google"], ["com.android.vending", "Play Store"],
  ["com.android.settings", "Settings"],
];
function appCatalogue(apps) {
  const m = new Map(apps.map((a) => [a.pkg, { ...a }]));
  for (const [pkg, label] of SYSTEM_APPS) { const cur = m.get(pkg); if (cur) cur.system = true; else m.set(pkg, { pkg, label, devices: 0, system: true, allowed: false }); }
  return [...m.values()].sort((a, b) => (b.allowed - a.allowed) || (b.devices > 0) - (a.devices > 0) || a.label.localeCompare(b.label));
}

// ---------- Groups ----------
pages.groups = {
  title: "g.title", sub: "g.sub",
  actions: () => (canWrite() ? `<button class="btn" id="newGroup" title="${esc(t("g.new"))}">${ic("plus")}<span class="lbl">${t("g.new")}</span></button>` : ""),
  skeleton: () => skForm(),
  load: () => Promise.all([get("/api/groups"), get("/api/apps")]),
  render([gs]) {
    return gs.length ? `<div class="grid g3">${gs.map((g) => `<div class="card pad"><div class="row between"><h3>${esc(g.name)}</h3><span class="pill plain">${t("common.phones", { n: g.devices })}</span></div>
      <p class="muted" style="margin:10px 0 14px;min-height:40px">${g.allowedApps.length ? g.allowedApps.map((a) => esc(a.label)).join(", ") : t("g.noapps")}</p>
      ${g.message ? `<p class="sm" style="margin:0 0 12px;color:var(--text-2)">“${esc(g.message)}”</p>` : ""}
      ${canWrite() ? `<button class="btn ghost sm" data-edit="${g.id}">${t("g.edit")}</button>` : ""}</div>`).join("")}</div>`
      : `<div class="card empty"><div class="ico">${ic("layers")}</div><h3>${t("g.empty.h")}</h3><p>${t("g.empty.p")}</p>${canWrite() ? `<button class="btn" id="newGroup2">${ic("plus")} ${t("g.create")}</button>` : ""}</div>`;
  },
  bind([gs, apps]) {
    const open = (g) => groupDialog(g, apps);
    $("#newGroup")?.addEventListener("click", () => open(null)); $("#newGroup2")?.addEventListener("click", () => open(null));
    $$("[data-edit]").forEach((b) => b.onclick = () => open(gs.find((g) => g.id === +b.dataset.edit)));
  },
};
function groupDialog(g, apps) {
  const sel = (g?.allowedApps ?? []).map((a) => a.pkg);
  const everyone = apps.filter((a) => a.allowed);
  const known = new Map(apps.filter((a) => !a.allowed).map((a) => [a.pkg, a.label])); (g?.allowedApps ?? []).forEach((a) => { if (!everyone.some((x) => x.pkg === a.pkg)) known.set(a.pkg, a.label); });
  openDlg(`<div class="hd"><div class="grow"><h2>${g ? t("g.edit") : t("g.new")}</h2></div><button class="btn quiet icon" data-close aria-label="${esc(t("common.close"))}">${ic("x")}</button></div>
    <div class="bd">
      <div class="field"><label for="gName">${t("g.name")}</label><input id="gName" value="${esc(g?.name ?? "")}" placeholder="${esc(t("g.name.ph"))}"></div>
      <div class="field"><label>${t("g.apps")}</label><div class="apps" id="gApps">${[...known].map(([p, l]) => `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(l)}" ${sel.includes(p) ? "checked" : ""}> ${esc(l)} <small>${esc(p)}</small></label>`).join("") || `<label class="muted">${t("g.noapps.yet")}</label>`}</div>
        <p class="hint">${t("g.apps.hint")}${everyone.length ? ` ${t("a.also", { list: everyone.map((a) => esc(a.label)).join(", ") })}` : ""}</p></div>
      <div class="field"><label for="gPkg">${t("g.pkg")}</label><div class="row"><input id="gPkg" placeholder="com.company.app" style="flex:1"><button class="btn ghost" id="gAdd">${t("g.pkg.add")}</button></div></div>
      <div class="field"><label for="gMsg">${t("g.msg")}</label><input id="gMsg" value="${esc(g?.message ?? "")}"></div>
    </div>
    <div class="ft"><button class="btn" id="gSave">${t("g.save")}</button><button class="btn ghost" data-close>${t("common.cancel")}</button>${g ? `<span class="grow"></span><button class="btn danger" id="gDel">${ic("trash")} ${t("common.delete")}</button>` : ""}</div>`);
  $("#gAdd").onclick = () => { const p = $("#gPkg").value.trim(); if (!/^[A-Za-z0-9_.]+$/.test(p)) return toast(t("g.pkg.bad"), "err"); $("#gApps").insertAdjacentHTML("beforeend", `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(p)}" checked> ${esc(p)}</label>`); $("#gPkg").value = ""; };
  $("#gSave").onclick = (e) => busy(e.currentTarget, async () => {
    const body = { name: $("#gName").value, message: $("#gMsg").value, allowedApps: $$("#gApps input:checked").map((i) => ({ pkg: i.value, label: i.dataset.label })) };
    g ? await api("PATCH", `/api/groups/${g.id}`, body) : await api("POST", "/api/groups", body);
    closeDlg(); toast(t("g.saved")); refresh();
  });
  if (g) $("#gDel").onclick = async () => { if (!(await ask({ title: t("g.del.ask"), body: t("g.del.p"), ok: t("g.del"), danger: true }))) return; await api("DELETE", `/api/groups/${g.id}`).catch(fail); closeDlg(); refresh(); };
}

// ---------- Add phones ----------
pages.provision = {
  title: "p.title", sub: "p.sub",
  skeleton: () => skForm(),
  load: () => Promise.all([get("/api/enroll-tokens"), get("/api/groups")]),
  render([tokens, gs]) {
    return `
    <div class="grid g2">
      <div class="card pad"><h3>${t("p.how")}</h3>
        <ol class="steps" style="margin-top:16px">
          <li><div><b>${t("p.s1")}</b><div class="muted sm">${t("p.s1.d")}</div></div></li>
          <li><div><b>${t("p.s2")}</b><div class="muted sm">${t("p.s2.d")}</div></div></li>
          <li><div><b>${t("p.s3")}</b><div class="muted sm">${t("p.s3.d")}</div></div></li>
          <li><div><b>${t("p.s4")}</b><div class="muted sm">${t("p.s4.d")}</div></div></li>
        </ol>
        <div class="banner info" style="margin-top:18px">${ic("info")}<div class="t"><b>${t("p.usb.h")}</b><span>${t("p.usb.p")} <a href="${BASE}setup/setup-phone.ps1" download>${t("p.usb.win")}</a> · <a href="${BASE}setup/setup-phone.sh" download>${t("p.usb.mac")}</a></span></div></div>
      </div>
      ${canWrite() ? `<div class="card pad"><h3>${t("p.new")}</h3><p class="hint" style="margin-top:4px">${t("p.new.p")}</p>
        <div class="field"><label for="tLabel">${t("p.label")}</label><input id="tLabel" value="Driver"><p class="hint" id="tHint">${t("p.label.h", { l: "Driver" })}</p></div>
        <div class="field"><label for="tGroup">${t("p.group")}</label><select id="tGroup"><option value="">${t("dev.groups.none")}</option>${gs.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        <div class="row" style="margin-top:14px"><div class="field" style="margin:0;flex:1"><label for="tDays">${t("p.days")}</label><input id="tDays" type="number" value="30" min="1" max="365"></div><div class="field" style="margin:0;flex:1"><label for="tMax">${t("p.max")}</label><input id="tMax" type="number" value="200" min="1"></div></div>
        <button class="btn" id="tCreate" style="margin-top:18px">${ic("qr")} ${t("p.create")}</button></div>` : ""}
    </div>
    <h3 style="margin:28px 0 12px">${t("p.codes")}</h3>
    <div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>${t("th.name")}</th><th>${t("th.code")}</th><th>${t("th.group")}</th><th>${t("th.used")}</th><th>${t("th.expires")}</th><th></th></tr></thead><tbody>
      ${tokens.map((tk) => `<tr><td><b>${esc(tk.label)}</b></td><td><code style="font-size:13.5px;letter-spacing:.05em">${esc(tk.code)}</code> <button class="btn quiet sm icon" data-copy="${esc(tk.code)}" title="${esc(t("p.copy"))}" aria-label="${esc(t("p.copy"))}">${ic("copy")}</button></td><td>${esc(tk.groupName ?? "—")}</td><td><b>${tk.devices ?? 0}</b> <span class="muted sm">· ${t("p.setups", { n: tk.uses })}</span></td><td class="muted">${when(tk.expiresAt)}${tk.expiresAt < Date.now() ? ` <span class="pill bad plain">${t("p.expired")}</span>` : ""}</td>
        <td style="text-align:right" class="nowrap"><button class="btn ghost sm" data-qr="${esc(tk.token)}">${ic("qr")} ${t("p.showqr")}</button>${canWrite() ? ` <button class="btn quiet sm icon" data-rm="${esc(tk.token)}" title="${esc(t("p.del"))}" aria-label="${esc(t("p.del"))}">${ic("trash")}</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty"><div class="ico">${ic("qr")}</div><h3>${t("p.none.h")}</h3><p>${t("p.none.p")}</p></div></td></tr>`}
    </tbody></table></div></div>`;
  },
  bind() {
    const showQr = async (token, btn) => {
      await busy(btn, async () => {
        const r = await get(`/api/provisioning/${encodeURIComponent(token)}`);
        openDlg(`<div class="hd"><div class="grow"><h2>${t("p.qr.h")}</h2></div><button class="btn quiet icon" data-close aria-label="${esc(t("common.close"))}">${ic("x")}</button></div><div class="bd qr"><img src="${r.qr}" alt="Setup QR code"><p class="hint" style="margin-top:14px">${t("p.qr.p")}</p></div>
          <div class="ft" style="justify-content:center"><button class="btn" id="qPrint">${t("common.print")}</button><button class="btn ghost" data-close>${t("common.close")}</button></div>`);
        $("#qPrint").onclick = () => window.print();
      });
    };
    $("#tLabel")?.addEventListener("input", (e) => { $("#tHint").textContent = t("p.label.h", { l: e.target.value || "Driver" }); });
    $("#tCreate")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const r = await api("POST", "/api/enroll-tokens", { label: $("#tLabel").value, groupId: $("#tGroup").value ? +$("#tGroup").value : null, days: +$("#tDays").value, maxUses: +$("#tMax").value });
      pageData.provision = await pages.provision.load(); paint("provision", pageData.provision); showQr(r.token);
    }));
    $$("[data-copy]").forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast(t("common.copied")); } catch { toast(b.dataset.copy); } });
    $$("[data-qr]").forEach((b) => b.onclick = () => showQr(b.dataset.qr, b));
    $$("[data-rm]").forEach((b) => b.onclick = async () => { if (await ask({ title: t("p.del.ask"), body: t("p.del.p"), ok: t("common.delete"), danger: true })) { await api("DELETE", `/api/enroll-tokens/${encodeURIComponent(b.dataset.rm)}`).catch(fail); refresh(); } });
  },
};

// ---------- Apps (kiosk versions + managed apps) ----------
pages.releases = {
  title: "r.title", sub: "r.sub",
  skeleton: () => skTable(4),
  load: () => Promise.all([get("/api/releases"), get("/api/overview"), get("/api/groups"), get("/api/managed-apps"), get("/api/apps")]),
  render([rs, o, gs, managed, apps]) {
    const latest = new Map(); for (const m of managed) if (!latest.has(m.pkg)) latest.set(m.pkg, m);
    const cat = appCatalogue(apps);
    return `
    <div class="card section" id="appsCat"><div class="hd"><div><h3>${t("a.h")}</h3><p>${t("a.p")}</p></div><input id="aSearch" placeholder="${esc(t("a.search"))}" style="max-width:220px"></div>
      <div class="tablewrap"><table><thead><tr><th style="width:120px">${t("a.allowed")}</th><th>${t("m.label")}</th><th>${t("m.pkg")}</th><th>${t("a.on")}</th></tr></thead><tbody id="aRows">
        ${cat.map((a) => `<tr data-q="${esc((a.label + " " + a.pkg).toLowerCase())}"><td><label class="check" style="margin:0"><input type="checkbox" class="aAllow" value="${esc(a.pkg)}" data-label="${esc(a.label)}" ${a.allowed ? "checked" : ""} ${ro()}><span></span></label></td>
          <td><b>${esc(a.label)}</b>${a.system ? ` <span class="pill plain">${t("a.system")}</span>` : ""}${latest.has(a.pkg) ? ` <span class="pill info plain">${t("a.managed")}</span>` : ""}</td><td><code>${esc(a.pkg)}</code></td>
          <td class="muted">${a.devices ? t("common.phones", { n: a.devices }) : t("a.notyet")}</td></tr>`).join("")}
      </tbody></table></div>
      ${canWrite() ? `<div class="pad row" style="gap:8px;flex-wrap:wrap;border-top:1px solid var(--border)"><input id="aPkg" placeholder="com.company.app" style="flex:2;min-width:180px"><input id="aLabel" placeholder="${esc(t("m.label"))}" style="flex:1;min-width:140px"><button class="btn ghost" id="aAdd">${t("g.pkg.add")}</button><span class="hint" style="flex-basis:100%">${t("a.hint")}</span></div>` : ""}
    </div>
    ${canWrite() ? `<div class="grid g2"><div class="card pad"><h3>${t("r.kiosk")}</h3><p class="hint" style="margin-top:4px">${t("r.kiosk.p")}</p>
        <div class="field"><label for="apk">${t("r.file")}</label><input type="file" id="apk" accept=".apk" class="w100"></div>
        <div class="row"><div class="field" style="flex:1;margin-top:14px"><label for="vName">${t("r.vname")}</label><input id="vName" placeholder="1.4.0"></div><div class="field" style="flex:1;margin-top:14px"><label for="vCode">${t("r.vcode")}</label><input id="vCode" type="number" placeholder="13"></div></div>
        <div class="field"><label for="vCert">${t("r.cert")} <span class="muted">${t("r.cert.first")}</span></label><input id="vCert" placeholder="base64url SHA-256"></div>
        <button class="btn" id="upload" style="margin-top:16px">${ic("download")} ${t("r.upload")}</button></div>
      <div class="card pad"><h3>${t("r.push")}</h3><p class="hint" style="margin-top:4px">${o.outdated ? t("r.push.n", { n: o.outdated }) : t("r.push.ok")}</p>
        <div class="field"><label for="rollGroup">${t("r.push.which")}</label><select id="rollGroup"><option value="">${t("r.push.all")}</option>${gs.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        <button class="btn" id="rollAll" style="margin-top:16px" ${o.outdated ? "" : "disabled"}>${t("r.push.go")}</button>
        ${rs.length ? `<p class="hint" style="margin-top:16px"><a href="${BASE}apk/latest.apk">${ic("download")} ${t("r.download")}</a></p>` : ""}</div></div>` : ""}
    <h3 style="margin:28px 0 12px">${t("r.versions")}</h3>
    <div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>${t("th.version")}</th><th>${t("r.vcode")}</th><th>${t("th.size")}</th><th>${t("th.uploaded")}</th><th>${t("th.fingerprint")}</th></tr></thead><tbody>
      ${rs.map((r, i) => `<tr><td><b>${esc(r.versionName)}</b> ${i === 0 ? `<span class="pill ok plain">${t("r.current")}</span>` : ""}</td><td>${r.versionCode}</td><td>${(r.size / 1048576).toFixed(1)} ${t("bytes.mb")}</td><td class="muted">${when(r.createdAt)}</td><td><code>${esc(r.sha256.slice(0, 12))}</code></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty"><div class="ico">${ic("pkg")}</div><h3>${t("r.none.h")}</h3><p>${t("r.none.p")}</p></div></td></tr>`}
    </tbody></table></div></div>

    <div class="card section"><div class="hd"><div><h3>${t("m.h")}</h3><p>${t("m.p")}</p></div></div>
      ${canWrite() ? `<div class="pad" style="border-bottom:1px solid var(--border)"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <div class="field" style="margin:0"><label for="mFile">${t("r.file")}</label><input type="file" id="mFile" accept=".apk" class="w100"></div>
        <div class="field" style="margin:0"><label for="mPkg">${t("m.pkg")}</label><input id="mPkg" placeholder="com.confiance.driver"></div>
        <div class="field" style="margin:0"><label for="mLabel">${t("m.label")}</label><input id="mLabel" placeholder="Confiance Driver"></div>
        <div class="field" style="margin:0"><label for="mVName">${t("r.vname")}</label><input id="mVName" placeholder="2.3.0"></div>
        <div class="field" style="margin:0"><label for="mVCode">${t("r.vcode")}</label><input id="mVCode" type="number" placeholder="120"></div>
        <div class="field" style="margin:0;align-self:end"><button class="btn w100" id="mUpload">${ic("download")} ${t("r.upload")}</button></div></div></div>` : ""}
      <div class="tablewrap"><table><thead><tr><th>${t("m.label")}</th><th>${t("m.pkg")}</th><th>${t("th.version")}</th><th>${t("th.size")}</th><th>${t("th.uploaded")}</th><th></th></tr></thead><tbody>
        ${[...latest.values()].map((m) => { const n = managed.filter((x) => x.pkg === m.pkg).length; return `<tr><td><b>${esc(m.label)}</b></td><td><code>${esc(m.pkg)}</code></td><td>${esc(m.versionName)} <span class="muted sm">(${m.versionCode})</span>${n > 1 ? ` <span class="pill plain">${t("m.history", { n })}</span>` : ""}</td><td>${(m.size / 1048576).toFixed(1)} ${t("bytes.mb")}</td><td class="muted">${when(m.createdAt)}</td><td style="text-align:right">${canWrite() ? `<button class="btn quiet sm icon" data-mdel="${m.id}" title="${esc(t("common.delete"))}" aria-label="${esc(t("common.delete"))}">${ic("trash")}</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="6" class="muted pad">${t("m.none")}</td></tr>`}
      </tbody></table></div></div>`;
  },
  bind() {
    const saveAllowed = async () => {
      const list = $$("#aRows .aAllow:checked").map((i) => ({ pkg: i.value, label: i.dataset.label }));
      await api("PUT", "/api/settings", { allowedApps: list }); toast(t("a.saved"));
    };
    $$("#aRows .aAllow").forEach((i) => i.addEventListener("change", (e) => saveAllowed().catch((err) => { e.target.checked = !e.target.checked; fail(err); })));
    $("#aSearch")?.addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); $$("#aRows tr").forEach((r) => r.classList.toggle("hidden", !!q && !r.dataset.q.includes(q))); });
    $("#aAdd")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const p = $("#aPkg").value.trim(); if (!/^[A-Za-z0-9_.]+$/.test(p)) return toast(t("g.pkg.bad"), "err");
      const list = $$("#aRows .aAllow:checked").map((i) => ({ pkg: i.value, label: i.dataset.label })).filter((a) => a.pkg !== p);
      list.push({ pkg: p, label: $("#aLabel").value.trim() || p });
      await api("PUT", "/api/settings", { allowedApps: list }); toast(t("a.saved")); refresh();
    }));
    $("#upload")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const f = $("#apk").files[0]; if (!f) return toast(t("r.choose"), "err");
      const q = new URLSearchParams({ versionName: $("#vName").value, versionCode: $("#vCode").value, certSha256: $("#vCert").value });
      await api("PUT", `/api/releases?${q}`, null, f); toast(t("r.uploaded")); refresh();
    }));
    $("#rollAll")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const r = await api("POST", "/api/releases/rollout", { groupId: $("#rollGroup").value ? +$("#rollGroup").value : null });
      toast(t("r.push.sent", { n: r.queued }));
    }));
    $("#mUpload")?.addEventListener("click", (e) => busy(e.currentTarget, async () => {
      const f = $("#mFile").files[0]; if (!f) return toast(t("r.choose"), "err");
      const q = new URLSearchParams({ pkg: $("#mPkg").value.trim(), label: $("#mLabel").value, versionName: $("#mVName").value, versionCode: $("#mVCode").value });
      const r = await api("PUT", `/api/managed-apps?${q}`, null, f); toast(t("m.uploaded", { n: r.devices })); refresh();
    }));
    $$("[data-mdel]").forEach((b) => b.onclick = async () => { if (await ask({ title: t("m.del.ask"), body: t("m.del.p"), ok: t("common.delete"), danger: true })) { await api("DELETE", `/api/managed-apps/${b.dataset.mdel}`).catch(fail); refresh(); } });
  },
};

// ---------- Settings ----------
let settingsTab = "security";
pages.settings = {
  title: "s.title", sub: "s.sub",
  skeleton: () => skForm(),
  load: () => Promise.all([get("/api/settings"), get("/api/admins")]),
  render([s, admins]) {
    const d = ro();
    const row = (state, text) => `<div class="todo" style="padding:10px 0"><div class="ic ${state === "ok" ? "ok" : state === "warn" ? "warn" : "neutral"}" style="width:26px;height:26px">${ic(state === "ok" ? "check" : state === "warn" ? "alert" : "info")}</div><div class="tx">${text}</div></div>`;
    const tabs = ["security", "phones", "alerts", "setup", "users"];
    const seg = `<div class="seg" style="margin-bottom:16px">${tabs.map((k) => `<button data-stab="${k}" class="${settingsTab === k ? "on" : ""}">${t(`s.tab.${k}`)}</button>`).join("")}</div>`;
    const panels = {
      security: `<div class="grid g2" style="align-items:start">
        <div class="card"><div class="hd"><div><h3>${t("s.sec.h")}</h3><p>${t("s.sec.p")}</p></div></div><div class="pad">
          ${row(me.twoFactor ? "ok" : "warn", t("s.c.2fa"))}${row(s.require2fa ? "ok" : "warn", t("s.c.2fa.all"))}${row(s.requireApproval ? "ok" : "warn", t("s.c.appr"))}
          ${row(s.pinEnabled ? "neutral" : "ok", `${t("s.c.pin")} <span class="muted">· ${s.pinEnabled ? t("s.c.pin.on") : t("s.c.pin.off")}</span>`)}${row(s.disableDebugging ? "ok" : "warn", t("s.c.debug"))}
        </div></div>
        <div class="card pad">
          ${check("reqAppr", t("s.reqAppr"), t("s.reqAppr.h"), s.requireApproval, d)}
          ${check("req2fa", t("s.req2fa"), me.twoFactor ? t("s.req2fa.h") : t("s.req2fa.first"), s.require2fa, d + (me.twoFactor ? "" : " disabled"))}
          ${check("noDebug", t("s.noDebug"), t("s.noDebug.h"), s.disableDebugging, d)}
        </div></div>`,
      phones: `<div class="grid g2" style="align-items:start">
        <div class="card"><div class="hd"><div><h3>${t("s.ph.h")}</h3></div></div><div class="pad">
          ${check("autoUpd", t("s.autoUpd"), t("s.autoUpd.h"), s.autoUpdate, d)}
          ${check("driverWifi", t("s.driverWifi"), t("s.driverWifi.h"), s.driverWifi, d)}
          ${check("reportLoc", t("s.loc"), t("s.loc.h"), s.reportLocation, d)}
          <div class="field"><label for="dispatch">${t("s.dispatch")}</label><input id="dispatch" value="${esc(s.dispatchPhone)}" placeholder="+237 6 00 00 00 00" ${d}><p class="hint">${t("s.dispatch.h")}</p></div>
          <div class="row" style="margin-top:14px"><div class="field" style="margin:0;flex:1"><label for="hb">${t("s.hb")}</label><input id="hb" type="number" min="60" max="3600" value="${s.heartbeatSec}" ${d}><p class="hint">${t("s.hb.h")}</p></div>
            <div class="field" style="margin:0;flex:1"><label for="hbPush">${t("s.hb.push")}</label><input id="hbPush" type="number" min="60" max="7200" value="${s.pushHeartbeatSec}" ${d}><p class="hint">${t("s.hb.push.h")}</p></div></div>
          <button class="btn" id="savePhones" style="margin-top:16px" ${d}>${t("common.save")}</button>
        </div></div>
        <div class="card"><div class="hd"><div><h3>${t("s.pin.h")}</h3><p>${t("s.pin.p")}</p></div></div><div class="pad">
          ${check("pinOn", t("s.pinOn"), t("s.pinOn.h"), s.pinEnabled, d + (s.pinSet ? "" : " disabled"))}
          <div class="row"><input id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="${s.pinSet ? esc(t("s.pin.new")) : esc(t("s.pin.choose"))}" ${d}><button class="btn ghost" id="savePin" ${d}>${s.pinSet ? t("s.pin.change") : t("s.pin.set")}</button></div>
        </div></div></div>`,
      alerts: `<div class="grid g2" style="align-items:start">
        <div class="card"><div class="hd"><div><h3>${t("s.al.h")}</h3></div></div><div class="pad">
          <div class="field"><label for="budget">${t("s.budget")}</label><input id="budget" type="number" min="0" value="${s.dataBudgetMb}" ${d}><p class="hint">${t("s.budget.h")}</p></div>
          <div class="field"><label for="offh">${t("s.offline")}</label><input id="offh" type="number" min="1" max="720" value="${s.offlineAlertHours}" ${d}></div>
          <div class="field"><label for="tz">${t("s.tz")}</label><input id="tz" value="${esc(s.tz)}" ${d}></div>
          <button class="btn" id="saveAlerts" style="margin-top:16px" ${d}>${t("common.save")}</button>
        </div></div>
        <div class="card"><div class="hd"><div><h3>${t("s.emails")}</h3></div></div><div class="pad">
          <div class="banner ${s.emailConfigured ? "info" : "warn"}" style="margin-bottom:14px">${ic(s.emailConfigured ? "check" : "info")}<div class="t"><span>${s.emailConfigured ? t("s.email.on") : t("s.email.off")}</span></div></div>
          <div class="field"><label for="emails">${t("s.emails")}</label><input id="emails" value="${esc(s.alertEmails)}" placeholder="ops@confiance-app.com, jim@confiance-app.com" ${d}><p class="hint">${t("s.emails.h")}</p></div>
          <button class="btn" id="saveEmails" style="margin-top:16px" ${d}>${t("common.save")}</button>
        </div></div></div>`,
      setup: `<div class="grid g2" style="align-items:start">
        <div class="card"><div class="hd"><div><h3>${t("s.setup.h")}</h3><p>${t("s.setup.p")}</p></div></div><div class="pad">
          <div class="field"><label for="ssid">${t("s.ssid")}</label><input id="ssid" value="${esc(s.wifiSsid)}" ${d}></div>
          <div class="field"><label for="wpass">${t("s.wpass")} ${s.wifiPasswordSet ? `<span class="muted">${t("s.wpass.keep")}</span>` : ""}</label><input id="wpass" type="password" ${d}></div>
          <div class="field"><label for="cert">${t("s.cert")}</label><input id="cert" value="${esc(s.certSha256)}" ${d}></div>
          <button class="btn" id="saveNet" style="margin-top:16px" ${d}>${t("common.save")}</button></div></div>
        <div class="card"><div class="hd"><div><h3>${t("s.addr.h")}</h3><p>${t("s.addr.p")}</p></div></div><div class="pad">
          <dl class="kv"><dt>${t("s.addr.server")}</dt><dd><code>${esc(s.publicUrl)}</code></dd>${s.restUrl ? `<dt>${t("s.addr.rest")}</dt><dd><code>${esc(s.restUrl)}</code></dd>` : ""}</dl></div></div></div>`,
      users: `<div class="card"><div class="hd"><div><h3>${t("s.users.h")}</h3><p>${t("s.users.p")}</p></div></div>
        <div class="tablewrap"><table><thead><tr><th>${t("th.user")}</th><th>${t("th.role")}</th><th>${t("th.2fa")}</th><th></th></tr></thead><tbody>${admins.map((a) => `<tr><td><div class="row" style="gap:10px"><div class="avatar" style="width:30px;height:30px;font-size:12px">${esc(initials(a.email))}</div><b>${esc(a.email)}</b>${a.email === me.email ? ` <span class="pill plain">${t("s.you")}</span>` : ""}</div></td><td>${a.role === "admin" ? t("role.admin") : t("role.viewer")}</td><td>${a.twoFactor ? `<span class="pill ok">${t("common.on")}</span>` : `<span class="pill warn">${t("common.off")}</span>`}</td><td style="text-align:right">${canWrite() && a.email !== me.email ? `<button class="btn quiet sm" data-rmadmin="${a.id}">${t("s.remove")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
        ${canWrite() ? `<div class="pad" style="border-top:1px solid var(--border)"><label class="lbl">${t("s.add")}</label><div class="row"><input id="aEmail" type="email" placeholder="${esc(t("s.add.email"))}" style="flex:1;min-width:200px"><input id="aPass" type="password" placeholder="${esc(t("s.add.pass"))}" style="flex:1;min-width:200px"><select id="aRole"><option value="admin">${t("role.admin")}</option><option value="viewer">${t("role.viewer")}</option></select><button class="btn" id="aAdd">${t("s.add.go")}</button></div></div>` : ""}</div>`,
    };
    return seg + panels[settingsTab];
  },
  bind() {
    const put = (body, msg) => api("PUT", "/api/settings", body).then(() => { toast(msg); refresh(); }).catch((e) => { fail(e); refresh(); });
    $$("[data-stab]").forEach((b) => b.onclick = () => { settingsTab = b.dataset.stab; paint("settings", pageData.settings); });
    $("#savePin")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ pin: $("#pin").value }, t("s.pin.updated"))));
    $("#pinOn")?.addEventListener("change", (e) => put({ pinEnabled: e.target.checked }, t("common.saved")));
    $("#reqAppr")?.addEventListener("change", (e) => put({ requireApproval: e.target.checked }, t("common.saved")));
    $("#req2fa")?.addEventListener("change", (e) => put({ require2fa: e.target.checked }, t("common.saved")));
    $("#autoUpd")?.addEventListener("change", (e) => put({ autoUpdate: e.target.checked }, t("common.saved")));
    $("#driverWifi")?.addEventListener("change", (e) => put({ driverWifi: e.target.checked }, t("common.saved")));
    $("#reportLoc")?.addEventListener("change", (e) => put({ reportLocation: e.target.checked }, t("common.saved")));
    $("#noDebug")?.addEventListener("change", (e) => put({ disableDebugging: e.target.checked }, t("common.saved")));
    $("#savePhones")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ dispatchPhone: $("#dispatch").value, heartbeatSec: +$("#hb").value, pushHeartbeatSec: +$("#hbPush").value }, t("common.saved"))));
    $("#saveAlerts")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ dataBudgetMb: +$("#budget").value, offlineAlertHours: +$("#offh").value, tz: $("#tz").value }, t("common.saved"))));
    $("#saveEmails")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ alertEmails: $("#emails").value }, t("common.saved"))));
    $("#saveNet")?.addEventListener("click", (e) => busy(e.currentTarget, () => put({ wifiSsid: $("#ssid").value, wifiPassword: $("#wpass").value, certSha256: $("#cert").value }, t("common.saved"))));
    $("#aAdd")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", "/api/admins", { email: $("#aEmail").value, password: $("#aPass").value, role: $("#aRole").value }); toast(t("s.added")); refresh(); }));
    $$("[data-rmadmin]").forEach((b) => b.onclick = async () => { if (await ask({ title: t("s.rm.ask"), body: t("s.rm.p"), ok: t("s.remove"), danger: true })) { await api("DELETE", `/api/admins/${b.dataset.rmadmin}`).catch(fail); refresh(); } });
  },
};

// ---------- Account ----------
pages.account = {
  title: "a.title", sub: "a.sub",
  skeleton: () => skForm(),
  load: () => get("/api/me"),
  render(m) {
    me = { ...me, ...m };
    return `${me.mustSetup2fa ? `<div class="banner bad" style="margin-bottom:16px">${ic("shield")}<div class="t"><b>${t("a.must")}</b><span>${t("a.must.p")}</span></div></div>` : ""}
    <div class="grid g2" style="align-items:start">
      <div class="card pad"><h3>${t("a.pw.h")}</h3><p class="hint" style="margin-top:4px">${t("a.pw.p")}</p>
        <div class="field"><label for="pwCur">${t("a.pw.cur")}</label><input id="pwCur" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pwNew">${t("a.pw.new")}</label><input id="pwNew" type="password" autocomplete="new-password"></div>
        <button class="btn" id="pwSave" style="margin-top:16px">${t("a.pw.go")}</button></div>
      <div class="card pad"><div class="row between"><h3>${t("a.tfa.h")}</h3><span class="pill ${m.twoFactor ? "ok" : "warn"}">${m.twoFactor ? t("common.on") : t("common.off")}</span></div>
        <p class="hint" style="margin-top:4px">${t("a.tfa.p")}</p>
        <div id="tfa" style="margin-top:14px">${m.twoFactor
          ? `<div class="field"><label for="tfPw">${t("a.tfa.pw")}</label><input id="tfPw" type="password"></div><div class="field"><label for="tfCode">${t("a.tfa.code")}</label><input id="tfCode" inputmode="numeric" maxlength="6"></div><button class="btn danger" id="tfOff" style="margin-top:16px">${t("a.tfa.off")}</button>`
          : `<button class="btn" id="tfStart">${ic("shield")} ${t("a.tfa.start")}</button>`}</div></div>
    </div>`;
  },
  bind() {
    $("#pwSave").onclick = (e) => busy(e.currentTarget, async () => { await api("POST", "/api/me/password", { current: $("#pwCur").value, next: $("#pwNew").value }); toast(t("a.pw.done")); $("#pwCur").value = ""; $("#pwNew").value = ""; });
    $("#tfStart")?.addEventListener("click", (ev) => busy(ev.currentTarget, async () => {
      const r = await api("POST", "/api/me/2fa/setup");
      $("#tfa").innerHTML = `<ol class="steps"><li><div><b>${t("a.tfa.scan")}</b><div class="qr" style="margin-top:10px"><img src="${r.qr}" alt="Authenticator QR code" style="width:190px"></div><p class="hint">${t("a.tfa.key")} <code>${esc(r.secret)}</code></p></div></li>
        <li><div style="flex:1"><b>${t("a.tfa.enter")}</b><input id="tfCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" class="w100" style="margin-top:8px"></div></li></ol><button class="btn" id="tfOn" style="margin-top:16px">${t("a.tfa.on")}</button>`;
      $("#tfOn").onclick = (e2) => busy(e2.currentTarget, async () => {
        const e = await api("POST", "/api/me/2fa/enable", { code: $("#tfCode").value });
        $("#tfa").innerHTML = `<div class="banner warn">${ic("alert")}<div class="t"><b>${t("a.tfa.rec.h")}</b><span>${t("a.tfa.rec.p")}</span></div></div><pre class="box" style="margin-top:12px;font-size:15px;line-height:1.8">${e.recoveryCodes.map(esc).join("\n")}</pre><button class="btn" id="tfDone" style="margin-top:14px">${t("a.tfa.saved")}</button>`;
        $("#tfDone").onclick = async () => { me.mustSetup2fa = false; me.twoFactor = true; await boot(); go("account"); };
      });
    }));
    $("#tfOff")?.addEventListener("click", (e) => busy(e.currentTarget, async () => { await api("POST", "/api/me/2fa/disable", { password: $("#tfPw").value, code: $("#tfCode").value }); toast(t("a.tfa.disabled")); await boot(); go("account"); }));
  },
};

// ---------- Activity ----------
const actionLabel = (a) => { const k = `act.${a}`; const s = t(k); if (s !== k) return s; return a.replace(/^setup:/, "setup · ").replace(/-/g, " "); };
const au = { q: "", seg: "log" };
pages.audit = {
  title: "au.title", sub: "au.sub", live: true,
  skeleton: () => skTable(8),
  load: () => Promise.all([get(`/api/audit?limit=300${au.q ? `&q=${encodeURIComponent(au.q)}` : ""}`), get("/api/alerts?all=1")]),
  render([rows, alerts]) {
    const seg = `<div class="toolbar"><div class="seg"><button data-aseg="log" class="${au.seg === "log" ? "on" : ""}">${t("au.seg.log")}</button><button data-aseg="alerts" class="${au.seg === "alerts" ? "on" : ""}">${t("au.seg.alerts")}<small>${alerts.filter((a) => a.active).length}</small></button></div>
      ${au.seg === "log" ? `<div class="search">${ic("search")}<input id="aq" placeholder="${esc(t("au.search"))}" value="${esc(au.q)}" autocomplete="off"></div>` : ""}</div>`;
    if (au.seg === "alerts") return seg + `<div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>${t("th.when")}</th><th>${t("th.phone")}</th><th>${t("th.kind")}</th><th>${t("th.message")}</th><th>${t("th.status")}</th><th></th></tr></thead><tbody>
      ${alerts.map((a) => `<tr><td class="muted nowrap">${when(a.ts)}</td><td><b>${esc(alertWho(a) || t("alert.fleet"))}</b></td><td><span class="pill plain ${ALERT_TONE[a.kind] ?? ""}">${esc(alertKind(a.kind))}</span></td><td class="muted">${esc(alertMsg(a))}</td><td>${a.active ? `<span class="pill warn">${t("au.active")}</span>` : `<span class="pill plain">${t("au.cleared")}</span>`}</td><td style="text-align:right">${a.active && canWrite() ? `<button class="btn quiet sm" data-dismiss="${a.id}">${t("common.dismiss")}</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty"><div class="ico">${ic("bell")}</div><h3>${t("au.alerts.none")}</h3></div></td></tr>`}
    </tbody></table></div></div>`;
    return seg + `<div class="card tablecard"><div class="tablewrap"><table><thead><tr><th>${t("th.when")}</th><th>${t("th.who")}</th><th>${t("th.what")}</th><th>${t("th.details")}</th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td class="muted nowrap">${when(a.ts)}</td><td><b>${esc(a.actor)}</b></td><td><span class="pill plain ${/failed|delete|remove|wipe|lost/.test(a.action) ? "bad" : /login$|approve|enable|found/.test(a.action) ? "ok" : ""}">${esc(actionLabel(a.action))}</span></td><td class="muted">${esc(a.detail)}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty"><div class="ico">${ic("activity")}</div><h3>${t("au.none")}</h3></div></td></tr>`}
    </tbody></table></div></div>`;
  },
  bind() {
    $$("[data-aseg]").forEach((b) => b.onclick = () => { au.seg = b.dataset.aseg; paint("audit", pageData.audit); });
    let tmr; $("#aq")?.addEventListener("input", (e) => { au.q = e.target.value; clearTimeout(tmr); tmr = setTimeout(() => go("audit", { quiet: true }), 350); });
    $$("[data-dismiss]").forEach((b) => b.onclick = () => busy(b, async () => { await api("POST", `/api/alerts/${b.dataset.dismiss}/dismiss`); refresh(); }));
  },
};

// =====================================================================
// events (delegated, so they survive re-renders)
// =====================================================================
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
  const row = e.target.closest("tr.clickable, .devcard"); if (row) openDevice(+row.dataset.id);
});
$("#view").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".stat.link, .devcard, .topitem")) { e.preventDefault(); e.target.click(); } });
$("#view").addEventListener("input", (e) => { if (e.target.id === "q") { dev.q = e.target.value; drawRows(); } });
$("#view").addEventListener("change", (e) => { if (e.target.id === "fg") { dev.group = e.target.value; drawRows(); } });
$("#bulk").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bulk]"); if (!b) return;
  const type = b.dataset.bulk, ids = [...dev.selected];
  if (type === "clear") { dev.selected.clear(); $$(".sel").forEach((c) => (c.checked = false)); return renderBulk(); }
  await busy(b, async () => {
    if (type === "approve") {
      const pend = ids.filter((id) => devAll.find((d) => d.id === id && !d.approved));
      for (const id of pend) await api("POST", `/api/devices/${id}/approve`);
      toast(t("bulk.approved", { n: pend.length })); dev.selected.clear(); return refresh();
    }
    if (type !== "refresh" && !(await ask({ title: t("bulk.ask", { action: b.textContent.trim(), n: ids.length }), body: type === "reboot" ? t("bulk.reboot.d") : t("bulk.lock.d"), ok: b.textContent.trim() }))) return;
    const r = await api("POST", "/api/commands/bulk", { ids, type });
    toast(t("bulk.sent", { n: r.queued }) + (r.skipped ? t("bulk.skipped", { n: r.skipped }) : ""));
  });
});
$("#menu").onclick = () => { $("#side").classList.toggle("open"); $("#scrim").classList.toggle("open"); };
$("#scrim").onclick = () => { $("#side").classList.remove("open"); $("#scrim").classList.remove("open"); };
$("#nav").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) location.hash = "#/" + b.dataset.tab; });
$("#nav").addEventListener("pointerover", (e) => { const b = e.target.closest("[data-tab]"); if (b) prefetch(b.dataset.tab); });
$("#langBtn").onclick = $("#langBtn2").onclick = () => setLang(LANG === "fr" ? "en" : "fr");

// ---------- sign in / out ----------
function applyStaticText() {
  document.documentElement.lang = LANG;
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $("#langBtn").textContent = t("lang.switch");
  $("#langBtn2").textContent = LANG === "fr" ? "EN" : "FR";
}
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
$("#logout").onclick = async () => { await api("POST", "/api/logout").catch(() => {}); tokenStore.set(""); showLogin(); };

async function boot() {
  applyStaticText();
  try { me = await api("GET", "/api/me"); } catch { return showLogin(); }
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#avatar").textContent = initials(me.email); $("#whoEmail").textContent = me.email; $("#whoRole").textContent = me.role === "admin" ? t("role.admin") : t("role.viewer");
  buildNav();
  if (me.mustSetup2fa) { location.hash = "#/account"; return go("account"); }
  const tn = routeFromHash();
  if (location.hash !== "#/" + tn) history.replaceState(null, "", "#/" + tn);
  await go(tn);
  // Warm every page right after sign-in so navigation is instant: one page at a time, so a fresh sign-in never
  // fires a burst of requests at the server.
  setTimeout(async () => { for (const p of Object.keys(pages)) if (p !== tab) await prefetch(p); }, 400);
}
fetch(api_("healthz")).catch(() => {}); // wake the server while the page loads
boot();
