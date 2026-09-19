// ===== Services (app4.js): Items/Services tabs, posting a service, service listing page =====
// Also: pages that fail to load now show an error instead of "Loading..." forever.
// Loaded after app1, app2 and app3. The functions below replace the older versions by name.
const SERVICE_CATEGORIES = ["Tuition & lessons","Home repairs","Cleaning","Moving & delivery","Beauty & grooming","Tech help","Events & photography","Pet care","Other services"];
const PRICE_TYPES = { fixed: "Fixed price", hourly: "Per hour", from: "Starting from", quote: "Ask for quote" };
(function(){
  const st = document.createElement("style");
  st.textContent = `.tabs{display:flex;gap:8px;margin-bottom:12px}
.tabs a{flex:1;text-align:center;padding:10px;border-radius:999px;border:1.5px solid var(--line);text-decoration:none;color:var(--ink);font-weight:700}
.tabs a.on{background:var(--blue);color:var(--blue-ink);border-color:transparent}
.kindtag{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--line);color:var(--ink);margin-bottom:4px}`;
  document.head.appendChild(st);
})();
const hashParams = () => new URLSearchParams(location.hash.split("?")[1] || "");
function priceText(l){
  if (l.kind === "service") {
    if (l.price_type === "quote") return "Ask for quote";
    if (l.price_type === "hourly") return money(l.price) + "/hr";
    if (l.price_type === "from") return "From " + money(l.price);
  }
  return money(l.price);
}

// ----- Browse, with Items / Services tabs -----
async function browse(params){
  const q = params.get("q") || "", cat = params.get("cat") || "";
  const kind = params.get("kind") === "service" ? "service" : "item";
  const cats = kind === "service" ? SERVICE_CATEGORIES : CATEGORIES;
  app.innerHTML = `
    <div class="tabs"><a href="#/" class="${kind === "item" ? "on" : ""}">Items</a><a href="#/?kind=service" class="${kind === "service" ? "on" : ""}">Services</a></div>
    <form class="search" id="sf">
      <input name="q" type="search" placeholder="Search ${kind === "service" ? "services" : "items"}" value="${esc(q)}" aria-label="Search">
      <select name="cat" aria-label="Category"><option value="">All</option>${cats.map(c => `<option ${c === cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    </form>
    <div id="res"><p class="muted">Loading…</p></div>`;
  const f = document.getElementById("sf");
  const go = () => {
    const p = new URLSearchParams();
    if (kind === "service") p.set("kind", "service");
    if (f.q.value.trim()) p.set("q", f.q.value.trim());
    if (f.cat.value) p.set("cat", f.cat.value);
    location.hash = "#/" + (p.toString() ? "?" + p : "");
  };
  f.onsubmit = e => { e.preventDefault(); go(); };
  f.cat.onchange = go;

  let req = sb.from("listings").select("id,title,price,price_type,kind,area,images,status,created_at")
    .eq("status", "available").eq("kind", kind).order("created_at", { ascending: false }).limit(60);
  const safe = q.replace(/[,()%*\\]/g, " ").trim();
  if (safe) req = req.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  if (cat) req = req.eq("category", cat);
  const { data, error } = await req;
  if (error) throw error;
  const res = document.getElementById("res");
  if (!data.length) {
    const svc = kind === "service";
    res.innerHTML = `<div class="empty"><h2>${q || cat ? "No matches" : svc ? "No services yet" : "Nothing listed yet"}</h2>
      <p class="muted">${q || cat ? "Try a different word or category." : svc ? "Be the first to offer a service." : "Be the first to sell something."}</p>
      <a class="btn" href="${svc ? "#/new?kind=service" : "#/new"}">${svc ? "Offer a service" : "List an item"}</a></div>`;
    return;
  }
  res.innerHTML = `<div class="grid">${data.map(cardHtml).join("")}</div>`;
}
function cardHtml(l){
  const img = l.images?.[0] ? `<img class="ph" loading="lazy" alt="" src="${esc(imgUrl(l.images[0]))}">` : `<span class="ph"></span>`;
  const off = l.kind === "service" ? "Unavailable" : "Sold";
  return `<a class="card" href="#/listing/${l.id}">${img}<span class="tag">${esc(priceText(l))}</span>${l.status === "sold" ? `<span class="sold">${off}</span>` : ""}
    <div class="meta">${l.kind === "service" ? `<span class="kindtag">Service</span>` : ""}<div class="t">${esc(l.title)}</div><div class="small muted">${esc(l.area || "")}${l.area ? ", " : ""}${ago(l.created_at)}</div></div></a>`;
}

// ----- Listing page (items and services) -----
async function listing(id){
  const { data: l, error } = await sb.from("listings").select("*, profiles(display_name)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!l) { app.innerHTML = `<div class="empty"><h2>This listing was removed</h2><a class="btn" href="#/">Browse listings</a></div>`; return; }
  const mine = me() === l.seller_id, svc = l.kind === "service";
  const off = svc ? "Unavailable" : "Sold";
  app.innerHTML = `
    <div class="stack">
      ${l.images.length ? `<div class="gallery">${l.images.map(p => `<img alt="" src="${esc(imgUrl(p))}">`).join("")}</div>` : ""}
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><span class="tag big">${esc(priceText(l))}</span>${l.status === "sold" ? `<strong class="muted">${off}</strong>` : ""}</div>
      ${svc ? `<span class="kindtag">Service</span>` : ""}
      <h1>${esc(l.title)}</h1>
      <p class="muted small">${esc(l.category)}${l.area ? ", " + (svc ? "serves " : "") + esc(l.area) : ""}. Listed ${ago(l.created_at)} by ${esc(l.profiles?.display_name || (svc ? "a provider" : "a seller"))}</p>
      ${l.description ? `<div class="panel" style="white-space:pre-wrap">${esc(l.description)}</div>` : ""}
      <div id="act"></div>
      <p class="notice">${svc
        ? "KakiMart doesn't check service providers or their licences. Agree the price and what's included in chat, and avoid paying the full amount upfront."
        : "Meet in a public place, check the item, and pay on collection. Never pay a deposit to someone you haven't met."}</p>
      ${!mine ? `<button class="btn ghost small" id="rep">Report this listing</button>` : ""}
    </div>`;
  const act = document.getElementById("act");
  if (mine) {
    const isOff = l.status === "sold";
    act.innerHTML = `<div class="row"><button class="btn ghost" id="tog">${isOff ? "Mark as available" : svc ? "Mark as unavailable" : "Mark as sold"}</button><button class="btn danger" id="del">Delete</button></div>`;
    document.getElementById("tog").onclick = async e => {
      busy(e.target, true);
      const { error } = await sb.from("listings").update({ status: isOff ? "available" : "sold" }).eq("id", id);
      if (error) { toast(error.message); busy(e.target, false); return; }
      toast(isOff ? "Marked as available" : svc ? "Marked as unavailable" : "Marked as sold"); route();
    };
    document.getElementById("del").onclick = () => deleteListing(l);
  } else if (l.status === "available") {
    act.innerHTML = `<button class="btn block" id="msg">${svc ? "Message provider" : "Message seller"}</button>`;
    document.getElementById("msg").onclick = e => startChat(l, e.target);
  }
  const rep = document.getElementById("rep");
  if (rep) rep.onclick = async () => {
    if (needLogin()) return;
    const reason = prompt("What's wrong with this listing? (e.g. scam, prohibited item or service, offensive)");
    if (!reason || !reason.trim()) return;
    const { error } = await sb.from("reports").insert({ listing_id: id, reason: reason.trim().slice(0, 500) });
    toast(error ? error.message : "Report sent. Thanks.");
  };
}

// ----- Posting: sell an item or offer a service -----
function newListing(){
  const svc = hashParams().get("kind") === "service";
  const cats = svc ? SERVICE_CATEGORIES : CATEGORIES;
  app.innerHTML = `
    <div class="tabs"><a href="#/new" class="${svc ? "" : "on"}">Sell an item</a><a href="#/new?kind=service" class="${svc ? "on" : ""}">Offer a service</a></div>
    <form id="nf" class="stack">
      ${svc ? `<p class="notice">Not allowed: loans or moneylending, adult services, medical treatment, or any work that needs a licence you don't hold. See the <a href="terms.html">Terms of Use</a>.</p>` : ""}
      <div><label for="ph">Photos (up to 5${svc ? ", optional" : ""})</label><input id="ph" type="file" accept="image/*" multiple><div class="thumbs" id="th" style="margin-top:8px"></div></div>
      <div><label for="ti">Title</label><input id="ti" required minlength="3" maxlength="80" placeholder="${svc ? "e.g. Maths tuition for Sec 1 to 4" : "e.g. IKEA study desk, white"}"></div>
      ${svc ? `<div><label for="pt">Pricing</label><select id="pt">${Object.entries(PRICE_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>` : ""}
      <div id="prw"><label for="pr">Price (${CURRENCY})</label><input id="pr" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="${svc ? "e.g. 40" : "0 for free"}"></div>
      <div><label for="ca">Category</label><select id="ca">${cats.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
      <div><label for="ar">${svc ? "Area you serve" : "Area for meet-up"}</label><input id="ar" maxlength="60" placeholder="${svc ? "e.g. Tampines, or Islandwide" : "e.g. Tampines MRT"}"></div>
      <div><label for="de">Description</label><textarea id="de" maxlength="2000" placeholder="${svc ? "What's included, your experience, when you're available" : "Condition, size, reason for selling"}"></textarea></div>
      <p class="err" id="er"></p>
      <button class="btn block" id="sb">${svc ? "Publish service" : "Publish listing"}</button>
    </form>`;
  let files = [];
  const ph = document.getElementById("ph"), th = document.getElementById("th"), er = document.getElementById("er");
  const pt = document.getElementById("pt"), pr = document.getElementById("pr"), prw = document.getElementById("prw");
  if (pt) pt.onchange = () => { const quote = pt.value === "quote"; prw.hidden = quote; pr.required = !quote; };
  ph.onchange = () => {
    files = [...ph.files].slice(0, 5);
    if (ph.files.length > 5) er.textContent = "Only the first 5 photos will be used.";
    th.innerHTML = files.map(f => `<img alt="" src="${URL.createObjectURL(f)}">`).join("");
  };
  document.getElementById("nf").onsubmit = async e => {
    e.preventDefault(); er.textContent = "";
    const label = svc ? "Publish service" : "Publish listing";
    const btn = document.getElementById("sb"); busy(btn, true, files.length ? "Uploading photos…" : "Publishing…");
    const paths = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const blob = await compress(files[i]);
        const path = `${me()}/${Date.now()}-${i}.jpg`;
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        paths.push(path);
      }
      busy(btn, true, "Publishing…");
      const priceType = svc ? pt.value : "fixed";
      const { data, error } = await sb.from("listings").insert({
        kind: svc ? "service" : "item",
        price_type: priceType,
        title: document.getElementById("ti").value.trim(),
        price: priceType === "quote" ? 0 : Number(pr.value),
        category: document.getElementById("ca").value,
        area: document.getElementById("ar").value.trim(),
        description: document.getElementById("de").value.trim(),
        images: paths
      }).select("id").single();
      if (error) throw error;
      toast(svc ? "Service published" : "Listing published"); location.hash = "#/listing/" + data.id;
    } catch (err) {
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      er.textContent = "Couldn't publish: " + err.message;
      busy(btn, false, label);
    }
  };
}

// ----- Me page: same as before, but cards know about services -----
async function mine(){
  const { data, error } = await sb.from("listings").select("id,title,price,price_type,kind,area,images,status,created_at").eq("seller_id", me()).order("created_at", { ascending: false });
  if (error) throw error;
  app.innerHTML = `
    <div class="row" style="justify-content:space-between"><h1>Your listings</h1><button class="btn ghost" id="lo">Log out</button></div>
    ${data.length ? `<div class="grid">${data.map(cardHtml).join("")}</div>` : `<div class="empty"><p class="muted">You haven't listed anything yet.</p><a class="btn" href="#/new">List an item</a> <a class="btn ghost" href="#/new?kind=service">Offer a service</a></div>`}
    <div class="panel" style="margin-top:32px">
      <h2>Account</h2>
      <p class="small"><a href="privacy.html">Privacy policy</a></p>
      <button class="btn danger" id="da">Delete my account</button>
      <p class="small muted" style="margin-top:8px">Deletes your account, listings and photos. Chats and reports are kept for safety, as explained in the privacy policy.</p>
    </div>`;
  document.getElementById("lo").onclick = async () => { await forgetPushToken(); await sb.auth.signOut(); location.hash = "#/"; };
  document.getElementById("da").onclick = deleteAccount;
}

// ----- Chat page: show service pricing and a service-friendly hint -----
async function patchServiceChat(){
  const a = app.querySelector('a.list[href^="#/listing/"]');
  if (!a || a.dataset.svc) return;
  a.dataset.svc = "1";
  const id = a.getAttribute("href").split("/")[2];
  if (!id || id === "null") return;
  const { data: l } = await sb.from("listings").select("kind,price,price_type,status").eq("id", id).maybeSingle();
  if (!l || l.kind !== "service") return;
  const span = a.querySelector(".panel span.muted");
  if (span) span.textContent = priceText(l) + (l.status === "sold" ? ", unavailable" : "");
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = "Say hi and ask about the service. Agree the price, what's included, and when.";
}
new MutationObserver(() => { if (location.hash.startsWith("#/chat/")) patchServiceChat(); }).observe(app, { childList: true });

// ----- Show an error instead of "Loading..." forever when a page fails -----
function safePage(fn){
  return async function(...args){
    try { return await fn.apply(this, args); }
    catch (e) {
      console.error(e);
      app.innerHTML = `<div class="empty"><h2>Couldn't load this page</h2><p class="muted">Check your connection and try again.</p><p class="small muted">${esc(e?.message || "")}</p><a class="btn" href="#/">Back to listings</a></div>`;
    }
  };
}
browse = safePage(browse); listing = safePage(listing); inbox = safePage(inbox); chat = safePage(chat); mine = safePage(mine);
