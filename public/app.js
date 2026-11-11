const API = "/api";
const $ = (s) => document.querySelector(s);
let token = localStorage.getItem("nexus_token") || "";
let currentUser = null;
let allEvents = [];
let authMode = "login";

function headers() { return token ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` } : { "Content-Type": "application/json" }; }
async function request(url, options = {}) {
  const res = await fetch(API + url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function dateLabel(value) {
  const d = new Date(value);
  return d.toLocaleString(undefined, { day:"numeric", month:"short", year:"numeric", hour:"numeric", minute:"2-digit" });
}
function openModal(mode) {
  authMode = mode; $("#authModal").classList.remove("hidden"); $("#authMessage").textContent = "";
  $("#modalTitle").textContent = mode === "login" ? "Sign in" : "Create account";
  $("#modalSubtitle").textContent = mode === "login" ? "Pick up where campus life happens." : "Your campus community starts here.";
  $("#authSubmit").textContent = mode === "login" ? "Sign in" : "Create account";
  $("#nameField").classList.toggle("hidden", mode === "login");
  $("#nameField input").required = mode === "register";
  $("#switchAuth").innerHTML = mode === "login" ? 'New here? <button type="button">Create an account</button>' : 'Already a member? <button type="button">Sign in</button>';
  $("#switchAuth button").onclick = () => openModal(mode === "login" ? "register" : "login");
}
function closeModal() { $("#authModal").classList.add("hidden"); }
function updateHeader() {
  const box = $("#topActions");
  if (!currentUser) {
    box.innerHTML = '<button class="btn btn-ghost" id="loginOpen">Sign in</button><button class="btn btn-primary" id="registerOpen">Join NEXUS</button>';
    $("#loginOpen").onclick = () => openModal("login"); $("#registerOpen").onclick = () => openModal("register");
  } else {
    box.innerHTML = `<span class="muted" style="align-self:center;margin-right:8px">Hi, ${escapeHTML(currentUser.name.split(" ")[0])}</span><a class="btn btn-ghost" href="#dashboard">My space</a>`;
  }
}
function renderEvents() {
  const query = $("#searchEvents").value.toLowerCase();
  const category = $("#categoryFilter").value;
  const rows = allEvents.filter(e => (category === "all" || e.category === category) && `${e.title} ${e.description} ${e.venue}`.toLowerCase().includes(query));
  $("#statEvents").textContent = allEvents.length.toString().padStart(2, "0");
  $("#eventGrid").innerHTML = rows.length ? rows.map(e => {
    const full = e.registeredCount >= e.capacity;
    return `<article class="event-card">
      <div class="event-top"><span class="tag">${escapeHTML(e.category)}</span><span class="event-date">${escapeHTML(new Date(e.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}))}</span></div>
      <h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.description || "A campus experience waiting to happen.")}</p>
      <div class="event-details"><span>⌖ ${escapeHTML(e.venue)}</span><span>◷ ${escapeHTML(dateLabel(e.date))}</span></div>
      <div class="event-footer"><span class="spots">${e.registeredCount}/${e.capacity} registered</span>
      ${currentUser?.role === "admin" ? `<button class="btn btn-ghost delete-event" data-id="${e.id}">Delete</button>` : currentUser ? `<button class="btn ${full ? "btn-ghost" : "btn-primary"} register-event" data-id="${e.id}" ${full ? "disabled" : ""}>${full ? "Full" : "Register"}</button>` : `<button class="btn btn-primary prompt-login">Sign in to join</button>`}</div>
    </article>`;
  }).join("") : '<div class="empty">No events match your search.</div>';
  document.querySelectorAll(".register-event").forEach(b => b.onclick = async () => {
    try { await request(`/events/${b.dataset.id}/register`, { method:"POST" }); toast("You're registered. See you there!"); await loadEvents(); await loadDashboard(); }
    catch(e) { toast(e.message); }
  });
  document.querySelectorAll(".delete-event").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this event and its registrations?")) return;
    try { await request(`/events/${b.dataset.id}`, { method:"DELETE" }); toast("Event deleted."); await loadEvents(); await loadDashboard(); }
    catch(e) { toast(e.message); }
  });
  document.querySelectorAll(".prompt-login").forEach(b => b.onclick = () => openModal("login"));
}
async function loadEvents() {
  try { allEvents = await request("/events"); renderEvents(); }
  catch(e) { $("#eventGrid").innerHTML = `<div class="empty">${escapeHTML(e.message)} Refresh the page to try again.</div>`; }
}
async function loadDashboard() {
  if (!currentUser) { $("#dashboard").classList.add("hidden"); return; }
  $("#dashboard").classList.remove("hidden");
  $("#welcomeText").textContent = `Signed in as ${currentUser.email}`;
  $("#dashTitle").textContent = currentUser.role === "admin" ? "Admin dashboard." : "Your campus space.";
  $("#adminPanel").classList.toggle("hidden", currentUser.role !== "admin");
  $("#adminStats").classList.toggle("hidden", currentUser.role !== "admin");
  $("#myListTitle").textContent = currentUser.role === "admin" ? "Recent registrations" : "My registrations";
  $("#myListSub").textContent = currentUser.role === "admin" ? "Students signed up across your events." : "Events you've signed up for.";
  if (currentUser.role === "admin") {
    const s = await request("/admin/overview");
    $("#adminStats").innerHTML = [["Students",s.students],["Events",s.events],["Registrations",s.registrations],["Upcoming",s.upcoming]].map(([k,v])=>`<div class="stat-card"><span>${k}</span><strong>${v}</strong></div>`).join("");
    const registrations = [];
    for (const event of allEvents) {
      const people = await request(`/admin/events/${event.id}/attendees`);
      people.forEach(p => registrations.push({ ...p, eventTitle:event.title }));
    }
    $("#myRegistrations").innerHTML = registrations.length ? registrations.map(r=>`<div class="registration-row"><div><b>${escapeHTML(r.name)}</b><small>${escapeHTML(r.email)} · ${escapeHTML(r.eventTitle)}</small></div><small>${dateLabel(r.registeredAt)}</small></div>`).join("") : '<p class="muted">No registrations yet.</p>';
  } else {
    const rows = await request("/my-registrations");
    $("#myRegistrations").innerHTML = rows.length ? rows.map(r=>`<div class="registration-row"><div><b>${escapeHTML(r.event.title)}</b><small>${escapeHTML(r.event.venue)} · ${dateLabel(r.event.date)}</small></div><span class="tag">Confirmed</span></div>`).join("") : '<p class="muted">You have not registered for an event yet.</p>';
  }
}
async function refreshUser() {
  if (!token) { currentUser = null; updateHeader(); return; }
  try { const data = await request("/me"); currentUser = data.user; }
  catch { token = ""; localStorage.removeItem("nexus_token"); currentUser = null; }
  updateHeader();
}
$("#loginOpen").onclick = () => openModal("login");
$("#registerOpen").onclick = () => openModal("register");
$("#modalClose").onclick = closeModal;
$("#authModal").onclick = e => { if (e.target.id === "authModal") closeModal(); };
$("#authForm").onsubmit = async e => {
  e.preventDefault(); $("#authMessage").textContent = "";
  const form = new FormData(e.currentTarget);
  const body = Object.fromEntries(form.entries());
  try {
    const data = await request(`/auth/${authMode}`, { method:"POST", body:JSON.stringify(body) });
    token = data.token; currentUser = data.user; localStorage.setItem("nexus_token", token);
    closeModal(); updateHeader(); await loadEvents(); await loadDashboard(); toast(authMode === "login" ? "Welcome back." : "Account created. Welcome to NEXUS.");
  } catch(err) { $("#authMessage").textContent = err.message; }
};
$("#logoutBtn").onclick = () => { token = ""; currentUser = null; localStorage.removeItem("nexus_token"); updateHeader(); loadEvents(); loadDashboard(); toast("Signed out."); };
$("#searchEvents").oninput = renderEvents;
$("#categoryFilter").onchange = renderEvents;
$("#eventForm").onsubmit = async e => {
  e.preventDefault(); const form = new FormData(e.currentTarget); const body = Object.fromEntries(form.entries());
  try { await request("/events", { method:"POST", body:JSON.stringify(body) }); document.getElementById("eventForm").reset(); toast("Event published."); await loadEvents(); await loadDashboard(); }
  catch(err) { toast(err.message); }
};
(async function init() { await refreshUser(); await loadEvents(); await loadDashboard(); })();
