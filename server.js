const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SECRET = process.env.SESSION_SECRET || "local-nexus-secret-change-before-deploying";

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], events: [], registrations: [] }, null, 2));

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { users: [], events: [], registrations: [] };
  }
}
function writeDB(db) {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_FILE);
}
function id() { return crypto.randomUUID(); }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 7 * 86400000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in first." });
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return res.status(401).json({ error: "Invalid session." });
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(sig, "base64url"); } catch { return res.status(401).json({ error: "Invalid session." }); }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return res.status(401).json({ error: "Invalid session." });
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return res.status(401).json({ error: "Invalid session." }); }
  if (data.exp < Date.now()) return res.status(401).json({ error: "Session expired. Please sign in again." });
  const user = readDB().users.find(u => u.id === data.id);
  if (!user) return res.status(401).json({ error: "Account not found." });
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}
function admin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function publicEvent(event) {
  const db = readDB();
  const count = db.registrations.filter(r => r.eventId === event.id).length;
  return { ...event, registeredCount: count };
}

function seed() {
  const db = readDB();
  if (!db.users.some(u => u.email === "admin@nexus.local")) {
    db.users.push({
      id: id(), name: "NEXUS Administrator", email: "admin@nexus.local",
      password: hashPassword("NexusAdmin@123"), role: "admin", createdAt: new Date().toISOString()
    });
  }
  if (!db.events.length) {
    const now = new Date();
    const future = (days) => { const d = new Date(now); d.setDate(d.getDate() + days); return d.toISOString(); };
    db.events.push(
      { id: id(), title: "Freshers' Welcome", category: "Campus", date: future(8), venue: "Main Auditorium", capacity: 180, description: "Meet your classmates, explore campus clubs and begin your college journey.", createdAt: now.toISOString() },
      { id: id(), title: "Code & Create Hackathon", category: "Technology", date: future(15), venue: "Computer Lab 2", capacity: 60, description: "Build a useful idea with a team, learn from mentors and present your prototype.", createdAt: now.toISOString() },
      { id: id(), title: "Anime & Art Evening", category: "Culture", date: future(22), venue: "Seminar Hall", capacity: 100, description: "A relaxed evening for anime fans, artists and creative communities.", createdAt: now.toISOString() }
    );
  }
  writeDB(db);
}
seed();

app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "NEXUS", node: process.version }));
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email and password are required." });
  if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const db = readDB();
  const normalized = String(email).trim().toLowerCase();
  if (db.users.some(u => u.email === normalized)) return res.status(409).json({ error: "An account with this email already exists." });
  const user = { id: id(), name: String(name).trim(), email: normalized, password: hashPassword(String(password)), role: "student", createdAt: new Date().toISOString() };
  db.users.push(user); writeDB(db);
  res.status(201).json({ token: makeToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = readDB().users.find(u => u.email === String(email || "").trim().toLowerCase());
  if (!user || !verifyPassword(String(password || ""), user.password)) return res.status(401).json({ error: "Incorrect email or password." });
  res.json({ token: makeToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

app.get("/api/events", (_req, res) => {
  const db = readDB();
  res.json(db.events.map(publicEvent).sort((a, b) => new Date(a.date) - new Date(b.date)));
});
app.post("/api/events", auth, admin, (req, res) => {
  const { title, category, date, venue, capacity, description } = req.body || {};
  if (!title || !date || !venue || !capacity) return res.status(400).json({ error: "Title, date, venue and capacity are required." });
  if (!Number.isFinite(Number(capacity)) || Number(capacity) < 1) return res.status(400).json({ error: "Capacity must be at least 1." });
  const event = { id: id(), title: String(title).trim(), category: category || "Campus", date: new Date(date).toISOString(), venue: String(venue).trim(), capacity: Number(capacity), description: description || "", createdAt: new Date().toISOString() };
  const db = readDB(); db.events.push(event); writeDB(db);
  res.status(201).json(publicEvent(event));
});
app.delete("/api/events/:id", auth, admin, (req, res) => {
  const db = readDB();
  const exists = db.events.some(e => e.id === req.params.id);
  if (!exists) return res.status(404).json({ error: "Event not found." });
  db.events = db.events.filter(e => e.id !== req.params.id);
  db.registrations = db.registrations.filter(r => r.eventId !== req.params.id);
  writeDB(db); res.json({ success: true });
});
app.post("/api/events/:id/register", auth, (req, res) => {
  const db = readDB();
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  if (req.user.role !== "student") return res.status(403).json({ error: "Only student accounts can register." });
  if (db.registrations.some(r => r.eventId === event.id && r.userId === req.user.id)) return res.status(409).json({ error: "You are already registered for this event." });
  const count = db.registrations.filter(r => r.eventId === event.id).length;
  if (count >= event.capacity) return res.status(409).json({ error: "This event is full." });
  db.registrations.push({ id: id(), eventId: event.id, userId: req.user.id, registeredAt: new Date().toISOString() });
  writeDB(db); res.status(201).json({ success: true, message: "Registration confirmed." });
});
app.get("/api/my-registrations", auth, (req, res) => {
  const db = readDB();
  const rows = db.registrations.filter(r => r.userId === req.user.id).map(r => ({ ...r, event: db.events.find(e => e.id === r.eventId) })).filter(r => r.event);
  res.json(rows);
});
app.get("/api/admin/overview", auth, admin, (_req, res) => {
  const db = readDB();
  res.json({
    students: db.users.filter(u => u.role === "student").length,
    events: db.events.length,
    registrations: db.registrations.length,
    upcoming: db.events.filter(e => new Date(e.date) >= new Date()).length
  });
});
app.get("/api/admin/events/:id/attendees", auth, admin, (req, res) => {
  const db = readDB();
  const rows = db.registrations.filter(r => r.eventId === req.params.id).map(r => {
    const user = db.users.find(u => u.id === r.userId);
    return user ? { name: user.name, email: user.email, registeredAt: r.registeredAt } : null;
  }).filter(Boolean);
  res.json(rows);
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => console.log(`NEXUS is running at http://localhost:${PORT} | Node ${process.version}`));
