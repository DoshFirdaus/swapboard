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

// The first page can be drawn before this file loads. Redraw Browse and listing pages once
// so they use the newest versions. Chat pages are left alone to avoid double connections.
if (sb && /^(#\/?(\?.*)?|#\/listing\/.*)?$/.test(location.hash)) route();
