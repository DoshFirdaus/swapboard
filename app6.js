// ===== Moderation panel, part 1 (app6.js): analytics dashboard and reports list =====
// Opens at #/mine?admin=1. Only accounts in the database's admin list can load any data:
// the database refuses everyone else, whatever this page shows.
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
.rep .reason{white-space:pre-wrap;margin:6px 0}`;
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
  if (await amAdmin()) {
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
async function adminPanel(){
  if (needLogin()) return;
  if (!(await amAdmin())) {
    app.innerHTML = `<div class="empty"><h2>Not available</h2><a class="btn" href="#/mine">Back to Me</a></div>`;
    return;
  }
  app.innerHTML = `<p class="muted">Loading dashboard…</p>`;
  const [s, r] = await Promise.all([sb.rpc("admin_stats"), sb.rpc("admin_reports")]);
  if (s.error) throw s.error;
  if (r.error) throw r.error;
  const d = s.data, reports = r.data || [], P = d.people, L = d.listings, A = d.activity, S = d.safety, F = d.funnel, W = d.weeks;
  const blue = "var(--blue)", yellow = "var(--tag)";

  const overview = `
    <div class="tiles">
      ${tile(P.total, "accounts")}${tile(P.active_7d, "active in last 7 days")}
      ${tile(P.active_30d, "active in last 30 days")}${tile(P.notifications_on, "with notifications on")}
      ${tile(L.live, "live listings")}${tile(L.sold_now, "marked sold")}
      ${tile(L.items + " / " + L.services, "items / services")}${tile(L.edited, "listings edited")}
      ${tile(A.chats_total, "chats")}${tile(A.messages_total, "messages")}
      ${tile(S.reports_total, "reports")}${tile(S.blocks_total, "blocks")}
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
    <p class="small muted" style="margin-top:12px">Admin accounts are not counted. "Active" means signed in or used the app. History before 20 Sep 2026 is estimated from current listings. ${L.created_ever} listings posted in total, ${L.deleted_ever} deleted since tracking began.</p>`;

  const reportList = reports.length ? reports.map(x => `
    <div class="panel rep">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><strong>${x.about_chat ? "Chat report" : "Listing report"}</strong><span class="small muted">${esc(ago(x.created_at))}</span></div>
      <p class="reason">${esc(x.reason)}</p>
      <p class="small muted">${esc(x.reporter_name || "Deleted user")} reported ${esc(x.reported_name || (x.about_chat ? "a deleted user" : "a seller"))}${x.listing_title ? `, about "${esc(x.listing_title)}"` : ""}.
      ${x.listing_exists ? ` <a href="#/listing/${esc(x.listing_id)}">Open listing</a>` : x.listing_id ? " The listing was deleted." : ""}</p>
    </div>`).join("") : `<div class="empty"><p class="muted">No reports yet.</p></div>`;

  app.innerHTML = `
    <p class="small"><a href="#/mine">Back to Me</a></p>
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h1>Moderation</h1><button class="btn ghost" id="arf" type="button">Refresh</button></div>
    <p class="small muted">Updated ${esc(new Date(d.generated_at).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }))}</p>
    <div class="tabs"><a href="#" id="t1" class="on">Overview</a><a href="#" id="t2">Reports (${reports.length})</a></div>
    <div id="p1">${overview}</div>
    <div id="p2" hidden>${reportList}<p class="small muted" style="margin-top:12px">Actions such as hiding listings and suspending users come in part 2.</p></div>`;
  const t1 = document.getElementById("t1"), t2 = document.getElementById("t2"), p1 = document.getElementById("p1"), p2 = document.getElementById("p2");
  const tab = one => { t1.classList.toggle("on", one); t2.classList.toggle("on", !one); p1.hidden = !one; p2.hidden = one; };
  t1.onclick = e => { e.preventDefault(); tab(true); };
  t2.onclick = e => { e.preventDefault(); tab(false); };
  document.getElementById("arf").onclick = () => adminPanel();
}
window.adminPanel = safePage(adminPanel);

// Redraw the Me page once if it was drawn before this file loaded
if (sb && /^#\/mine/.test(location.hash)) route();
