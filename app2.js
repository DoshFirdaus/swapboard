// ===== New listing =====
async function compress(file){
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((ok, bad) => cv.toBlob(b => b ? ok(b) : bad(new Error("Couldn't process photo")), "image/jpeg", 0.82));
}
function newListing(){
  app.innerHTML = `
    <h1>Sell something</h1>
    <form id="nf" class="stack">
      <div><label for="ph">Photos (up to 5)</label><input id="ph" type="file" accept="image/*" multiple><div class="thumbs" id="th" style="margin-top:8px"></div></div>
      <div><label for="ti">Title</label><input id="ti" required minlength="3" maxlength="80" placeholder="e.g. IKEA study desk, white"></div>
      <div><label for="pr">Price (${CURRENCY})</label><input id="pr" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0 for free"></div>
      <div><label for="ca">Category</label><select id="ca">${CATEGORIES.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
      <div><label for="ar">Area for meet-up</label><input id="ar" maxlength="60" placeholder="e.g. Tampines MRT"></div>
      <div><label for="de">Description</label><textarea id="de" maxlength="2000" placeholder="Condition, size, reason for selling"></textarea></div>
      <p class="err" id="er"></p>
      <button class="btn block" id="sb">Publish listing</button>
    </form>`;
  let files = [];
  const ph = document.getElementById("ph"), th = document.getElementById("th"), er = document.getElementById("er");
  ph.onchange = () => {
    files = [...ph.files].slice(0, 5);
    if (ph.files.length > 5) er.textContent = "Only the first 5 photos will be used.";
    th.innerHTML = files.map(f => `<img alt="" src="${URL.createObjectURL(f)}">`).join("");
  };
  document.getElementById("nf").onsubmit = async e => {
    e.preventDefault(); er.textContent = "";
    const btn = document.getElementById("sb"); busy(btn, true, "Uploading photos…");
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
      const { data, error } = await sb.from("listings").insert({
        title: document.getElementById("ti").value.trim(),
        price: Number(document.getElementById("pr").value),
        category: document.getElementById("ca").value,
        area: document.getElementById("ar").value.trim(),
        description: document.getElementById("de").value.trim(),
        images: paths
      }).select("id").single();
      if (error) throw error;
      toast("Listing published"); location.hash = "#/listing/" + data.id;
    } catch (err) {
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      er.textContent = "Couldn't publish: " + err.message;
      busy(btn, false, "Publish listing");
    }
  };
}

// ===== Unread messages (red dot) =====
let unreadChannel = null, unreadTotal = 0, readTimer = null;
(function(){
  const st = document.createElement("style");
  st.textContent = `.ubadge{display:inline-block;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:#E5484D;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;vertical-align:middle}
.list a.unread strong{font-weight:800}
.list a.unread .small{color:inherit;font-weight:600}`;
  document.head.appendChild(st);
})();
// Put the red number on the Chats link in the menu (not links inside the page)
function paintBadge(){
  document.querySelectorAll('nav.bar a[data-r="inbox"], nav.bar a[href="#/inbox"]').forEach(a => {
    if (app.contains(a)) return;
    let b = a.querySelector(".ubadge");
    if (!unreadTotal) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "ubadge"; a.appendChild(b); }
    b.textContent = unreadTotal > 9 ? "9+" : String(unreadTotal);
    b.setAttribute("aria-label", unreadTotal + " unread messages");
  });
}
async function fetchUnread(){
  if (!me()) return {};
  const { data, error } = await sb.rpc("my_unread_counts");
  if (error) return null;
  const map = {};
  (data || []).forEach(r => { map[r.conversation_id] = Number(r.unread); });
  return map;
}
function setUnreadTotal(map){
  if (!map) return;
  unreadTotal = Object.values(map).reduce((a, b) => a + b, 0);
  paintBadge();
}
async function refreshUnread(){ setUnreadTotal(await fetchUnread()); }
function markRead(convId){
  clearTimeout(readTimer);
  readTimer = setTimeout(async () => {
    if (!me()) return;
    await sb.rpc("mark_conversation_read", { conv_id: convId });
    refreshUnread();
  }, 600);
}
function startUnread(){
  if (unreadChannel) { sb.removeChannel(unreadChannel); unreadChannel = null; }
  unreadTotal = 0; paintBadge();
  if (!me()) return;
  unreadChannel = sb.channel("unread-" + me())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, p => {
      const m = p.new;
      if (!m || m.sender_id === me()) return;
      // If that chat is open on screen, the chat page marks it read itself
      if (location.hash.startsWith("#/chat/" + m.conversation_id) && document.visibilityState === "visible") return;
      refreshUnread();
      if (location.hash.startsWith("#/inbox")) route();
    })
    .subscribe();
  refreshUnread();
  savePushToken();
}
// Coming back to the app: catch up on anything missed while it was in the background
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !sb || !me()) return;
  const open = /^#\/chat\/([0-9a-f-]+)/.exec(location.hash);
  if (open) markRead(open[1]); else refreshUnread();
  if (location.hash.startsWith("#/inbox")) route();
});

// ===== Phone notifications (Android app only) =====
// The app hands this page the phone's notification address as window.__kakiToken
let pushSavedFor = null;
async function savePushToken(){
  const t = window.__kakiToken;
  if (!t || !sb || !me() || pushSavedFor === me() + t) return;
  const { error } = await sb.rpc("register_push_token", { t });
  if (!error) pushSavedFor = me() + t;
}
window.kakiOnToken = () => { savePushToken(); };
async function forgetPushToken(){
  const t = window.__kakiToken;
  pushSavedFor = null;
  if (!t || !sb || !me()) return;
  try { await sb.rpc("unregister_push_token", { t }); } catch (e) {}
}

// ===== Inbox =====
async function inbox(){
  const [res, unread] = await Promise.all([
    sb.from("conversations")
      .select("id,buyer_id,seller_id,last_message_at,listing_title, listings(title,images), buyer:profiles!conversations_buyer_id_fkey(display_name), seller:profiles!conversations_seller_id_fkey(display_name)")
      .order("last_message_at", { ascending: false }),
    fetchUnread()
  ]);
  const { data, error } = res;
  if (error) throw error;
  setUnreadTotal(unread);
  const u = unread || {};
  if (!data.length) { app.innerHTML = `<h1>Chats</h1><div class="empty"><p class="muted">No chats yet. Find something you like and message the seller.</p><a class="btn" href="#/">Browse listings</a></div>`; return; }
  app.innerHTML = `<h1>Chats</h1><div class="list">${data.map(c => {
    const otherId = c.buyer_id === me() ? c.seller_id : c.buyer_id;
    const other = otherId ? ((c.buyer_id === me() ? c.seller?.display_name : c.buyer?.display_name) || "User") : "Deleted user";
    const img = c.listings?.images?.[0] ? `<img alt="" src="${esc(imgUrl(c.listings.images[0]))}">` : `<span class="noimg"></span>`;
    const n = u[c.id] || 0;
    const badge = n ? `<span class="ubadge" aria-label="${n} unread">${n > 9 ? "9+" : n}</span>` : "";
    return `<a href="#/chat/${c.id}"${n ? ' class="unread"' : ""}>${img}<div><strong>${esc(other)}</strong>${badge}<div class="small muted">${esc(c.listings?.title || c.listing_title || "Removed listing")}, ${ago(c.last_message_at)}</div></div></a>`;
  }).join("")}</div>`;
}

// ===== Chat =====
async function chat(id){
  const { data: c, error } = await sb.from("conversations").select("*, listings(id,title,price,status)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!c) { app.innerHTML = `<div class="empty"><h2>Chat not found</h2><a class="btn" href="#/inbox">Back to chats</a></div>`; return; }
  app.innerHTML = `
    <a class="small" href="#/inbox">Back to chats</a>
    <a class="list" href="#/listing/${c.listing_id}" style="display:block;margin-top:8px;text-decoration:none"><div class="panel"><strong>${esc(c.listings?.title || c.listing_title || "Removed listing")}</strong> <span class="muted">${c.listings ? esc(money(c.listings.price)) : ""}${c.listings?.status==="sold"?", sold":""}</span></div></a>
    <div class="chat" id="ch" aria-live="polite"></div>
    ${!c.buyer_id || !c.seller_id ? `<p class="notice">This user has deleted their account. You can no longer send messages here.</p>` : ""}
    <form class="composer" id="cf" ${!c.buyer_id || !c.seller_id ? 'hidden' : ''}><input id="ci" maxlength="2000" placeholder="Write a message" autocomplete="off" aria-label="Message"><button class="btn">Send</button></form>`;
  const ch = document.getElementById("ch"), seen = new Set();
  const add = m => {
    if (seen.has(m.id)) return; seen.add(m.id);
    const d = document.createElement("div"); d.className = "msg" + (m.sender_id === me() ? " me" : "");
    d.textContent = m.body;
    const t = document.createElement("time"); t.textContent = new Date(m.created_at).toLocaleString("en-SG", { dateStyle: "short", timeStyle: "short" });
    d.appendChild(t); ch.appendChild(d); ch.scrollTop = ch.scrollHeight;
  };
  const { data: msgs, error: me2 } = await sb.from("messages").select("*").eq("conversation_id", id).order("created_at").limit(500);
  if (me2) throw me2;
  if (!msgs.length) ch.innerHTML = `<p class="muted small" id="hint">Say hi and ask about the item. Agree on price and a meet-up spot.</p>`;
  msgs.forEach(add);
  markRead(id);
  chatChannel = sb.channel("chat-" + id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, p => {
      document.getElementById("hint")?.remove(); add(p.new);
      if (p.new.sender_id !== me() && document.visibilityState === "visible") markRead(id);
    })
    .subscribe();
  const f = document.getElementById("cf"), ci = document.getElementById("ci");
  f.onsubmit = async e => {
    e.preventDefault();
    const body = ci.value.trim(); if (!body) return;
    ci.value = "";
    const { data, error } = await sb.from("messages").insert({ conversation_id: id, body }).select().single();
    if (error) { ci.value = body; toast(error.message); return; }
    document.getElementById("hint")?.remove(); add(data);
  };
}

// ===== My listings =====
async function mine(){
  const { data, error } = await sb.from("listings").select("id,title,price,area,images,status,created_at").eq("seller_id", me()).order("created_at", { ascending: false });
  if (error) throw error;
  app.innerHTML = `
    <div class="row" style="justify-content:space-between"><h1>Your listings</h1><button class="btn ghost" id="lo">Log out</button></div>
    ${data.length ? `<div class="grid">${data.map(cardHtml).join("")}</div>` : `<div class="empty"><p class="muted">You haven't listed anything yet.</p><a class="btn" href="#/new">List an item</a></div>`}
    <div class="panel" style="margin-top:32px">
      <h2>Account</h2>
      <p class="small"><a href="privacy.html">Privacy policy</a></p>
      <button class="btn danger" id="da">Delete my account</button>
      <p class="small muted" style="margin-top:8px">Deletes your account, listings and photos. Chats and reports are kept for safety, as explained in the privacy policy.</p>
    </div>`;
  document.getElementById("lo").onclick = async () => { await forgetPushToken(); await sb.auth.signOut(); location.hash = "#/"; };
  document.getElementById("da").onclick = deleteAccount;
}

// ===== Delete account =====
async function deleteAccount(e){
  const typed = prompt('This permanently deletes your account, listings and photos. Type DELETE to confirm.');
  if (typed !== "DELETE") { if (typed !== null) toast("Not deleted. You must type DELETE."); return; }
  const btn = e.target; busy(btn, true, "Deleting…");
  try {
    const { data: files } = await sb.storage.from(BUCKET).list(me(), { limit: 1000 });
    if (files && files.length) await sb.storage.from(BUCKET).remove(files.map(f => me() + "/" + f.name));
    const { error } = await sb.rpc("delete_my_account");
    if (error) throw error;
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    session = null; myName = "";
    location.hash = "#/"; toast("Your account has been deleted");
    route();
  } catch (err) {
    toast("Couldn't delete: " + err.message); busy(btn, false, "Delete my account");
  }
}

// ===== Password reset =====
async function forgotPassword(){
  const email = (prompt("Enter your account email. We'll send you a link to reset your password.") || "").trim();
  if (!email) return;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  toast(error ? error.message : "If that email has an account, a reset link is on its way.");
}
function resetPassword(){
  if (!me()) { app.innerHTML = `<div class="empty"><h2>Reset link expired</h2><p class="muted">Request a new link from the login page.</p><a class="btn" href="#/login">Go to login</a></div>`; return; }
  app.innerHTML = `
    <h1>Set a new password</h1>
    <form id="rf" class="stack panel">
      <div><label for="p1">New password</label><input id="p1" type="password" required minlength="8" autocomplete="new-password"></div>
      <div><label for="p2">Type it again</label><input id="p2" type="password" required minlength="8" autocomplete="new-password"></div>
      <p class="err" id="er"></p>
      <button class="btn block" id="go">Save new password</button>
    </form>`;
  document.getElementById("rf").onsubmit = async e => {
    e.preventDefault();
    const p1 = document.getElementById("p1").value, p2 = document.getElementById("p2").value, er = document.getElementById("er"), btn = document.getElementById("go");
    if (p1 !== p2) { er.textContent = "The two passwords don't match."; return; }
    busy(btn, true);
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { er.textContent = error.message; busy(btn, false); return; }
    toast("Password updated"); location.hash = "#/";
  };
}

// ===== Login / sign up =====
function login(params){
  const next = params.get("next") || "#/";
  let signup = false;
  const draw = () => {
    app.innerHTML = `
      <h1>${signup ? "Create account" : "Log in"}</h1>
      <form id="lf" class="stack panel">
        ${signup ? `<div><label for="dn">Display name</label><input id="dn" required maxlength="40" placeholder="Shown to buyers and sellers"></div>` : ""}
        <div><label for="em">Email</label><input id="em" type="email" required autocomplete="email"></div>
        <div><label for="pw">Password</label><input id="pw" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}"></div>
        <p class="err" id="er"></p>
        <button class="btn block" id="go">${signup ? "Create account" : "Log in"}</button>
      </form>
      <p class="small" style="text-align:center;margin-top:16px">${signup ? "Already have an account?" : "New here?"} <a href="#" id="sw">${signup ? "Log in" : "Create an account"}</a></p>
      ${signup ? `<p class="small muted" style="text-align:center">By creating an account you agree to our <a href="privacy.html">privacy policy</a>.</p>` : `<p class="small" style="text-align:center"><a href="#" id="fp">Forgot password?</a></p>`}`;
    document.getElementById("sw").onclick = e => { e.preventDefault(); signup = !signup; draw(); };
    const fp = document.getElementById("fp"); if (fp) fp.onclick = e => { e.preventDefault(); forgotPassword(); };
    document.getElementById("lf").onsubmit = async e => {
      e.preventDefault();
      const btn = document.getElementById("go"), er = document.getElementById("er");
      const email = document.getElementById("em").value.trim(), password = document.getElementById("pw").value;
      busy(btn, true); er.textContent = "";
      if (signup) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: document.getElementById("dn").value.trim() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) { er.textContent = error.message; busy(btn, false); return; }
        if (!data.session) { app.innerHTML = `<div class="empty"><h2>Check your email</h2><p class="muted">Tap the confirmation link we sent to ${esc(email)}, then log in.</p></div>`; return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) { er.textContent = error.message; busy(btn, false); return; }
      }
      location.hash = next;
    };
  };
  draw();
}

// ===== Start =====
async function loadName(){
  if (!me()) { myName = ""; return; }
  const { data } = await sb.from("profiles").select("display_name").eq("id", me()).maybeSingle();
  myName = data?.display_name || "there";
}
(async () => {
  if (SUPABASE_URL.startsWith("PASTE") || !window.supabase) {
    app.innerHTML = `<div class="panel"><h2>Almost there</h2><p>Open this file and paste your Supabase project URL and key into the two lines near the top of the script.</p></div>`;
    return;
  }
  const linkHash = location.hash;
  const isRecovery = linkHash.includes("type=recovery");
  const linkError = /error_description=([^&]+)/.exec(linkHash);
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data } = await sb.auth.getSession();
  session = data.session; await loadName();
  sb.auth.onAuthStateChange(async (evt, s) => {
    const changed = (s?.user?.id) !== me();
    session = s;
    if (changed) { await loadName(); route(); startUnread(); }
  });
  // Email links put login tokens in the address; clean them before routing
  if (isRecovery || /access_token|error=|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + (isRecovery ? "#/reset" : "#/"));
  window.addEventListener("hashchange", route);
  if (linkError) toast(decodeURIComponent(linkError[1].replace(/\+/g, " ")));
  route();
  startUnread();
})();

// Extra pages handled here so app1.js doesn't need editing
const baseRoute = route;
route = async function(){
  if (location.hash.startsWith("#/reset")) {
    if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
    return resetPassword();
  }
  try { return await baseRoute(); }
  finally { paintBadge(); }
};
