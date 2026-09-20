// ===== Edit listing (app5.js) =====
// Adds an Edit button on your own listings, an edit form at #/listing/ID?edit=1,
// and an "Edited" note on listings whose details changed after posting.
// Loaded after app1 to app4. Photos can't be edited yet.
// The database itself stops users changing the post date, owner or item/service type.

const _listingView = window.listing;
let editFrom = null; // set when Edit was tapped, so Save/Cancel can step back instead of stacking pages
function leaveEdit(id){ if (editFrom === id) { editFrom = null; history.back(); } else location.replace("#/listing/" + id); }
window.listing = async function(id){
  if (hashParams().get("edit") === "1") return editListing(id);
  await _listingView(id);
  const { data: x } = await sb.from("listings").select("seller_id,updated_at").eq("id", id).maybeSingle();
  if (!x) return;
  const meta = app.querySelector("h1 + p.muted");
  if (meta && x.updated_at) meta.appendChild(document.createTextNode(" Edited " + ago(x.updated_at) + "."));
  const del = document.getElementById("del");
  if (del && me() === x.seller_id) {
    const b = document.createElement("button");
    b.className = "btn ghost"; b.id = "edt"; b.type = "button"; b.textContent = "Edit";
    b.onclick = () => { editFrom = id; location.hash = "#/listing/" + id + "?edit=1"; };
    del.parentNode.insertBefore(b, del);
  }
};

async function editListing(id){
  if (needLogin()) return;
  const { data: l, error } = await sb.from("listings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!l || l.seller_id !== me()) {
    app.innerHTML = `<div class="empty"><h2>You can't edit this listing</h2><a class="btn" href="#/">Browse listings</a></div>`;
    return;
  }
  const svc = l.kind === "service";
  const cats = (svc ? SERVICE_CATEGORIES : CATEGORIES).slice();
  if (l.category && !cats.includes(l.category)) cats.unshift(l.category);
  app.innerHTML = `
    <h1>${svc ? "Edit service" : "Edit listing"}</h1>
    <form id="ef" class="stack">
      <p class="small muted">Photos can't be changed yet. To change photos, delete this listing and post it again.</p>
      <div><label for="ti">Title</label><input id="ti" required minlength="3" maxlength="80" value="${esc(l.title)}"></div>
      ${svc ? `<div><label for="pt">Pricing</label><select id="pt">${Object.entries(PRICE_TYPES).map(([k, v]) => `<option value="${k}" ${k === l.price_type ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>` : ""}
      <div id="prw"><label for="pr">Price (${CURRENCY})</label><input id="pr" type="number" inputmode="decimal" min="0" step="0.01" required value="${esc(l.price)}"></div>
      <div><label for="ca">Category</label><select id="ca">${cats.map(c => `<option ${c === l.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div><label for="ar">${svc ? "Area you serve" : "Area for meet-up"}</label><input id="ar" maxlength="60" value="${esc(l.area || "")}"></div>
      <div><label for="de">Description</label><textarea id="de" maxlength="2000"></textarea></div>
      <p class="small muted">Buyers will see that this listing was edited.</p>
      <p class="err" id="er"></p>
      <button class="btn block" id="sv">Save changes</button>
      <button class="btn ghost block" type="button" id="cx">Cancel</button>
    </form>`;
  document.getElementById("de").value = l.description || "";
  document.getElementById("cx").onclick = () => leaveEdit(id);
  const pt = document.getElementById("pt"), pr = document.getElementById("pr"), prw = document.getElementById("prw"), er = document.getElementById("er");
  const syncPrice = () => { const quote = pt && pt.value === "quote"; prw.hidden = quote; pr.required = !quote; };
  if (pt) { pt.onchange = syncPrice; syncPrice(); }
  document.getElementById("ef").onsubmit = async e => {
    e.preventDefault(); er.textContent = "";
    const btn = document.getElementById("sv"); busy(btn, true, "Saving…");
    const priceType = svc ? pt.value : "fixed";
    const { error } = await sb.from("listings").update({
      title: document.getElementById("ti").value.trim(),
      price_type: priceType,
      price: priceType === "quote" ? 0 : Number(pr.value),
      category: document.getElementById("ca").value,
      area: document.getElementById("ar").value.trim(),
      description: document.getElementById("de").value.trim()
    }).eq("id", id).eq("seller_id", me()).select("id").single();
    if (error) { er.textContent = "Couldn't save: " + error.message; busy(btn, false, "Save changes"); return; }
    toast("Changes saved");
    leaveEdit(id);
  };
}

// ===== Account settings (#/mine?settings=1): display name, email, password =====
const _mineView = window.mine;
window.mine = async function(){
  if (hashParams().get("settings") === "1") return accountSettings();
  await _mineView();
  const h = app.querySelector(".panel h2");
  if (h && !document.getElementById("stg")) {
    const p = document.createElement("p");
    p.innerHTML = `<a class="btn ghost" id="stg" href="#/mine?settings=1">Account settings</a>`;
    h.parentNode.insertBefore(p, h.nextSibling);
  }
};

async function accountSettings(){
  if (needLogin()) return;
  const u = session.user, email = u.email || "";
  const { data: p, error } = await sb.from("profiles").select("display_name,created_at").eq("id", me()).maybeSingle();
  if (error) throw error;
  const since = p?.created_at ? new Date(p.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "";
  app.innerHTML = `
    <p class="small"><a href="#/mine">Back to Me</a></p>
    <h1>Account settings</h1>
    <form id="sfn" class="panel stack">
      <h2>Display name</h2>
      <p class="small muted">Shown to buyers and sellers. Names that look like KakiMart staff aren't allowed.</p>
      <div><label for="sdn">Display name</label><input id="sdn" required maxlength="40" autocomplete="nickname" value="${esc(p?.display_name || "")}"></div>
      <p class="err" id="se1"></p>
      <button class="btn" id="sb1">Save name</button>
    </form>
    <form id="sfe" class="panel stack" style="margin-top:16px">
      <h2>Email</h2>
      <p class="small muted">Currently ${esc(email)}.${u.new_email ? ` Waiting for you to confirm ${esc(u.new_email)}.` : ""} The change only happens after you tap the link we email you.</p>
      <div><label for="sem">New email</label><input id="sem" type="email" required autocomplete="email"></div>
      <p class="err" id="se2"></p>
      <button class="btn" id="sb2">Change email</button>
    </form>
    <form id="sfw" class="panel stack" style="margin-top:16px">
      <h2>Password</h2>
      <div><label for="scp">Current password</label><input id="scp" type="password" required autocomplete="current-password"></div>
      <div><label for="sn1">New password</label><input id="sn1" type="password" required minlength="8" autocomplete="new-password"></div>
      <div><label for="sn2">Type it again</label><input id="sn2" type="password" required minlength="8" autocomplete="new-password"></div>
      <p class="err" id="se3"></p>
      <button class="btn" id="sb3">Change password</button>
    </form>
    ${since ? `<p class="small muted" style="margin-top:16px">Member since ${esc(since)}.</p>` : ""}`;
  const $ = id => document.getElementById(id);

  $("sfn").onsubmit = async e => {
    e.preventDefault(); $("se1").textContent = ""; busy($("sb1"), true, "Saving…");
    const { data, error } = await sb.from("profiles").update({ display_name: $("sdn").value.trim() }).eq("id", me()).select("display_name").single();
    busy($("sb1"), false, "Save name");
    if (error) { $("se1").textContent = error.message; return; }
    myName = data.display_name; $("sdn").value = myName;
    $("who").textContent = "Hi, " + myName; toast("Name saved");
  };

  $("sfe").onsubmit = async e => {
    e.preventDefault(); $("se2").textContent = "";
    const next = $("sem").value.trim();
    if (next.toLowerCase() === email.toLowerCase()) { $("se2").textContent = "That's already your email."; return; }
    busy($("sb2"), true, "Sending…");
    const { error } = await sb.auth.updateUser({ email: next }, { emailRedirectTo: location.origin + location.pathname });
    busy($("sb2"), false, "Change email");
    if (error) { $("se2").textContent = error.message; return; }
    $("sem").value = "";
    $("se2").textContent = "";
    toast("Check your email");
    e.target.querySelector("p.muted").textContent = `We sent a confirmation link to ${next}. If a link also arrives at ${email}, tap both. Your email changes after that.`;
  };

  $("sfw").onsubmit = async e => {
    e.preventDefault(); $("se3").textContent = "";
    const cur = $("scp").value, n1 = $("sn1").value;
    if (n1 !== $("sn2").value) { $("se3").textContent = "The new passwords don't match."; return; }
    if (n1 === cur) { $("se3").textContent = "Choose a password different from your current one."; return; }
    busy($("sb3"), true, "Checking…");
    const check = await sb.auth.signInWithPassword({ email, password: cur });
    if (check.error) { busy($("sb3"), false, "Change password"); $("se3").textContent = "Your current password is wrong."; return; }
    busy($("sb3"), true, "Saving…");
    const { error } = await sb.auth.updateUser({ password: n1 });
    busy($("sb3"), false, "Change password");
    if (error) { $("se3").textContent = error.message; return; }
    e.target.reset(); toast("Password changed");
  };
}

// The first page can be drawn before this file loads. Redraw Browse, listing and Me pages once
// so they use the newest versions. Chat pages are left alone to avoid double connections.
if (sb && /^(#\/?(\?.*)?|#\/listing\/.*|#\/mine.*)?$/.test(location.hash)) route();
