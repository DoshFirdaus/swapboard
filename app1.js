// ===== 1. PASTE YOUR SUPABASE DETAILS HERE =====
const SUPABASE_URL = "https://nfscwoioempfclmdgkik.supabase.co";
const SUPABASE_KEY = "sb_publishable_v69vcpMhmU6Ok_85sVEv2Q_eJQ_ZMfI";
// ===== Optional settings =====
const CATEGORIES = ["Electronics","Furniture","Fashion","Home & living","Books","Sports","Toys & kids","Hobbies","Other"];
const CURRENCY = "S$";
const BUCKET = "listing-images";

const app = document.getElementById("app");
let sb = null, session = null, myName = "", chatChannel = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => CURRENCY + Number(n).toLocaleString("en-SG", {minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2});
const imgUrl = path => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const me = () => session?.user?.id;
function ago(ts){
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return "just now";
  const units = [[86400*30,"mo"],[86400,"d"],[3600,"h"],[60,"m"]];
  for (const [n,u] of units) if (s >= n) return Math.floor(s/n) + u + " ago";
}
function toast(msg){
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function needLogin(){ if (!me()) { location.hash = "#/login?next=" + encodeURIComponent(location.hash); return true; } return false; }
function busy(btn, on, label){ btn.disabled = on; if (label) btn.textContent = label; }

// ===== Router =====
async function route(){
  if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
  const [path, query] = (location.hash.slice(1) || "/").split("?");
  const params = new URLSearchParams(query || "");
  const parts = path.split("/").filter(Boolean);
  document.querySelectorAll("nav.bar a").forEach(a => a.classList.toggle("on", a.dataset.r === (parts[0] || "browse")));
  document.getElementById("who").textContent = me() ? "Hi, " + myName : "";
  window.scrollTo(0, 0);
  try {
    if (!parts.length) return browse(params);
    if (parts[0] === "listing") return listing(parts[1]);
    if (parts[0] === "new") return needLogin() || newListing();
    if (parts[0] === "inbox") return needLogin() || inbox();
    if (parts[0] === "chat") return needLogin() || chat(parts[1]);
    if (parts[0] === "mine") return needLogin() || mine();
    if (parts[0] === "login") return login(params);
    app.innerHTML = `<div class="empty"><h2>Page not found</h2><a class="btn" href="#/">Browse listings</a></div>`;
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="empty"><h2>Couldn't load this page</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back to listings</a></div>`;
  }
}

// ===== Browse =====
async function browse(params){
  const q = params.get("q") || "", cat = params.get("cat") || "";
  app.innerHTML = `
    <form class="search" id="sf">
      <input name="q" type="search" placeholder="Search listings" value="${esc(q)}" aria-label="Search listings">
      <select name="cat" aria-label="Category"><option value="">All</option>${CATEGORIES.map(c => `<option ${c===cat?"selected":""}>${esc(c)}</option>`).join("")}</select>
    </form>
    <div id="res"><p class="muted">Loading listings…</p></div>`;
  const f = document.getElementById("sf");
  const go = () => { const p = new URLSearchParams(); if (f.q.value.trim()) p.set("q", f.q.value.trim()); if (f.cat.value) p.set("cat", f.cat.value); location.hash = "#/" + (p.toString() ? "?" + p : ""); };
  f.onsubmit = e => { e.preventDefault(); go(); };
  f.cat.onchange = go;

  let req = sb.from("listings").select("id,title,price,area,images,created_at").eq("status","available").order("created_at",{ascending:false}).limit(60);
  const safe = q.replace(/[,()%*\\]/g, " ").trim();
  if (safe) req = req.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  if (cat) req = req.eq("category", cat);
  const { data, error } = await req;
  if (error) throw error;
  const res = document.getElementById("res");
  if (!data.length) {
    res.innerHTML = `<div class="empty"><h2>${q || cat ? "No matches" : "Nothing listed yet"}</h2><p class="muted">${q || cat ? "Try a different word or category." : "Be the first to sell something."}</p><a class="btn" href="#/new">List an item</a></div>`;
    return;
  }
  res.innerHTML = `<div class="grid">${data.map(cardHtml).join("")}</div>`;
}
function cardHtml(l){
  const img = l.images?.[0] ? `<img class="ph" loading="lazy" alt="" src="${esc(imgUrl(l.images[0]))}">` : `<span class="ph"></span>`;
  return `<a class="card" href="#/listing/${l.id}">${img}<span class="tag">${esc(money(l.price))}</span>${l.status==="sold"?`<span class="sold">Sold</span>`:""}
    <div class="meta"><div class="t">${esc(l.title)}</div><div class="small muted">${esc(l.area || "")}${l.area?", ":""}${ago(l.created_at)}</div></div></a>`;
}

// ===== Listing detail =====
async function listing(id){
  const { data: l, error } = await sb.from("listings").select("*, profiles(display_name)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!l) { app.innerHTML = `<div class="empty"><h2>This listing was removed</h2><a class="btn" href="#/">Browse listings</a></div>`; return; }
  const mine = me() === l.seller_id;
  app.innerHTML = `
    <div class="stack">
      ${l.images.length ? `<div class="gallery">${l.images.map(p => `<img alt="" src="${esc(imgUrl(p))}">`).join("")}</div>` : ""}
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><span class="tag big">${esc(money(l.price))}</span>${l.status==="sold"?`<strong class="muted">Sold</strong>`:""}</div>
      <h1>${esc(l.title)}</h1>
      <p class="muted small">${esc(l.category)}${l.area ? ", " + esc(l.area) : ""}. Listed ${ago(l.created_at)} by ${esc(l.profiles?.display_name || "a seller")}</p>
      ${l.description ? `<div class="panel" style="white-space:pre-wrap">${esc(l.description)}</div>` : ""}
      <div id="act"></div>
      <p class="notice">Meet in a public place, check the item, and pay on collection. Never pay a deposit to someone you haven't met.</p>
      ${!mine ? `<button class="btn ghost small" id="rep">Report this listing</button>` : ""}
    </div>`;
  const act = document.getElementById("act");
  if (mine) {
    act.innerHTML = `<div class="row"><button class="btn ghost" id="tog">${l.status==="sold"?"Mark as available":"Mark as sold"}</button><button class="btn danger" id="del">Delete</button></div>`;
    document.getElementById("tog").onclick = async e => {
      busy(e.target, true);
      const { error } = await sb.from("listings").update({ status: l.status === "sold" ? "available" : "sold" }).eq("id", id);
      if (error) { toast(error.message); busy(e.target, false); return; }
      toast(l.status === "sold" ? "Marked as available" : "Marked as sold"); route();
    };
    document.getElementById("del").onclick = () => deleteListing(l);
  } else if (l.status === "available") {
    act.innerHTML = `<button class="btn block" id="msg">Message seller</button>`;
    document.getElementById("msg").onclick = e => startChat(l, e.target);
  }
  const rep = document.getElementById("rep");
  if (rep) rep.onclick = async () => {
    if (needLogin()) return;
    const reason = prompt("What's wrong with this listing? (e.g. scam, prohibited item, offensive)");
    if (!reason || !reason.trim()) return;
    const { error } = await sb.from("reports").insert({ listing_id: id, reason: reason.trim().slice(0, 500) });
    toast(error ? error.message : "Report sent. Thanks.");
  };
}
async function deleteListing(l){
  if (!confirm("Delete this listing? This can't be undone.")) return;
  if (l.images.length) await sb.storage.from(BUCKET).remove(l.images);
  const { error } = await sb.from("listings").delete().eq("id", l.id);
  if (error) return toast(error.message);
  toast("Listing deleted"); location.hash = "#/mine";
}
async function startChat(l, btn){
  if (needLogin()) return;
  busy(btn, true, "Opening chat…");
  let { data: c } = await sb.from("conversations").select("id").eq("listing_id", l.id).eq("buyer_id", me()).maybeSingle();
  if (!c) {
    const r = await sb.from("conversations").insert({ listing_id: l.id, buyer_id: me(), seller_id: l.seller_id }).select("id").single();
    if (r.error) { toast(r.error.message); busy(btn, false, "Message seller"); return; }
    c = r.data;
  }
  location.hash = "#/chat/" + c.id;
}
