// ===== Safety pack (app3.js): Terms consent, report user, block user =====
// Loaded after app1.js and app2.js. The database also enforces these rules.
let termsOk = null, myBlocks = new Set(), safetyReady = Promise.resolve();
(function(){
  const st = document.createElement("style");
  st.textContent = `.safety{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.safety .btn{padding:8px 14px;font-size:14px}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:20;padding:16px}
.modal .panel{max-width:440px;width:100%}
.tick{display:flex;gap:10px;align-items:flex-start;font-weight:400;font-size:14px}
.tick input{width:auto;margin-top:3px;flex:none}`;
  document.head.appendChild(st);
})();

// ----- Load this user's Terms status and block list -----
async function loadSafety(){
  termsOk = null; myBlocks = new Set();
  if (!me()) return;
  const [p, b] = await Promise.all([
    sb.from("profiles").select("terms_accepted_at").eq("id", me()).maybeSingle(),
    sb.from("blocks").select("blocked_id")
  ]);
  termsOk = !!p.data?.terms_accepted_at;
  (b.data || []).forEach(r => myBlocks.add(r.blocked_id));
  // Ticked the box at sign-up on this device? Record it now that they're signed in.
  if (!termsOk) {
    let ticked = null; try { ticked = localStorage.getItem("kaki_terms_ticked"); } catch (e) {}
    if (ticked && ticked === (session?.user?.email || "").toLowerCase()) await acceptTerms();
  }
}
async function acceptTerms(){
  const { error } = await sb.rpc("accept_terms");
  if (!error) { termsOk = true; try { localStorage.removeItem("kaki_terms_ticked"); } catch (e) {} }
  return !error;
}
// Reload whenever the signed-in user changes (app2's startUnread runs at start and on login/logout)
const _startUnread = startUnread;
startUnread = function(){ _startUnread(); safetyReady = loadSafety().catch(() => {}); };

// ----- Terms prompt for users who haven't agreed yet -----
function termsModal(){
  return new Promise(done => {
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<div class="panel stack" role="dialog" aria-modal="true">
      <h2>Before you post or chat</h2>
      <p class="small">Please agree to KakiMart's <a href="terms.html">Terms of Use</a> and <a href="privacy.html">Privacy Policy</a>. In short: no sexual, violent, hateful or illegal content, no scams, and no prohibited items.</p>
      <label class="tick"><input type="checkbox" id="tk"><span>I am 18 or older and I agree to the Terms of Use and Privacy Policy</span></label>
      <p class="err" id="tke"></p>
      <div class="row"><button class="btn ghost" id="tkn">Cancel</button><button class="btn" id="tky">Agree</button></div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector("#tkn").onclick = () => { m.remove(); done(false); };
    m.querySelector("#tky").onclick = async e => {
      if (!m.querySelector("#tk").checked) { m.querySelector("#tke").textContent = "Please tick the box to continue."; return; }
      busy(e.target, true);
      const ok = await acceptTerms();
      m.remove();
      if (!ok) toast("Couldn't save. Please try again.");
      done(ok);
    };
  });
}
// true = OK to continue
async function ensureTerms(){
  await safetyReady;
  if (termsOk === null) await loadSafety().catch(() => {});
  return termsOk ? true : await termsModal();
}
// Stop posting a listing or sending a message until Terms are agreed
document.addEventListener("submit", async e => {
  const f = e.target;
  if (!me() || termsOk || !(f.id === "nf" || f.id === "cf")) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (await ensureTerms()) f.requestSubmit();
}, true);
// Same for "Message seller"
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("#msg");
  if (!b || !me() || termsOk) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (await ensureTerms()) b.click();
}, true);

// ----- Report and block, from inside a chat -----
async function addChatSafety(){
  const id = (/^#\/chat\/([0-9a-f-]+)/.exec(location.hash) || [])[1];
  const ch = document.getElementById("ch");
  if (!id || !ch || document.getElementById("safety")) return;
  const bar = document.createElement("div"); bar.className = "safety"; bar.id = "safety";
  ch.before(bar);
  await safetyReady;
  const { data: c } = await sb.from("conversations").select("buyer_id,seller_id").eq("id", id).maybeSingle();
  const other = c && (c.buyer_id === me() ? c.seller_id : c.buyer_id);
  if (!other) { bar.remove(); return; }
  const draw = () => {
    const blocked = myBlocks.has(other);
    bar.innerHTML = `<button class="btn ghost" id="rpu">Report user</button><button class="btn ghost" id="blu">${blocked ? "Unblock user" : "Block user"}</button>`;
    bar.querySelector("#rpu").onclick = () => reportUser(id);
    bar.querySelector("#blu").onclick = () => blocked ? unblockUser(other, draw) : blockUser(other, id);
  };
  draw();
}
async function reportUser(convId){
  const reason = prompt("Why are you reporting this user? (e.g. scam, harassment, offensive messages or photos)");
  if (!reason || !reason.trim()) return;
  const { error } = await sb.from("reports").insert({ conversation_id: convId, reason: reason.trim().slice(0, 500) });
  toast(error ? error.message : "Report sent. Thanks, we'll review it.");
}
async function blockUser(other, convId){
  if (!confirm("Block this user? Neither of you will be able to message the other, and this chat will be hidden. You can unblock them from the Me page.")) return;
  const { error } = await sb.from("blocks").insert({ blocked_id: other });
  if (error && error.code !== "23505") { toast(error.message); return; }
  myBlocks.add(other);
  await sb.rpc("mark_conversation_read", { conv_id: convId });
  refreshUnread();
  toast("User blocked");
  location.hash = "#/inbox";
}
async function unblockUser(other, after){
  const { error } = await sb.from("blocks").delete().eq("blocked_id", other);
  if (error) { toast(error.message); return; }
  myBlocks.delete(other);
  toast("User unblocked");
  if (after) after();
}

// ----- Hide chats with blocked users from the chat list -----
async function hideBlockedChats(){
  await safetyReady;
  if (!myBlocks.size) return;
  const { data } = await sb.from("conversations").select("id,buyer_id,seller_id");
  (data || []).forEach(c => {
    const other = c.buyer_id === me() ? c.seller_id : c.buyer_id;
    if (myBlocks.has(other)) app.querySelector(`a[href="#/chat/${c.id}"]`)?.remove();
  });
}

// ----- Me page: Terms link and blocked users -----
async function addMeExtras(){
  const da = document.getElementById("da");
  if (!da || document.getElementById("blk")) return;
  const priv = da.parentElement.querySelector('a[href="privacy.html"]');
  if (priv && !document.getElementById("tlink")) priv.insertAdjacentHTML("afterend", ` · <a id="tlink" href="terms.html">Terms of Use</a>`);
  const box = document.createElement("div"); box.id = "blk"; box.className = "panel"; box.style.marginTop = "16px";
  da.parentElement.after(box);
  await safetyReady;
  if (!myBlocks.size) { box.innerHTML = `<h2>Blocked users</h2><p class="small muted">You haven't blocked anyone.</p>`; return; }
  const ids = [...myBlocks];
  const { data } = await sb.from("profiles").select("id,display_name").in("id", ids);
  const names = Object.fromEntries((data || []).map(p => [p.id, p.display_name]));
  box.innerHTML = `<h2>Blocked users</h2>` + ids.map(id =>
    `<div class="row" style="justify-content:space-between;margin-top:8px"><span>${esc(names[id] || "Deleted user")}</span><button class="btn ghost" data-ub="${esc(id)}">Unblock</button></div>`).join("");
  box.querySelectorAll("[data-ub]").forEach(b => b.onclick = () => unblockUser(b.dataset.ub, () => { box.remove(); addMeExtras(); }));
}

// ----- Sign-up: required agreement tick box -----
function addSignupTick(){
  const lf = document.getElementById("lf"), dn = document.getElementById("dn");
  if (!lf || !dn || document.getElementById("agree")) return;
  const lab = document.createElement("label"); lab.className = "tick";
  lab.innerHTML = `<input type="checkbox" id="agree" required><span>I am 18 or older and I agree to the <a href="terms.html">Terms of Use</a> and <a href="privacy.html">Privacy Policy</a></span>`;
  document.getElementById("go").before(lab);
  app.querySelectorAll("p.small.muted").forEach(p => { if (p.textContent.startsWith("By creating an account")) p.remove(); });
  lf.addEventListener("submit", () => {
    try { localStorage.setItem("kaki_terms_ticked", document.getElementById("em").value.trim().toLowerCase()); } catch (e) {}
  }, true);
}

// ----- Apply the extras whenever a page is drawn -----
function enhance(){
  addSignupTick();
  if (!me()) return;
  addMeExtras();
  addChatSafety();
  if (location.hash.startsWith("#/inbox")) hideBlockedChats();
}
new MutationObserver(enhance).observe(app, { childList: true });
