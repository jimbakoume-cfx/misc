const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let me = null, tab = "overview", timer = null;
const TABS = [["overview", "Overview"], ["devices", "Devices"], ["groups", "Groups & apps"], ["provision", "Add devices"], ["releases", "App versions"], ["settings", "Settings"], ["account", "Account"], ["audit", "Activity"]];

async function api(method, url, body, raw) {
  const res = await fetch(url, {
    method, credentials: "same-origin",
    headers: { "X-Requested-With": "confiance-dashboard", ...(body && !raw ? { "Content-Type": "application/json" } : raw ? { "Content-Type": "application/octet-stream" } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== "/api/login") { showLogin(); throw new Error("Signed out"); }
  if (res.status === 403 && data.need2faSetup) { if (me) { me.mustSetup2fa = true; go("account"); } throw new Error(data.error); }
  if (!res.ok) { const err = new Error(data.error || `Error ${res.status}`); err.data = data; throw err; }
  return data;
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2600); }
const fail = (e) => toast(e.message);
const ago = (ts) => { if (!ts) return "never"; const s = Math.max(0, (Date.now() - ts) / 1000); return s < 90 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const when = (ts) => ts ? new Date(ts).toLocaleString() : "—";
const canWrite = () => me?.role === "admin";

function showLogin() { clearInterval(timer); $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); }
async function boot() {
  try { me = await api("GET", "/api/me"); } catch { return showLogin(); }
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#who").textContent = `${me.email} (${me.role})`;
  $("#nav").innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("");
  go(me.mustSetup2fa ? "account" : tab);
}
// One delegated handler for buttons that live inside re-rendered pages.
$("#view").addEventListener("click", (e) => {
  if (e.target.id === "apprAll") { devFilter.state = ""; devFilter.pending = true; go("devices"); }
});
$("#nav").onclick = (e) => { const t = e.target.dataset?.tab; if (t) go(t); };
function go(t) {
  tab = t; clearInterval(timer);
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  render().catch(fail);
  if (t === "overview" || t === "devices") timer = setInterval(() => { if (!$("#dlg").open) render().catch(() => {}); }, 20000);
}
const render = () => ({ overview, devices, groups, provision, releases, settings, account, audit }[tab])();

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("POST", "/api/login", { email: $("#email").value, password: $("#password").value, code: $("#code").value });
    $("#password").value = ""; $("#code").value = ""; $("#codeRow").classList.add("hidden"); $("#loginErr").textContent = ""; boot();
  } catch (err) {
    if (err.data?.needs2fa) { $("#codeRow").classList.remove("hidden"); $("#code").focus(); }
    $("#loginErr").textContent = err.message;
  }
};
$("#logout").onclick = async () => { await api("POST", "/api/logout").catch(() => {}); showLogin(); };

// ---------- Overview ----------
async function overview() {
  const o = await api("GET", "/api/overview");
  const s = (n, l, c = "") => `<div class="card stat ${c}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  $("#view").innerHTML = `
    <h2>Fleet overview</h2>
    <div class="cards">
      ${s(o.total, "Devices")}
      ${s(o.online, "Online now", "ok")}
      ${s(o.stale, "Missed a check-in", o.stale ? "warn" : "")}
      ${s(o.offline, "Offline", o.offline ? "bad" : "")}
      ${s(o.lowBattery, "Battery ≤ 20%", o.lowBattery ? "warn" : "")}
      ${s(o.outdated, `Old app version${o.currentVersion ? ` (latest ${esc(o.currentVersion)})` : ""}`, o.outdated ? "warn" : "")}
      ${s(o.notLocked, "Not managed / not locked", o.notLocked ? "bad" : "")}
      ${s(o.pendingApproval, "Waiting for your approval", o.pendingApproval ? "warn" : "")}
    </div>
    ${o.pendingApproval ? `<div class="card" style="margin-bottom:16px"><b>${o.pendingApproval} new phone(s) are waiting for approval.</b> They are locked down but show no apps until you approve them. <button class="btn" id="apprAll">Review &amp; approve</button></div>` : ""}
    ${o.total === 0 ? `<div class="card">No devices yet. Go to <b>Add devices</b> to generate a QR code and enrol your first phone.</div>` : ""}
    <p class="muted" id="ovNote">Devices check in every 5 minutes. "Online" means a check-in within the last 12 minutes. This page refreshes automatically.</p>`;
}

// ---------- Devices ----------
let devFilter = { q: "", group: "", state: "", pending: false }, selected = new Set(), groupList = [];
async function devices() {
  const [groupsRes, all] = await Promise.all([api("GET", "/api/groups"), api("GET", "/api/devices?" + new URLSearchParams({ q: devFilter.q, group: devFilter.group, state: devFilter.state }))]);
  const pendingCount = all.filter((d) => !d.approved).length;
  const list = devFilter.pending ? all.filter((d) => !d.approved) : all;
  groupList = groupsRes;
  const gname = (id) => groupList.find((g) => g.id === id)?.name ?? "—";
  const keepFocus = document.activeElement?.id === "q";
  $("#view").innerHTML = `
    <h2>Devices <span class="muted">(${list.length})</span></h2>
    <div class="bar">
      <input id="q" placeholder="Search name, model, serial…" value="${esc(devFilter.q)}" style="min-width:240px">
      <select id="fg"><option value="">All groups</option><option value="none">No group</option>${groupList.map((g) => `<option value="${g.id}" ${String(devFilter.group) === String(g.id) ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
      <select id="fs">${[["", "Any status"], ["online", "Online"], ["stale", "Stale"], ["offline", "Offline"]].map(([v, l]) => `<option value="${v}" ${devFilter.state === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label style="display:flex;gap:6px;align-items:center;margin:0;color:var(--ink)"><input type="checkbox" id="onlyPending" ${devFilter.pending ? "checked" : ""}> Waiting for approval (${pendingCount})</label>
      <span style="flex:1"></span>
      ${canWrite() && pendingCount ? `<button class="btn" id="approveSel">Approve selected</button><button class="btn" id="approveAll">Approve all (${pendingCount})</button>` : ""}
      ${canWrite() ? `<button class="btn ghost" data-bulk="refresh">Refresh policy</button><button class="btn ghost" data-bulk="reboot">Reboot</button><button class="btn ghost" data-bulk="lock">Lock screen</button>` : ""}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th><input type="checkbox" id="all"></th><th>Device</th><th>Status</th><th>Battery</th><th>Group</th><th>Model</th><th>App</th><th>Last seen</th></tr></thead>
      <tbody>${list.map((d) => `<tr class="clickable" data-id="${d.id}">
        <td><input type="checkbox" class="sel" data-id="${d.id}" ${selected.has(d.id) ? "checked" : ""}></td>
        <td><b>${esc(d.name)}</b>${!d.approved ? ' <span class="tag warn">needs approval</span>' : ""}${d.removing ? ' <span class="tag warn">removing…</span>' : ""}${d.released ? ' <span class="tag bad">released</span>' : ""}${!d.deviceOwner ? ' <span class="tag bad">not managed</span>' : ""}</td>
        <td><span class="dot ${d.state}"></span>${d.state}</td>
        <td>${d.battery == null || d.battery < 0 ? "—" : d.battery + "%" + (d.charging ? " ⚡" : "")}</td>
        <td>${esc(gname(d.groupId))}${d.hasOverride ? ' <span class="tag">custom</span>' : ""}</td>
        <td>${esc(d.model)}</td><td>${esc(d.agentVersion ?? "—")}</td><td>${ago(d.lastSeen)}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No devices match.</td></tr>`}
      </tbody></table></div>`;
  const q = $("#q"); if (keepFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  let deb; q.oninput = () => { clearTimeout(deb); deb = setTimeout(() => { devFilter.q = q.value; devices().catch(fail); }, 300); };
  $("#fg").onchange = (e) => { devFilter.group = e.target.value; devices().catch(fail); };
  $("#onlyPending").onchange = (e) => { devFilter.pending = e.target.checked; devices().catch(fail); };
  $("#approveAll")?.addEventListener("click", async () => { if (!confirm(`Approve all ${pendingCount} waiting phone(s)? They will get their apps.`)) return; try { const r = await api("POST", "/api/devices/approve-all"); toast(`${r.approved} approved`); devFilter.pending = false; devices(); } catch (e) { fail(e); } });
  $("#approveSel")?.addEventListener("click", async () => { const ids = [...selected].filter((id) => all.find((d) => d.id === id && !d.approved)); if (!ids.length) return toast("Tick waiting phones first"); try { for (const id of ids) await api("POST", `/api/devices/${id}/approve`); toast(`${ids.length} approved`); selected.clear(); devices(); } catch (e) { fail(e); } });
  $("#fs").onchange = (e) => { devFilter.state = e.target.value; devices().catch(fail); };
  $("#all").onchange = (e) => { document.querySelectorAll(".sel").forEach((c) => { c.checked = e.target.checked; e.target.checked ? selected.add(+c.dataset.id) : selected.delete(+c.dataset.id); }); };
  document.querySelectorAll(".sel").forEach((c) => c.onclick = (e) => { e.stopPropagation(); c.checked ? selected.add(+c.dataset.id) : selected.delete(+c.dataset.id); });
  document.querySelectorAll("tr.clickable").forEach((r) => r.onclick = () => deviceDialog(+r.dataset.id));
  document.querySelectorAll("[data-bulk]").forEach((b) => b.onclick = async () => {
    if (!selected.size) return toast("Tick the devices first");
    if (!confirm(`${b.textContent} on ${selected.size} device(s)?`)) return;
    try { const r = await api("POST", "/api/commands/bulk", { ids: [...selected], type: b.dataset.bulk }); toast(`Queued for ${r.queued} device(s)`); } catch (e) { fail(e); }
  });
}

async function deviceDialog(id) {
  const [d, apps, gs] = await Promise.all([api("GET", `/api/devices/${id}`), api("GET", "/api/apps"), api("GET", "/api/groups")]);
  const eff = d.effective.allowedApps.map((a) => a.pkg);
  const known = new Map(apps.map((a) => [a.pkg, a.label])); d.effective.allowedApps.forEach((a) => known.set(a.pkg, a.label));
  const ro = !canWrite() ? "disabled" : "";
  $("#dlgBody").innerHTML = `
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(d.name)}</h2><button class="btn ghost" id="close">Close</button></div>
    ${!d.deviceOwner ? `<div class="card" style="border-color:var(--bad);margin:10px 0"><b>This phone is not managed.</b> The app is installed but Android has not made it the device owner, so it cannot be locked down and most buttons here cannot work (lock, reboot, release, updates).
      <br><br><b>Fix:</b> factory-reset the phone, then on the first Welcome screen tap 6 times and scan the QR code from <i>Add devices</i>. Installing the app by hand (APK file) never makes a phone managed.</div>` : ""}
    <p><span class="dot ${d.state}"></span>${d.state} · last seen ${ago(d.lastSeen)} ${d.released ? '· <span class="tag bad">released (unlocked)</span>' : ""}</p>
    <div class="kv">
      <div>Model</div><div>${esc(d.model)} · ${esc(d.osVersion)}</div>
      <div>Serial</div><div>${esc(d.serial || "—")}</div>
      <div>Battery</div><div>${d.battery < 0 || d.battery == null ? "—" : d.battery + "%"}${d.charging ? " (charging)" : ""}</div>
      <div>Network</div><div>${esc(d.network ?? "—")}</div>
      <div>Free storage</div><div>${d.freeStorageMb ?? "—"} MB</div>
      <div>Up for</div><div>${d.uptimeMin != null ? Math.round(d.uptimeMin / 60) + " h" : "—"}</div>
      <div>App version</div><div>${esc(d.agentVersion ?? "—")}</div>
      <div>Lock-down</div><div>${d.deviceOwner ? "Managed (device owner)" : '<span class="tag bad">NOT managed: lock not enforced</span>'}</div>
      <div>Enrolled</div><div>${when(d.enrolledAt)}</div>
      <div>Approval</div><div>${d.approved ? "Approved" : '<span class="tag warn">waiting for approval</span>'}</div>
    </div>
    <label>Name</label><input id="dName" value="${esc(d.name)}" ${ro} style="width:100%">
    <label>Group</label><select id="dGroup" ${ro}><option value="">No group</option>${gs.map((g) => `<option value="${g.id}" ${g.id === d.groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
    <label>Allowed apps</label>
    <div class="row"><label style="margin:0;display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" id="dOverride" ${d.allowedOverride ? "checked" : ""} ${ro}> Use custom apps for this device (otherwise the group's apps are used)</label></div>
    <div class="apps" id="dApps">${[...known].map(([p, l]) => `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(l)}" ${eff.includes(p) ? "checked" : ""} ${ro}> ${esc(l)} <small class="muted">${esc(p)}</small></label>`).join("") || '<span class="muted">No apps reported yet.</span>'}</div>
    <label>Message shown on the device (optional)</label><input id="dMsg" value="${esc(d.messageOverride ?? "")}" placeholder="Uses the group message when empty" ${ro} style="width:100%">
    <label>Notes</label><textarea id="dNotes" rows="2" ${ro} style="width:100%">${esc(d.notes)}</textarea>
    ${canWrite() ? `<div class="row" style="margin-top:14px">
      <button class="btn" id="save">Save changes</button>
      ${d.approved ? "" : '<button class="btn" id="approveOne">Approve this phone</button>'}
      <button class="btn ghost" data-cmd="refresh">Refresh now</button>
      <button class="btn ghost" data-cmd="lock">Lock screen</button>
      <button class="btn ghost" data-cmd="reboot">Reboot</button>
      <button class="btn ghost" data-cmd="${d.released ? "relock" : "release"}">${d.released ? "Re-lock kiosk" : "Release (unlock) device"}</button>
      <button class="btn danger" id="del">Release &amp; remove</button></div>` : ""}
    ${d.lastCrash ? `<h3 style="margin-top:20px">Last app crash on this phone</h3><pre style="white-space:pre-wrap;font-size:12px;background:var(--bg);padding:10px;border-radius:8px">${esc(d.lastCrash)}</pre>` : ""}
    <h3 style="margin-top:20px">Recent commands</h3>
    <table><tbody>${d.commands.map((c) => `<tr><td>${esc(c.type)}</td><td>${esc(c.status)}${c.error ? " — " + esc(c.error) : ""}</td><td>${when(c.created_at)}</td></tr>`).join("") || '<tr><td class="muted">None</td></tr>'}</tbody></table>`;
  const dlg = $("#dlg"); if (!dlg.open) dlg.showModal();
  $("#close").onclick = () => { dlg.close(); render().catch(fail); };
  document.querySelectorAll("[data-cmd]").forEach((b) => b.onclick = async () => {
    if (b.dataset.cmd !== "refresh" && !confirm(`${b.textContent} — are you sure?`)) return;
    try { await api("POST", `/api/devices/${id}/commands`, { type: b.dataset.cmd }); toast("Command sent. The device picks it up at its next check-in (within 5 minutes)."); deviceDialog(id); } catch (e) { fail(e); }
  });
  if (canWrite()) {
    $("#approveOne")?.addEventListener("click", async () => { try { await api("POST", `/api/devices/${id}/approve`); toast("Approved"); deviceDialog(id); } catch (e) { fail(e); } });
    $("#save").onclick = async () => {
      const override = $("#dOverride").checked ? [...$("#dApps").querySelectorAll("input:checked")].map((i) => ({ pkg: i.value, label: i.dataset.label })) : null;
      try { await api("PATCH", `/api/devices/${id}`, { name: $("#dName").value, groupId: $("#dGroup").value ? +$("#dGroup").value : null, allowedOverride: override, messageOverride: $("#dMsg").value || null, notes: $("#dNotes").value }); toast("Saved"); deviceDialog(id); } catch (e) { fail(e); }
    };
    $("#del").onclick = async () => {
      if (!confirm("Release this phone and remove it from the fleet?\n\nIt unlocks itself the next time it checks in (within a few minutes), then disappears from this list. Cancel to keep it.")) return;
      try {
        const r = await api("DELETE", `/api/devices/${id}`);
        toast(r.removed ? "Device removed" : "Unlock command sent. The phone is removed once it receives it.");
        dlg.close(); render();
      } catch (e) { fail(e); }
    };
    if (d.removing) $("#del").insertAdjacentHTML("afterend", ` <button class="btn ghost" id="delNow">Delete now (phone lost)</button>`);
    $("#delNow")?.addEventListener("click", async () => { if (!confirm("Delete immediately? A phone that is still locked will stay locked and unmanaged.")) return; await api("DELETE", `/api/devices/${id}?force=1`); dlg.close(); render(); });
  }
}

// ---------- Groups ----------
async function groups() {
  const [gs, apps] = await Promise.all([api("GET", "/api/groups"), api("GET", "/api/apps")]);
  $("#view").innerHTML = `
    <div class="row" style="justify-content:space-between"><h2>Groups &amp; allowed apps</h2>${canWrite() ? '<button class="btn" id="newGroup">+ New group</button>' : ""}</div>
    <p class="muted">A group decides which apps agents can open. New devices enrolled with a group's code join it automatically.</p>
    <div class="grid2">${gs.map((g) => `<div class="card"><b>${esc(g.name)}</b> <span class="tag">${g.devices} device(s)</span>
      <p class="muted">${g.allowedApps.map((a) => esc(a.label)).join(", ") || "No apps allowed yet"}</p>
      ${g.message ? `<p>💬 ${esc(g.message)}</p>` : ""}
      ${canWrite() ? `<button class="btn ghost" data-edit="${g.id}">Edit</button>` : ""}</div>`).join("") || '<div class="card muted">No groups yet.</div>'}</div>`;
  const edit = (g) => {
    const sel = (g?.allowedApps ?? []).map((a) => a.pkg);
    const known = new Map(apps.map((a) => [a.pkg, a.label])); (g?.allowedApps ?? []).forEach((a) => known.set(a.pkg, a.label));
    $("#dlgBody").innerHTML = `<h2>${g ? "Edit" : "New"} group</h2>
      <label>Name</label><input id="gName" value="${esc(g?.name ?? "")}" style="width:100%">
      <label>Allowed apps (apps are listed once at least one device has reported them)</label>
      <div class="apps">${[...known].map(([p, l]) => `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(l)}" ${sel.includes(p) ? "checked" : ""}> ${esc(l)} <small class="muted">${esc(p)}</small></label>`).join("") || '<span class="muted">No apps reported yet — enrol a device first, or type a package name below.</span>'}</div>
      <label>Add a package name manually</label><div class="row"><input id="gPkg" placeholder="com.company.app"><button class="btn ghost" id="gAdd">Add</button></div>
      <label>Message shown on devices (optional)</label><input id="gMsg" value="${esc(g?.message ?? "")}" style="width:100%">
      <div class="row" style="margin-top:16px"><button class="btn" id="gSave">Save</button><button class="btn ghost" id="gCancel">Cancel</button>${g ? '<span style="flex:1"></span><button class="btn danger" id="gDel">Delete group</button>' : ""}</div>`;
    $("#dlg").showModal();
    $("#gCancel").onclick = () => $("#dlg").close();
    $("#gAdd").onclick = () => { const p = $("#gPkg").value.trim(); if (!/^[A-Za-z0-9_.]+$/.test(p)) return toast("Invalid package name"); $(".apps").insertAdjacentHTML("beforeend", `<label><input type="checkbox" value="${esc(p)}" data-label="${esc(p)}" checked> ${esc(p)}</label>`); $("#gPkg").value = ""; };
    $("#gSave").onclick = async () => {
      const body = { name: $("#gName").value, message: $("#gMsg").value, allowedApps: [...$("#dlg").querySelectorAll(".apps input:checked")].map((i) => ({ pkg: i.value, label: i.dataset.label })) };
      try { g ? await api("PATCH", `/api/groups/${g.id}`, body) : await api("POST", "/api/groups", body); $("#dlg").close(); toast("Saved — devices pick it up within 5 minutes"); groups(); } catch (e) { fail(e); }
    };
    if (g) $("#gDel").onclick = async () => { if (!confirm("Delete this group? Its devices keep running with no apps until reassigned.")) return; await api("DELETE", `/api/groups/${g.id}`); $("#dlg").close(); groups(); };
  };
  $("#newGroup")?.addEventListener("click", () => edit(null));
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => edit(gs.find((g) => g.id === +b.dataset.edit)));
}

// ---------- Provision ----------
async function provision() {
  const [tokens, gs] = await Promise.all([api("GET", "/api/enroll-tokens"), api("GET", "/api/groups")]);
  $("#view").innerHTML = `
    <h2>Add devices</h2>
    <div class="grid2">
      <div class="card">
        <b>How to set up a phone (≈2 minutes)</b>
        <ol>
          <li>Factory-reset the phone (or unbox a new one).</li>
          <li>On the first "Welcome" screen, tap the same spot <b>6 times</b>.</li>
          <li>Connect to Wi-Fi if asked, then <b>scan the QR code</b> below.</li>
          <li>The phone downloads the app, locks itself down and appears in the dashboard.</li>
        </ol>
        <p class="muted">The same QR code works for many phones until it expires or reaches its limit.</p>
      </div>
      ${canWrite() ? `<div class="card"><b>New enrolment code</b>
        <label>Label (names the devices, e.g. "Sales")</label><input id="tLabel" value="Phone" style="width:100%">
        <label>Group</label><select id="tGroup"><option value="">No group</option>${gs.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select>
        <label>Valid for (days) / max devices</label><div class="row"><input id="tDays" type="number" value="30" min="1" max="365" style="width:90px"><input id="tMax" type="number" value="200" min="1" style="width:90px"></div>
        <p><button class="btn" id="tCreate">Create code &amp; QR</button></p></div>` : ""}
    </div>
    <h3>Existing codes</h3>
    <div class="table-wrap"><table><thead><tr><th>Label</th><th>Code (for typing on a phone)</th><th>Group</th><th>Used</th><th>Expires</th><th></th></tr></thead><tbody>
      ${tokens.map((t) => `<tr><td>${esc(t.label)}</td><td><code style="font-size:15px;letter-spacing:.04em">${esc(t.code)}</code> <button class="btn ghost" data-copy="${esc(t.code)}">Copy</button></td><td>${esc(t.groupName ?? "—")}</td><td>${t.uses}/${t.maxUses}</td><td>${when(t.expiresAt)}${t.expiresAt < Date.now() ? ' <span class="tag bad">expired</span>' : ""}</td>
        <td><button class="btn ghost" data-qr="${esc(t.token)}">Show QR</button> ${canWrite() ? `<button class="btn ghost" data-rm="${esc(t.token)}">Delete</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">No codes yet.</td></tr>'}
    </tbody></table></div>`;
  const showQr = async (token) => {
    try {
      const r = await api("GET", `/api/provisioning/${encodeURIComponent(token)}`);
      $("#dlgBody").innerHTML = `<div class="qr"><h2>Scan on the Welcome screen</h2><img src="${r.qr}" alt="Provisioning QR code"><p class="muted">Tap the Welcome screen 6 times first. Keep this QR code private: anyone with it can enrol a device.</p><div class="row" style="justify-content:center"><button class="btn" id="qPrint">Print</button><button class="btn ghost" id="qClose">Close</button></div></div>`;
      $("#dlg").showModal(); $("#qClose").onclick = () => $("#dlg").close(); $("#qPrint").onclick = () => window.print();
    } catch (e) { fail(e); }
  };
  $("#tCreate")?.addEventListener("click", async () => {
    try { const r = await api("POST", "/api/enroll-tokens", { label: $("#tLabel").value, groupId: $("#tGroup").value ? +$("#tGroup").value : null, days: +$("#tDays").value, maxUses: +$("#tMax").value }); await provision(); showQr(r.token); } catch (e) { fail(e); }
  });
  document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("Code copied"); } catch { toast(b.dataset.copy); } });
  document.querySelectorAll("[data-qr]").forEach((b) => b.onclick = () => showQr(b.dataset.qr));
  document.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { if (confirm("Delete this code?")) { await api("DELETE", `/api/enroll-tokens/${encodeURIComponent(b.dataset.rm)}`); provision(); } });
}

// ---------- Releases ----------
async function releases() {
  const [rs, o, gs] = await Promise.all([api("GET", "/api/releases"), api("GET", "/api/overview"), api("GET", "/api/groups")]);
  $("#view").innerHTML = `
    <h2>App versions</h2>
    <p class="muted">Upload a new APK to update every device remotely. Devices that are already managed install it silently within about 5–10 minutes (when "automatic updates" is on in Settings), or you can push it now.</p>
    ${canWrite() ? `<div class="card"><b>Upload new version</b>
      <div class="row" style="margin-top:8px"><input type="file" id="apk" accept=".apk"><input id="vName" placeholder="Version name e.g. 1.1.0" style="width:190px"><input id="vCode" type="number" placeholder="Version code e.g. 2" style="width:160px"></div>
      <label>Signing-certificate checksum (only needed the first time; see docs/PROVISIONING.md)</label><input id="vCert" placeholder="base64url SHA-256 of the signing certificate" style="width:100%">
      <p><button class="btn" id="upload">Upload</button></p></div>
      <div class="row" style="margin:16px 0"><button class="btn ghost" id="rollAll">Push latest to all outdated devices (${o.outdated})</button>
        <select id="rollGroup"><option value="">…or only group</option>${gs.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>` : ""}
    <div class="table-wrap"><table><thead><tr><th>Version</th><th>Code</th><th>Size</th><th>Uploaded</th><th>SHA-256</th></tr></thead><tbody>
      ${rs.map((r, i) => `<tr><td>${esc(r.versionName)} ${i === 0 ? '<span class="tag">current</span>' : ""}</td><td>${r.versionCode}</td><td>${(r.size / 1048576).toFixed(1)} MB</td><td>${when(r.createdAt)}</td><td><small class="muted">${esc(r.sha256.slice(0, 16))}…</small></td></tr>`).join("") || '<tr><td colspan="5" class="muted">No versions uploaded.</td></tr>'}
    </tbody></table></div>
    ${rs.length ? `<p><a href="/apk/latest.apk">Download latest APK</a></p>` : ""}`;
  $("#upload")?.addEventListener("click", async () => {
    const f = $("#apk").files[0]; if (!f) return toast("Choose an APK file");
    const q = new URLSearchParams({ versionName: $("#vName").value, versionCode: $("#vCode").value, certSha256: $("#vCert").value });
    try { toast("Uploading…"); await api("PUT", `/api/releases?${q}`, null, f); toast("Uploaded"); releases(); } catch (e) { fail(e); }
  });
  $("#rollAll")?.addEventListener("click", async () => {
    try { const r = await api("POST", "/api/releases/rollout", { groupId: $("#rollGroup").value ? +$("#rollGroup").value : null }); toast(`Update queued for ${r.queued} device(s)`); } catch (e) { fail(e); }
  });
}

// ---------- Settings ----------
async function settings() {
  const [s, admins] = await Promise.all([api("GET", "/api/settings"), api("GET", "/api/admins")]);
  const dis = canWrite() ? "" : "disabled";
  $("#view").innerHTML = `
    <h2>Settings</h2>
    <div class="grid2">
      <div class="card"><b>Exit PIN on phones</b> <span class="tag ${s.pinEnabled ? "warn" : ""}">${s.pinEnabled ? "on" : "off (recommended)"}</span>
        <p class="muted">Off: nobody holding a phone can leave kiosk mode. Only "Release" in this dashboard can. Turn it on only if a supervisor needs an on-phone way out: tap the device name 5 times, then enter the PIN.</p>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="pinOn" ${s.pinEnabled ? "checked" : ""} ${s.pinSet ? "" : "disabled"} ${dis}> Allow an exit PIN on phones</label>
        <div class="row" style="margin-top:8px"><input id="pin" type="password" inputmode="numeric" maxlength="8" placeholder="${s.pinSet ? "new PIN (4–8 digits)" : "choose a PIN (4–8 digits)"}" ${dis}><button class="btn" id="savePin" ${dis}>${s.pinSet ? "Change PIN" : "Set PIN &amp; turn on"}</button></div></div>
      <div class="card"><b>Security</b>
        <ul style="padding-left:18px;margin:8px 0">
          <li>${me.twoFactor ? "✅" : "⚠️"} Your sign-in uses two-factor codes</li>
          <li>${s.require2fa ? "✅" : "⚠️"} Two-factor required for every dashboard user</li>
          <li>${s.requireApproval ? "✅" : "⚠️"} New phones need your approval</li>
          <li>${s.pinEnabled ? "⚠️" : "✅"} No exit PIN on phones</li>
          <li>${s.disableDebugging ? "✅" : "⚠️"} USB debugging blocked</li>
        </ul>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="reqAppr" ${s.requireApproval ? "checked" : ""} ${dis}> New phones must be approved before they get apps</label>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="req2fa" ${s.require2fa ? "checked" : ""} ${dis} ${me.twoFactor ? "" : "disabled"}> Require two-factor for all users ${me.twoFactor ? "" : '<small class="muted">(set up yours on the Account page first)</small>'}</label></div>
      <div class="card"><b>Behaviour</b>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="autoUpd" ${s.autoUpdate ? "checked" : ""} ${dis}> Update devices automatically when a new version is uploaded</label>
        <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" id="noDebug" ${s.disableDebugging ? "checked" : ""} ${dis}> Block USB debugging on devices (recommended)</label></div>
      <div class="card"><b>Wi-Fi for new devices</b>
        <p class="muted">Optional: put Wi-Fi details in the QR code so new phones connect on their own.</p>
        <label>Network name (SSID)</label><input id="ssid" value="${esc(s.wifiSsid)}" ${dis} style="width:100%">
        <label>Password ${s.wifiPasswordSet ? "(leave empty to keep current)" : ""}</label><input id="wpass" type="password" ${dis} style="width:100%">
        <label>Signing-certificate checksum</label><input id="cert" value="${esc(s.certSha256)}" ${dis} style="width:100%">
        <p><button class="btn" id="saveNet" ${dis}>Save</button></p></div>
      <div class="card"><b>Dashboard users</b>
        <table><tbody>${admins.map((a) => `<tr><td>${esc(a.email)}</td><td>${esc(a.role)}${a.twoFactor ? ' <span class="tag">2FA</span>' : ""}</td><td>${canWrite() && a.email !== me.email ? `<button class="btn ghost" data-rmadmin="${a.id}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table>
        ${canWrite() ? `<label>Add user</label><div class="row"><input id="aEmail" type="email" placeholder="email"><input id="aPass" type="password" placeholder="password (12+ characters)"><select id="aRole"><option value="admin">Admin</option><option value="viewer">View only</option></select><button class="btn" id="aAdd">Add</button></div>` : ""}</div>
    </div>`;
  const put = async (body, msg) => { try { await api("PUT", "/api/settings", body); toast(msg); settings(); } catch (e) { fail(e); } };
  $("#savePin")?.addEventListener("click", () => put({ pin: $("#pin").value }, "PIN updated"));
  $("#pinOn")?.addEventListener("change", (e) => put({ pinEnabled: e.target.checked }, "Saved"));
  $("#reqAppr")?.addEventListener("change", (e) => put({ requireApproval: e.target.checked }, "Saved"));
  $("#req2fa")?.addEventListener("change", (e) => put({ require2fa: e.target.checked }, "Saved"));
  $("#autoUpd")?.addEventListener("change", (e) => put({ autoUpdate: e.target.checked }, "Saved"));
  $("#noDebug")?.addEventListener("change", (e) => put({ disableDebugging: e.target.checked }, "Saved"));
  $("#saveNet")?.addEventListener("click", () => put({ wifiSsid: $("#ssid").value, wifiPassword: $("#wpass").value, certSha256: $("#cert").value }, "Saved"));
  $("#aAdd")?.addEventListener("click", async () => { try { await api("POST", "/api/admins", { email: $("#aEmail").value, password: $("#aPass").value, role: $("#aRole").value }); settings(); } catch (e) { fail(e); } });
  document.querySelectorAll("[data-rmadmin]").forEach((b) => b.onclick = async () => { if (confirm("Remove this user?")) { await api("DELETE", `/api/admins/${b.dataset.rmadmin}`); settings(); } });
}

// ---------- Audit ----------
async function audit() {
  const rows = await api("GET", "/api/audit");
  $("#view").innerHTML = `<h2>Recent activity</h2><div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>
    ${rows.map((a) => `<tr><td>${when(a.ts)}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>'}</tbody></table></div>`;
}

boot();
// ---------- Account ----------
async function account() {
  const m = await api("GET", "/api/me"); me = { ...me, ...m };
  const banner = me.mustSetup2fa ? `<div class="card" style="border-color:var(--bad);margin-bottom:16px"><b>Two-factor sign-in is required.</b> Set it up below to continue using the dashboard.</div>` : "";
  $("#view").innerHTML = `${banner}
    <h2>My account</h2>
    <div class="grid2">
      <div class="card"><b>Change password</b>
        <p class="muted">At least 12 characters. Changing it signs you out everywhere else.</p>
        <label>Current password</label><input id="pwCur" type="password" autocomplete="current-password" style="width:100%">
        <label>New password</label><input id="pwNew" type="password" autocomplete="new-password" style="width:100%">
        <p><button class="btn" id="pwSave">Change password</button></p></div>
      <div class="card"><b>Two-factor sign-in</b> <span class="tag ${m.twoFactor ? "" : "warn"}">${m.twoFactor ? "on" : "off"}</span>
        <p class="muted">Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) to your sign-in.</p>
        <div id="tfa">${m.twoFactor
          ? `<label>Password</label><input id="tfPw" type="password" style="width:100%"><label>Current code</label><input id="tfCode" inputmode="numeric" maxlength="6" style="width:100%"><p><button class="btn danger" id="tfOff">Turn off</button></p>`
          : `<p><button class="btn" id="tfStart">Set up two-factor</button></p>`}</div></div>
    </div>`;
  $("#pwSave").onclick = async () => {
    try { await api("POST", "/api/me/password", { current: $("#pwCur").value, next: $("#pwNew").value }); toast("Password changed. Other sessions were signed out."); $("#pwCur").value = ""; $("#pwNew").value = ""; } catch (e) { fail(e); }
  };
  $("#tfStart")?.addEventListener("click", async () => {
    try {
      const r = await api("POST", "/api/me/2fa/setup");
      $("#tfa").innerHTML = `<p>1. Scan this with your authenticator app:</p><div class="qr"><img src="${r.qr}" alt="Authenticator QR code" style="width:200px"></div>
        <p class="muted">Or type this key: <code>${esc(r.secret)}</code></p><p>2. Enter the 6-digit code it shows:</p>
        <input id="tfCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="width:100%"><p><button class="btn" id="tfOn">Turn on</button></p>`;
      $("#tfOn").onclick = async () => {
        try {
          const e = await api("POST", "/api/me/2fa/enable", { code: $("#tfCode").value });
          $("#tfa").innerHTML = `<p><b>Save these recovery codes now.</b> Each works once if you lose your phone. They will not be shown again.</p>
            <pre style="background:var(--bg);padding:12px;border-radius:8px;font-size:15px;line-height:1.7">${e.recoveryCodes.map(esc).join("\n")}</pre>
            <p><button class="btn" id="tfDone">I have saved them</button></p>`;
          $("#tfDone").onclick = async () => { me.mustSetup2fa = false; me.twoFactor = true; await boot(); go("account"); };
        } catch (er) { fail(er); }
      };
    } catch (e) { fail(e); }
  });
  $("#tfOff")?.addEventListener("click", async () => {
    try { await api("POST", "/api/me/2fa/disable", { password: $("#tfPw").value, code: $("#tfCode").value }); toast("Two-factor turned off"); await boot(); go("account"); } catch (e) { fail(e); }
  });
}
