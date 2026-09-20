// ===== Moderation panel (app6.js): analytics, reports, hide, suspend, resolve, audit log =====
// Opens at #/mine?admin=1. Only accounts in the database's admin list can load data or act:
// the database refuses everyone else, whatever this page shows. Every admin action,
// including reading a reported chat, is written to an audit log the app can't change.
// Numbers are totals only. Admin accounts are left out of the people counts.
(function(){
  const st = document.createElement("style");
  st.textContent = `.tiles{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media(min-width:640px){.tiles{grid-template-columns:repeat(4,1fr)}}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}
.tile b{display:block;font:800 26px/1.1 var(--display)}
.tile span{font-size:13px;color:var(--muted)}
.charts{display:grid;gap:12px;margin-top:12px}
@media(min-width:760px){.charts{grid-template-columns:1fr 1fr}}
.charts h3{margin:0;font:700 17px/1.3 var(--display)}
.hb{margin-top:10px}
.hb-l{display:flex;justify-content:space-between;gap:8px;font-size:14px}
.hb-t{display:flex;height:10px;border-radius:999px;background:var(--line);overflow:hidden;margin-top:4px}
.hb-t i{display:block;height:100%}
.legend{display:flex;gap:12px;font-size:12px;color:var(--muted);margin-top:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.rep{margin-top:10px}
.rep .reason{white-space:pre-wrap;margin:6px 0}
.rep.done{opacity:.7}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.acts .btn{padding:8px 14px;font-size:14px}
.chatlog{margin-top:8px;border-top:1px solid var(--line);padding-top:8px;max-height:50vh;overflow-y:auto}
.chatlog p{margin:0 0 6px;white-space:pre-wrap;word-wrap:break-word}
.tabs.four{gap:6px}.tabs.four a{flex:auto;font-size:14px;padding:10px 8px;white-space:nowrap}`;
  document.head.appendChild(st);
})();

let adminFor = null, adminYes = false;
async function amAdmin(){
  if (!me()) return false;
  if (adminFor === me()) return adminYes;
  const { data, error } = await sb.rpc("is_admin");
  adminFor = me(); adminYes = !error && data === true;
  return adminYes;
}

const _mineV5 = window.mine;
window.mine = async function(){
  if (hashParams().get("admin") === "1") return adminPanel();
  await _mineV5();
  if (hashParams().get("settings") === "1") return;
  if (!(await amAdmin())) {
    const { data: susp } = await sb.rpc("i_am_suspended");
    if (susp === true && !document.getElementById("susp")) app.insertAdjacentHTML("afterbegin",
      `<p class="notice" id="susp">Your account is suspended. You can't post, edit or send messages. Contact kakimart.sg@gmail.com if you think this is a mistake.</p>`);
    return;
  }
  {
    const s = document.getElementById("stg");
    if (s && !document.getElementById("mod")) {
      const a = document.createElement("a");
      a.className = "btn"; a.id = "mod"; a.href = "#/mine?admin=1"; a.textContent = "Moderation";
      a.style.marginLeft = "8px";
      s.parentNode.appendChild(a);
    }
  }
};

// ----- Small chart helpers (plain SVG and CSS, no outside scripts) -----
const sum = a => (a || []).reduce((x, y) => x + Number(y || 0), 0);
function weekChart(title, weeks, vals){
  vals = (vals || []).map(Number);
  const n = vals.length, W = 320, H = 112, bw = W / Math.max(1, n), max = Math.max(1, ...vals);
  let g = "";
  vals.forEach((v, i) => {
    const h = Math.round(v / max * 76), x = i * bw;
    g += `<rect x="${x + 3}" y="${88 - h}" width="${bw - 6}" height="${Math.max(h, v ? 2 : 0)}" rx="3" fill="var(--blue)"><title>Week of ${esc(weeks[i])}: ${v}</title></rect>`;
    if (v) g += `<text x="${x + bw / 2}" y="${84 - h}" text-anchor="middle" font-size="10" fill="var(--muted)">${v}</text>`;
    if (i % 3 === (n - 1) % 3) g += i === n - 1
      ? `<text x="${W - 1}" y="104" text-anchor="end" font-size="9" fill="var(--muted)">This wk</text>`
      : `<text x="${x + bw / 2}" y="104" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(weeks[i])}</text>`;
  });
  return `<div class="panel"><h3>${esc(title)}</h3><p class="small muted">${sum(vals)} in the last 12 weeks</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}, weekly, last 12 weeks" style="width:100%;height:auto;display:block">${g}<line x1="0" y1="88.5" x2="${W}" y2="88.5" stroke="var(--line)"/></svg></div>`;
}
// rows: [{label, parts:[{v, color}], right, sub}]
function barList(title, rows, note, legend){
  const max = Math.max(1, ...rows.map(r => sum(r.parts.map(p => p.v))));
  const body = rows.length ? rows.map(r => `<div class="hb"><div class="hb-l"><span>${esc(r.label)}</span><strong>${esc(r.right)}</strong></div>
    <div class="hb-t">${r.parts.map(p => `<i style="width:${(Number(p.v) / max * 100).toFixed(1)}%;background:${p.color}"></i>`).join("")}</div>
    ${r.sub ? `<div class="small muted">${esc(r.sub)}</div>` : ""}</div>`).join("") : `<p class="small muted">Nothing yet.</p>`;
  return `<div class="panel"><h3>${esc(title)}</h3>${note ? `<p class="small muted">${esc(note)}</p>` : ""}${legend || ""}${body}</div>`;
}
const tile = (v, label) => `<div class="tile"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "0%";

// ----- The panel -----
const ACTION_NAMES = { hide_listing: "Hid listing", unhide_listing: "Unhid listing", suspend_user: "Suspended", unsuspend_user: "Unsuspended",
  resolve_report: "Resolved report", reopen_report: "Reopened report", read_chat: "Read reported chat" };
let adminTab = "t1";
async function adminAct(fn, args, done){
  const { error } = await sb.rpc(fn, args);
  if (error) { toast(error.message); return false; }
  toast(done); return true;
}
async function adminPanel(){
  if (needLogin()) return;
  if (!(await amAdmin())) {
    app.innerHTML = `<div class="empty"><h2>Not available</h2><a class="btn" href="#/mine">Back to Me</a></div>`;
    return;
  }
  if (!document.getElementById("apanel")) app.innerHTML = `<p class="muted">Loading dashboard…</p>`;
  const [s, r, ls] = await Promise.all([sb.rpc("admin_stats"), sb.rpc("admin_reports"), sb.rpc("admin_lists")]);
  if (s.error) throw s.error;
  if (r.error) throw r.error;
  if (ls.error) throw ls.error;
  const d = s.data, reports = r.data || [], lists = ls.data || {}, P = d.people, L = d.listings, A = d.activity, S = d.safety, F = d.funnel, W = d.weeks;
  const blue = "var(--blue)", yellow = "var(--tag)";
  const open = reports.filter(x => x.open).length;

  const overview = `
    <div class="tiles">
      ${tile(P.total, "accounts")}${tile(P.active_7d, "active in last 7 days")}
      ${tile(P.active_30d, "active in last 30 days")}${tile(P.notifications_on, "with notifications on")}
      ${tile(L.live, "live listings")}${tile(L.sold_now, "marked sold")}
      ${tile(L.items + " / " + L.services, "items / services")}${tile(L.edited, "listings edited")}
      ${tile(A.chats_total, "chats")}${tile(A.messages_total, "messages")}
      ${tile(S.reports_open + " / " + S.reports_total, "open / all reports")}${tile(S.median_hours_to_resolve == null ? "-" : S.median_hours_to_resolve + "h", "typical time to resolve")}
      ${tile(S.suspended_users, "suspended users")}${tile(S.hidden_listings, "hidden listings")}
      ${tile(S.blocks_total, "blocks")}
    </div>
    <div class="charts">
      ${weekChart("New accounts", W, P.signups_by_week)}
      ${weekChart("New listings", W, L.new_by_week)}
      ${weekChart("Marked sold", W, L.sold_by_week)}
      ${weekChart("Chats started", W, A.chats_by_week)}
      ${weekChart("Messages sent", W, A.messages_by_week)}
      ${weekChart("Reports", W, S.reports_by_week)}
      ${barList("Listings by category", (L.by_category || []).map(c => ({
          label: c.category, right: String(Number(c.live) + Number(c.sold_ever)),
          parts: [{ v: c.live, color: blue }, { v: c.sold_ever, color: yellow }],
          sub: `${c.live} live, ${c.sold_ever} marked sold` })),
        "Sold counts only what sellers marked as sold.",
        `<div class="legend"><span><i style="background:${blue}"></i>Live</span><span><i style="background:${yellow}"></i>Marked sold</span></div>`)}
      ${barList("Typical price by category", (L.median_price_by_category || []).map(c => ({
          label: c.category, right: money(c.median), parts: [{ v: c.median, color: blue }],
          sub: `middle price of ${c.n} fixed-price listing${c.n == 1 ? "" : "s"}` })), "Services priced per hour or by quote are left out.")}
      ${barList("Top meet-up areas", (L.top_areas || []).map(a => ({ label: a.area, right: String(a.n), parts: [{ v: a.n, color: blue }] })),
        "As typed by sellers, so spellings vary.")}
      ${barList("From sign-up to activity", [
          { label: "Signed up", right: String(F.signed_up), parts: [{ v: F.signed_up, color: blue }] },
          { label: "Posted a listing", right: pct(F.posted, F.signed_up), parts: [{ v: F.posted, color: blue }], sub: F.posted + " people" },
          { label: "Sent a message", right: pct(F.messaged, F.signed_up), parts: [{ v: F.messaged, color: blue }], sub: F.messaged + " people" }
        ], "Only counts listings that still exist.")}
      ${barList("Listings that got interest", [
          { label: "Live listings with at least 1 chat", right: pct(A.live_listings_with_chat, L.live), parts: [{ v: A.live_listings_with_chat, color: blue }, { v: L.live - A.live_listings_with_chat, color: "var(--line)" }], sub: `${A.live_listings_with_chat} of ${L.live}` }
        ])}
    </div>
    <p class="small muted" style="margin-top:12px">Admin accounts are not counted. Hidden listings are left out of listing numbers. "Active" means signed in or used the app. History before 20 Sep 2026 is estimated from current listings. ${L.created_ever} listings posted in total, ${L.deleted_ever} deleted since tracking began.</p>`;

  const btn = (act, label, data, cls) => `<button type="button" class="btn ${cls || "ghost"}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}>${esc(label)}</button>`;
  const reportList = reports.length ? reports.map(x => `
    <div class="panel rep${x.open ? "" : " done"}">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><strong>${x.open ? "Open" : "Resolved"}: ${x.about_chat ? "chat report" : "listing report"}</strong><span class="small muted">${esc(ago(x.created_at))}</span></div>
      <p class="reason">${esc(x.reason)}</p>
      <p class="small muted">${esc(x.reporter_name || "Deleted user")} reported ${esc(x.reported_name || "a deleted user")}${x.reported_suspended ? " (suspended)" : ""}${x.listing_title ? `, about "${esc(x.listing_title)}"` : ""}.
      ${x.listing_exists ? ` <a href="#/listing/${esc(x.listing_id)}">Open listing</a>${x.listing_hidden ? " (hidden)" : ""}` : x.listing_id ? " The listing was deleted." : ""}</p>
      ${x.open ? "" : `<p class="small">Resolved ${esc(ago(x.resolved_at))}${x.resolution ? `: ${esc(x.resolution)}` : "."}</p>`}
      <div class="acts">
        ${x.open ? btn("resolve", "Resolve", { id: x.id }, "") : btn("reopen", "Reopen", { id: x.id })}
        ${x.about_chat ? btn("chat", "Read chat", { id: x.id }) : ""}
        ${x.listing_exists && x.listing_hidden_via !== "suspension" ? btn(x.listing_hidden ? "unhide" : "hide", x.listing_hidden ? "Unhide listing" : "Hide listing", { id: x.listing_id, name: x.listing_title || "" }) : ""}
        ${x.reported_id && x.reported_name ? btn(x.reported_suspended ? "unsuspend" : "suspend", x.reported_suspended ? "Unsuspend user" : "Suspend user", { id: x.reported_id, name: x.reported_name }, x.reported_suspended ? "ghost" : "danger") : ""}
      </div>
      <div class="chatlog" id="cl${esc(x.id)}" hidden></div>
    </div>`).join("") : `<div class="empty"><p class="muted">No reports yet.</p></div>`;

  const sus = lists.suspended || [], hid = lists.hidden || [], log = lists.log || [];
  const people = `
    <div class="panel"><h3>Suspended users (${sus.length})</h3>
      ${sus.length ? sus.map(u => `<div class="hb"><div class="hb-l"><span>${esc(u.name || "Deleted user")}</span><span class="small muted">since ${esc(ago(u.since))}</span></div>
        <div class="acts">${btn("unsuspend", "Unsuspend", { id: u.id, name: u.name || "" })}</div></div>`).join("") : `<p class="small muted">No one is suspended.</p>`}
    </div>
    <div class="panel" style="margin-top:12px"><h3>Hidden listings (${hid.length})</h3>
      ${hid.length ? hid.map(l => `<div class="hb"><div class="hb-l"><a href="#/listing/${esc(l.id)}">${esc(l.title)}</a><span class="small muted">${esc(ago(l.since))}</span></div>
        <div class="small muted">by ${esc(l.seller || "unknown")}${l.via === "suspension" ? ", hidden because the seller is suspended" : ""}</div>
        ${l.via === "listing" ? `<div class="acts">${btn("unhide", "Unhide", { id: l.id, name: l.title })}</div>` : ""}</div>`).join("") : `<p class="small muted">No hidden listings.</p>`}
    </div>`;
  const logList = `<div class="panel"><h3>Admin actions</h3><p class="small muted">Every admin action is recorded here and can't be edited or deleted from the app. Latest 200.</p>
    ${log.length ? log.map(a => `<div class="hb"><div class="hb-l"><span><strong>${esc(ACTION_NAMES[a.action] || a.action)}</strong>: ${esc(a.target || "")}</span><span class="small muted">${esc(ago(a.at))}</span></div>
      <div class="small muted">by ${esc(a.by)}${a.note ? `. Note: ${esc(a.note)}` : ""}</div></div>`).join("") : `<p class="small muted">No actions yet.</p>`}</div>`;

  app.innerHTML = `
    <div id="apanel">
    <p class="small"><a href="#/mine">Back to Me</a></p>
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h1>Moderation</h1><button class="btn ghost" id="arf" type="button">Refresh</button></div>
    <p class="small muted">Updated ${esc(new Date(d.generated_at).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }))}</p>
    <div class="tabs four"><a href="#" data-t="t1">Overview</a><a href="#" data-t="t2">Reports (${open})</a><a href="#" data-t="t3">Hidden</a><a href="#" data-t="t4">Log</a></div>
    <div data-p="t1">${overview}</div>
    <div data-p="t2">${reportList}</div>
    <div data-p="t3">${people}</div>
    <div data-p="t4">${logList}</div>
    </div>`;
  const root = document.getElementById("apanel");
  const show = t => { adminTab = t; root.querySelectorAll("[data-t]").forEach(a => a.classList.toggle("on", a.dataset.t === t)); root.querySelectorAll("[data-p]").forEach(p => { p.hidden = p.dataset.p !== t; }); };
  show(adminTab);
  root.querySelectorAll("[data-t]").forEach(a => a.onclick = e => { e.preventDefault(); show(a.dataset.t); });
  document.getElementById("arf").onclick = () => adminPanel();
  root.onclick = async e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const { act, id, name } = b.dataset;
    let ok = false;
    if (act === "resolve" || act === "reopen") {
      const note = act === "resolve" ? prompt("How was this handled? (optional, kept in the log)") : "";
      if (note === null) return;
      b.disabled = true;
      ok = await adminAct("admin_resolve_report", { p_report: Number(id), p_resolve: act === "resolve", p_note: note }, act === "resolve" ? "Report resolved" : "Report reopened");
    } else if (act === "chat") {
      const box = document.getElementById("cl" + id);
      if (!box.hidden) { box.hidden = true; return; }
      if (!confirm("Reading this chat is recorded in the admin log. Continue?")) return;
      b.disabled = true;
      const { data, error } = await sb.rpc("admin_report_chat", { p_report: Number(id) });
      b.disabled = false;
      if (error) { toast(error.message); return; }
      box.innerHTML = data.length ? data.map(m => `<p><strong>${esc(m.from)}</strong> <span class="small muted">${esc(new Date(m.at).toLocaleString("en-SG", { dateStyle: "short", timeStyle: "short" }))}</span><br>${esc(m.body)}</p>`).join("") : `<p class="small muted">No messages.</p>`;
      box.hidden = false; return;
    } else if (act === "hide" || act === "unhide") {
      const note = prompt(`${act === "hide" ? "Hide" : "Unhide"} "${name}"? Reason (optional, kept in the log)`);
      if (note === null) return;
      b.disabled = true;
      ok = await adminAct("admin_hide_listing", { p_listing: id, p_hide: act === "hide", p_note: note }, act === "hide" ? "Listing hidden" : "Listing visible again");
    } else if (act === "suspend" || act === "unsuspend") {
      const note = prompt(act === "suspend"
        ? `Suspend ${name}? They won't be able to post, edit or message, and their listings will be hidden. Reason (kept in the log):`
        : `Unsuspend ${name}? Listings hidden by the suspension will show again. Note (optional):`);
      if (note === null) return;
      b.disabled = true;
      ok = await adminAct("admin_suspend_user", { p_user: id, p_suspend: act === "suspend", p_note: note }, act === "suspend" ? name + " suspended" : name + " unsuspended");
    }
    if (ok) adminPanel(); else b.disabled = false;
  };
}
window.adminPanel = safePage(adminPanel);

// ----- Listing page: hidden notice for owner and admin, admin tools -----
const _listingV5 = window.listing;
window.listing = async function(id){
  await _listingV5(id);
  if (hashParams().get("edit") === "1" || !me()) return;
  const { data: x } = await sb.from("listings").select("seller_id,hidden_at,hidden_via,title").eq("id", id).maybeSingle();
  if (!x) return;
  const stack = app.querySelector(".stack"); if (!stack) return;
  const admin = await amAdmin();
  if (x.hidden_at && (admin || x.seller_id === me()))
    stack.insertAdjacentHTML("afterbegin", `<p class="notice">${admin ? `Hidden from everyone except the seller${x.hidden_via === "suspension" ? ", because the seller is suspended" : ""}.`
      : "This listing has been hidden by KakiMart moderators, so only you can see it. Contact kakimart.sg@gmail.com if you think this is a mistake."}</p>`);
  if (admin && x.seller_id !== me()) {
    const hideAct = x.hidden_at ? "unhide" : "hide";
    stack.insertAdjacentHTML("beforeend", `<div class="panel"><h3>Admin</h3><div class="acts">
      ${x.hidden_via !== "suspension" ? `<button class="btn ghost" type="button" id="ahl">${x.hidden_at ? "Unhide listing" : "Hide listing"}</button>` : ""}
      <a class="btn ghost" href="#/mine?admin=1">Open moderation</a></div>
      <p class="small muted">To suspend the seller, use a report in the moderation panel.</p></div>`);
    const b = document.getElementById("ahl");
    if (b) b.onclick = async () => {
      const note = prompt(`${hideAct === "hide" ? "Hide" : "Unhide"} "${x.title}"? Reason (optional, kept in the log)`);
      if (note === null) return;
      b.disabled = true;
      if (await adminAct("admin_hide_listing", { p_listing: id, p_hide: hideAct === "hide", p_note: note }, hideAct === "hide" ? "Listing hidden" : "Listing visible again")) route();
      else b.disabled = false;
    };
  }
};

// Redraw once if the page was drawn before this file loaded
if (sb && /^(#\/mine|#\/listing\/)/.test(location.hash)) route();
