/* ============================================================
   Nature Club – E-Certificate Portal
   Aurora Higher Education and Research Academy, Bhongir Campus
   Common backend for Phase 1 (Admin) + Phase 2 (Student Portal)
   ============================================================ */
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const XLSX = require("xlsx");
const JSZip = require("jszip");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { row, all, run, uid, UPLOAD_DIR } = require("./db");
const { certCSS, renderCertHTML, generatePDF } = require("./certgen");

const app = express();
const PORT = process.env.PORT || 3100;         // 3100: 3000 is used by another local project
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const SESSION_HOURS = 12;

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

/* ---------------- static pages ---------------- */
const P = (f) => path.join(__dirname, "public", f);
const send = (file) => (req, res) => res.sendFile(P(file));
app.get("/", send("landing.html"));
app.get("/admin", send("admin.html"));
app.use("/data-uploads", express.static(UPLOAD_DIR, { fallthrough: false }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/verify/:token", send("verify.html"));
app.get("/portal/:token", (req, res) =>
  res.send(portalHTML().replace(/__TOKEN__/g, JSON.stringify(req.params.token))));

/* ---------------- tiny rate limiter ---------------- */
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > b.resetAt) { b.count = 0; b.resetAt = now + windowMs; }
  b.count++;
  buckets.set(key, b);
  return b.count <= max;
}
const ip = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";

/* ---------------- admin auth ---------------- */
function parseCookies(req) {
  const h = req.headers.cookie || "";
  return Object.fromEntries(h.split(";").map((c) => c.trim().split("=")).filter((a) => a[0]));
}
function requireAdmin(req, res, next) {
  const tok = parseCookies(req).admsess;
  if (!tok) return res.status(401).json({ error: "Not logged in" });
  const s = row("SELECT * FROM sessions WHERE token = ?", tok);
  if (!s || new Date(s.expires_at) < new Date()) {
    if (s) run("DELETE FROM sessions WHERE token = ?", tok);
    return res.status(401).json({ error: "Session expired, please login again" });
  }
  next();
}
function newSession(adminId, res) {
  const tok = uid(32);
  run("INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', ?))",
      tok, adminId, `+${SESSION_HOURS} hours`);
  res.setHeader("Set-Cookie", `admsess=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`);
}

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!rateLimit(`login:${ip(req)}`, 10, 15 * 60_000))
    return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  const a = row("SELECT * FROM admins WHERE username = ?", String(username).trim());
  if (!a || !bcrypt.compareSync(String(password), a.password_hash))
    return res.status(401).json({ error: "Invalid username or password" });
  newSession(a.id, res);
  res.json({ ok: true, username: a.username });
});

app.post("/api/admin/logout", (req, res) => {
  const tok = parseCookies(req).admsess;
  if (tok) run("DELETE FROM sessions WHERE token = ?", tok);
  res.setHeader("Set-Cookie", "admsess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  const tok = parseCookies(req).admsess;
  const s = row("SELECT a.username FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = ?", tok);
  res.json({ username: s.username });
});

/* small helper for the password route */
function rowAdminName(tok) {
  const s = row("SELECT a.username FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token=?", tok);
  return s ? s.username : "";
}

app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const tok = parseCookies(req).admsess;
  const username = rowAdminName(tok);
  const { current, next } = req.body || {};
  if (!rateLimit(`pw:${ip(req)}`, 5, 10 * 60_000)) return res.status(429).json({ error: "Too many attempts, wait a few minutes." });
  if (!current || !next) return res.status(400).json({ error: "Both fields required" });
  if (String(next).length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
  const a = row("SELECT * FROM admins WHERE username = ?", username);
  if (!a || !bcrypt.compareSync(String(current), a.password_hash))
    return res.status(401).json({ error: "Current password is incorrect" });
  run("UPDATE admins SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", bcrypt.hashSync(String(next), 10), a.id);
  res.json({ ok: true });
});

/* ---------------- dashboard stats ---------------- */
app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const n = (sql, ...p) => (row(sql, ...p) || {}).n || 0;
  res.json({
    students: n("SELECT COUNT(*) n FROM students"),
    certificates: n("SELECT COUNT(*) n FROM certificates"),
    participation: n("SELECT COUNT(*) n FROM certificates WHERE category = 'Participation'"),
    winners: n("SELECT COUNT(*) n FROM certificates WHERE category != 'Participation'"),
    downloaded: n("SELECT COUNT(DISTINCT cert_id) n FROM download_logs"),
    published: n("SELECT COUNT(*) n FROM certificates WHERE status = 'published'")
  });
});

/* ---------------- events ---------------- */
const EVENT_COLS = ["title", "event_date", "organiser", "category", "institute", "motto", "issued_line", "cert_prefix", "heading", "intro", "portal_active"];

function publicEvent(e) {
  return e; // admin sees all
}

app.get("/api/admin/events", requireAdmin, (req, res) => {
  const events = all("SELECT * FROM events ORDER BY id DESC").map((e) => ({
    ...publicEvent(e),
    students_count: (row("SELECT COUNT(*) n FROM students WHERE event_id = ?", e.id) || {}).n || 0,
    certs_published: (row("SELECT COUNT(*) n FROM certificates WHERE event_id = ? AND status='published'", e.id) || {}).n || 0,
    portal_url: e.portal_token ? `${BASE}/portal/${e.portal_token}` : null
  }));
  res.json({ events });
});

app.post("/api/admin/events", requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.event_date || !b.organiser) return res.status(400).json({ error: "Title, date and organiser are required" });
  const info = run(`INSERT INTO events (title, event_date, organiser, category, institute, motto, issued_line, cert_prefix, portal_token, portal_active)
                    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    String(b.title).trim(), String(b.event_date).trim(), String(b.organiser).trim(),
    b.category || "Participation", b.institute || "Aurora Higher Education and Research Academy – Bhongir Campus",
    b.motto || "Think Green • Play Smart • Save Earth", b.issued_line || "", b.cert_prefix || "EG", uid(12), b.portal_active ? 1 : 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put("/api/admin/events/:id", requireAdmin, (req, res) => {
  const e = row("SELECT * FROM events WHERE id = ?", req.params.id);
  if (!e) return res.status(404).json({ error: "Event not found" });
  const b = req.body || {};
  const set = EVENT_COLS.filter((k) => k in b).map((k) => `${k} = ?`);
  const vals = EVENT_COLS.filter((k) => k in b).map((k) => {
    let v = b[k];
    if (k === "portal_active") v = v ? 1 : 0;
    else if (k === "portal_token") v = uid(12);
    return String(v);
  });
  if (set.length) run(`UPDATE events SET ${set.join(", ")} WHERE id = ?`, ...vals, e.id);
  res.json({ ok: true });
});

app.post("/api/admin/events/:id/regenerate-portal-token", requireAdmin, (req, res) => {
  run("UPDATE events SET portal_token = ? WHERE id = ?", uid(12), req.params.id);
  res.json({ ok: true, message: "Portal link regenerated — old QR stops working" });
});

/* uploads: logo / signatures */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp|svg\+xml)$/i.test(file.mimetype))
});
const ASSET_KEYS = { logo: "logo_path", sig1: "sig1_path", sig2: "sig2_path" };

app.post("/api/admin/events/:id/assets", requireAdmin, upload.single("file"), (req, res) => {
  const key = req.body.key;
  if (!ASSET_KEYS[key]) return res.status(400).json({ error: "key must be logo | sig1 | sig2" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const e = row("SELECT * FROM events WHERE id = ?", req.params.id);
  if (!e) return res.status(404).json({ error: "Event not found" });
  const ext = (path.extname(req.file.originalname) || ".png").toLowerCase().slice(0, 8);
  const fname = `event${e.id}_${key}_${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), req.file.buffer);
  run(`UPDATE events SET ${ASSET_KEYS[key]} = ? WHERE id = ?`, fname, e.id);
  res.json({ ok: true, path: fname });
});

app.delete("/api/admin/events/:id/assets/:key", requireAdmin, (req, res) => {
  const key = ASSET_KEYS[req.params.key];
  const e = row(`SELECT id, ${req.params.key === "logo" ? "logo_path" : req.params.key === "sig1" ? "sig1_path" : "sig2_path"} p FROM events WHERE id = ?`, req.params.id);
  if (!e || !e.p) return res.status(404).json({ error: "Nothing to remove" });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, e.p)); } catch {}
  run(`UPDATE events SET ${key} = NULL WHERE id = ?`, req.params.id);
  res.json({ ok: true });
});

/* ---------------- students ---------------- */
app.get("/api/admin/events/:id/students", requireAdmin, (req, res) => {
  const q = (req.query.q || "").trim();
  let rows;
  const selectCols = `s.id, s.name, s.roll_number, s.department, s.year, s.email, s.phone, s.date, s.created_at,
                      c.id cert_id, c.category cert_category, c.status cert_status, c.token cert_token, c.cert_uid, c.issue_date`;
  if (q) {
    rows = all(`SELECT ${selectCols}
                FROM students s LEFT JOIN certificates c ON c.student_id = s.id AND c.event_id = s.event_id
                WHERE s.event_id = ? AND (s.name LIKE ? OR s.roll_number LIKE ? OR s.department LIKE ? OR s.email LIKE ?)
                ORDER BY s.name`, req.params.id, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = all(`SELECT ${selectCols}
                FROM students s LEFT JOIN certificates c ON c.student_id = s.id AND c.event_id = s.event_id
                WHERE s.event_id = ? ORDER BY s.name`, req.params.id);
  }
  const total = (row("SELECT COUNT(*) n FROM students WHERE event_id = ?", req.params.id) || {}).n || 0;
  res.json({ students: rows, total });
});

/* Create student with all demographic & date fields */
app.post("/api/admin/events/:id/students", requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.roll_number) return res.status(400).json({ error: "Name and Roll Number are required" });
  const e = row("SELECT id FROM events WHERE id = ?", req.params.id);
  if (!e) return res.status(404).json({ error: "Event not found" });
  try {
    const info = run(
      "INSERT INTO students (event_id, name, roll_number, department, year, email, phone, date) VALUES (?,?,?,?,?,?,?,?)",
      e.id,
      String(b.name).trim(),
      String(b.roll_number).trim(),
      (b.department || "").trim(),
      (b.year || "").trim(),
      (b.email || "").trim(),
      (b.phone || "").trim(),
      (b.date || "").trim()
    );
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) return res.status(409).json({ error: "Roll number already registered for this event" });
    throw err;
  }
});

/* Update student with all fields */
app.put("/api/admin/students/:id", requireAdmin, (req, res) => {
  const s = row("SELECT * FROM students WHERE id = ?", req.params.id);
  if (!s) return res.status(404).json({ error: "Student not found" });
  const b = req.body || {};
  const F = ["name", "roll_number", "department", "year", "email", "phone", "date"];
  const updates = F.filter((k) => k in b);
  if (!updates.length) return res.json({ ok: true });
  if (!String(b.name || s.name).trim() || !String(b.roll_number || s.roll_number).trim())
    return res.status(400).json({ error: "Name and roll number cannot be empty" });
  try {
    run(`UPDATE students SET ${updates.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      ...updates.map((k) => String(b[k] ?? "").trim()), s.id);
    res.json({ ok: true });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) return res.status(409).json({ error: "Roll number already used by another student" });
    throw err;
  }
});

app.delete("/api/admin/students/:id", requireAdmin, (req, res) => {
  run("DELETE FROM students WHERE id = ?", req.params.id);
  res.json({ ok: true });
});

/* Excel / CSV import — stores all data & dates of all students */
app.post("/api/admin/events/:id/students/import", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Upload an .xlsx or .csv file" });
  const e = row("SELECT id, event_date FROM events WHERE id = ?", req.params.id);
  if (!e) return res.status(404).json({ error: "Event not found" });
  let table;
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer", raw: false });
    table = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
  } catch (err) {
    return res.status(400).json({ error: "Could not read the file. Use .xlsx or .csv with a header row." });
  }
  const keyOf = (h) => {
    const k = String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^(student)?name|fullname|candidate/.test(k)) return "name";
    if (/roll|reg|htno|hallticket|studentid|regno/.test(k)) return "roll_number";
    if (/dept|department|branch|course|stream|specialization/.test(k)) return "department";
    if (/year|sem|semester|class|batch/.test(k)) return "year";
    if (/email|mail|emailid/.test(k)) return "email";
    if (/phone|mobile|contact|cell|whatsapp/.test(k)) return "phone";
    if (/date|eventdate|issuedate|registereddate/.test(k)) return "date";
    if (/award|category|certificate|prize|position|rank/.test(k)) return "award";
    return null;
  };
  let added = 0, skipped = 0, updated = 0;
  for (const r of table) {
    const st = {};
    for (const [h, v] of Object.entries(r)) { const k = keyOf(h); if (k) st[k] = String(v ?? "").trim(); }
    if (!st.name || !st.roll_number) { skipped++; continue; }
    let sid;
    const existing = row("SELECT id FROM students WHERE event_id = ? AND roll_number = ?", e.id, st.roll_number);
    if (existing) {
      sid = existing.id;
      run(`UPDATE students SET name = ?, department = COALESCE(NULLIF(?,''), department),
                               year = COALESCE(NULLIF(?,''), year), email = COALESCE(NULLIF(?,''), email),
                               phone = COALESCE(NULLIF(?,''), phone), date = COALESCE(NULLIF(?,''), date)
           WHERE id = ?`,
        st.name, st.department || "", st.year || "", st.email || "", st.phone || "", st.date || "", sid);
      updated++;
    } else {
      try {
        const info = run(
          "INSERT INTO students (event_id, name, roll_number, department, year, email, phone, date) VALUES (?,?,?,?,?,?,?,?)",
          e.id, st.name, st.roll_number, st.department || "", st.year || "", st.email || "", st.phone || "", st.date || ""
        );
        sid = info.lastInsertRowid;
        added++;
      } catch {
        skipped++;
        continue;
      }
    }
    if (st.award) {
      const cat = NORMALISE.get(st.award.toLowerCase()) || null;
      if (cat) createCertificate(e.id, sid, cat, st.date);
    }
  }
  res.json({ ok: true, added, updated, skipped, total: added + updated + skipped });
});
const NORMALISE = new Map([
  ["first prize", "First Prize"], ["first", "First Prize"], ["1st", "First Prize"], ["winner", "First Prize"],
  ["second prize", "Second Prize"], ["second", "Second Prize"], ["2nd", "Second Prize"],
  ["third prize", "Third Prize"], ["third", "Third Prize"], ["3rd", "Third Prize"],
  ["participation", "Participation"], ["participant", "Participation"]
]);

/* ---------------- certificates ---------------- */
function nextCertUid(event) {
  const prefix = event.cert_prefix || "CERT";
  const rowsFound = all(`SELECT cert_uid FROM certificates WHERE event_id = ?`, event.id);
  let max = 0;
  for (const r of rowsFound) {
    const m = String(r.cert_uid).match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function createCertificate(eventId, studentId, category, issueDate = null) {
  const event = row("SELECT * FROM events WHERE id = ?", eventId);
  const cat = NORMALISE.get(String(category).toLowerCase()) || category;
  const existing = row("SELECT id FROM certificates WHERE student_id = ? AND event_id = ?", studentId, eventId);
  const stu = row("SELECT date FROM students WHERE id = ?", studentId);
  const dateVal = issueDate || stu?.date || event?.event_date || "";
  if (existing) {
    run("UPDATE certificates SET category = ?, issue_date = ? WHERE id = ?", cat, dateVal, existing.id);
    return existing.id;
  }
  const info = run("INSERT INTO certificates (token, cert_uid, student_id, event_id, category, issue_date) VALUES (?,?,?,?,?,?)",
    uid(18), nextCertUid(event), studentId, eventId, cat, dateVal);
  return info.lastInsertRowid;
}

app.get("/api/admin/events/:id/certificates", requireAdmin, (req, res) => {
  const rowsFound = all(`SELECT c.*, s.name, s.roll_number, s.department, s.year, s.email, s.phone, s.date student_date
                         FROM certificates c JOIN students s ON s.id = c.student_id
                         WHERE c.event_id = ? ORDER BY c.id`, req.params.id);
  res.json({ certificates: rowsFound });
});

app.post("/api/admin/events/:id/certificates", requireAdmin, (req, res) => {
  const { student_ids, category } = req.body || {};
  const ids = [...new Set((student_ids || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return res.status(400).json({ error: "Select at least one student" });
  if (!NORMALISE.get(String(category).toLowerCase()) && !Object.keys(require("./certgen").ACFG).includes(category))
    return res.status(400).json({ error: "Invalid category" });
  let created = 0;
  for (const sid of ids) { createCertificate(req.params.id, sid, category); created++; }
  res.json({ ok: true, count: created });
});

app.put("/api/admin/certificates/:id", requireAdmin, (req, res) => {
  const c = row("SELECT * FROM certificates WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ error: "Certificate not found" });
  const { category } = req.body || {};
  const cat = NORMALISE.get(String(category).toLowerCase());
  if (!cat) return res.status(400).json({ error: "Invalid category" });
  run("UPDATE certificates SET category = ? WHERE id = ?", cat, c.id);
  res.json({ ok: true });
});

app.post("/api/admin/certificates/status", requireAdmin, (req, res) => {
  const { ids: rawIds, status } = req.body || {};
  const ids = [...new Set((rawIds || []).map(Number).filter(Number.isInteger))];
  if (!["approved", "published", "draft"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "No certificates selected" });
  const ph = ids.map(() => "?").join(",");
  if (status === "published") {
    const notApproved = all(`SELECT id, cert_uid FROM certificates WHERE id IN (${ph}) AND status != 'approved'`, ...ids);
    if (notApproved.length)
      return res.status(400).json({ error: `Approve first: ${notApproved.map((r) => r.cert_uid).join(", ")}` });
    run(`UPDATE certificates SET status='published', published_at=datetime('now') WHERE id IN (${ph})`, ...ids);
  } else {
    run(`UPDATE certificates SET status = ? WHERE id IN (${ph})`, status, ...ids);
  }
  res.json({ ok: true });
});

app.delete("/api/admin/certificates/:id", requireAdmin, (req, res) => {
  run("DELETE FROM certificates WHERE id = ? AND status != 'published'", req.params.id);
  res.json({ ok: true });
});

/* ---------------- certificate rendering helpers ---------------- */
function fileToDataURL(f) {
  if (!f) return null;
  const p = path.join(UPLOAD_DIR, f);
  if (!fs.existsSync(p)) return null;
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".svg" ? "image/svg+xml" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

async function buildCertData(cert, student) {
  const event = row("SELECT * FROM events WHERE id = ?", cert.event_id);
  const verifyUrl = `${BASE}/verify/${cert.token}`;
  return {
    certUid: cert.cert_uid,
    category: cert.category,
    student,
    event,
    logo: fileToDataURL(event.logo_path),
    sig1: fileToDataURL(event.sig1_path),
    sig2: fileToDataURL(event.sig2_path),
    qr: await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220, color: { dark: "#134d2c" } })
  };
}

function certPage(inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate</title><style>${certCSS()}</style></head><body>${inner}</body></html>`;
}

/* admin preview (single or all drafts) */
app.get("/api/admin/certificates/:id/preview", requireAdmin, async (req, res) => {
  const c = row("SELECT * FROM certificates WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ error: "Not found" });
  const s = row("SELECT * FROM students WHERE id = ?", c.student_id);
  const d = await buildCertData(c, s);
  res.send(certPage(renderCertHTML(d)));
});

app.get("/api/admin/events/:id/preview-all", requireAdmin, async (req, res) => {
  const certs = all("SELECT * FROM certificates WHERE event_id = ? ORDER BY cert_uid", req.params.id);
  const parts = [];
  for (const c of certs) {
    const s = row("SELECT * FROM students WHERE id = ?", c.student_id);
    parts.push(renderCertHTML(await buildCertData(c, s)));
  }
  res.send(certPage(parts.join("\n")));
});

/* PDF for a certificate (admin download + student download) */
async function certPDF(cert, student) {
  const d = await buildCertData(cert, student);
  d.qrBuf = await QRCode.toBuffer(`${BASE}/verify/${cert.token}`, { margin: 1, width: 320, color: { dark: "#134d2c" } });
  d.logoBuf = eventFile(cert.event_id, "logo_path");
  d.sig1Buf = eventFile(cert.event_id, "sig1_path");
  d.sig2Buf = eventFile(cert.event_id, "sig2_path");
  return generatePDF(d);
}
function eventFile(eventId, col) {
  const e = row(`SELECT ${col} f FROM events WHERE id = ?`, eventId);
  if (!e || !e.f) return null;
  const p = path.join(UPLOAD_DIR, e.f);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

app.get("/api/admin/certificates/:id/pdf", requireAdmin, async (req, res) => {
  const c = row("SELECT * FROM certificates WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ error: "Not found" });
  const s = row("SELECT * FROM students WHERE id = ?", c.student_id);
  const buf = await certPDF(c, s);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Certificate_${fileSafe(s.name)}.pdf"`);
  res.send(buf);
});

/* ZIP export (published certs) */
app.get("/api/admin/events/:id/zip", requireAdmin, async (req, res) => {
  const certs = all(`SELECT c.*, s.name FROM certificates c JOIN students s ON s.id = c.student_id
                     WHERE c.event_id = ? AND c.status = 'published' ORDER BY c.cert_uid`, req.params.id);
  if (!certs.length) return res.status(400).json({ error: "No published certificates yet" });
  const zip = new JSZip();
  const summary = ["Certificate UID,Student Name,Roll Number,Category,Status"];
  for (const c of certs) {
    const s = { name: c.name, roll_number: c.roll_number, department: c.department, year: c.year };
    zip.file(`Certificate_${fileSafe(c.name)}_${c.cert_uid}.pdf`, await certPDF(c, s));
    summary.push([c.cert_uid, c.name, c.roll_number, c.category, c.status].join(","));
  }
  zip.file("certificate_list.csv", summary.join("\n"));
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="ecertificates_event${req.params.id}.zip"`);
  res.send(buf);
});
const fileSafe = (n) => String(n || "student").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "student";

/* ---------------- shared portal QR (admin) ---------------- */
app.get("/api/admin/events/:id/portal-qr", requireAdmin, async (req, res) => {
  const e = row("SELECT * FROM events WHERE id = ?", req.params.id);
  if (!e?.portal_token) return res.status(404).json({ error: "No portal token" });
  const url = `${BASE}/portal/${e.portal_token}`;
  const buf = await QRCode.toBuffer(url, { margin: 2, width: 500, color: { dark: "#134d2c" } });
  res.setHeader("Content-Type", "image/png");
  res.send(buf);
});

/* student landing: list active portals (public info only) */
app.get("/api/portal/list-active", (req, res) => {
  const events = all("SELECT portal_token AS token, title, event_date FROM events WHERE portal_active = 1 AND is_active = 1 ORDER BY event_date DESC LIMIT 5");
  res.json({ active: events });
});

/* ============================================================
   PHASE 2 — STUDENT PORTAL (public, no login)
   ============================================================ */
function getEventByToken(tok) { return row("SELECT * FROM events WHERE portal_token = ? AND portal_active = 1", tok); }

app.get("/api/portal/:token", (req, res) => {
  if (!rateLimit(`portal:${ip(req)}`, 60, 60_000)) return res.status(429).json({ error: "Too many requests, slow down." });
  const e = getEventByToken(req.params.token);
  if (!e) return res.status(403).json({ error: "This certificate portal is not active. Contact the Nature Club office." });
  res.json({ ok: true, event: { id: e.id, title: e.title, event_date: e.event_date, organiser: e.organiser, institute: e.institute, motto: e.motto } });
});

/* search published students only — never exposes email */
app.get("/api/portal/:token/search", (req, res) => {
  if (!rateLimit(`search:${ip(req)}`, 20, 60_000)) return res.status(429).json({ error: "Too many searches. Please wait a minute." });
  const e = getEventByToken(req.params.token);
  if (!e) return res.status(403).json({ error: "Portal not active" });
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: [] });
  const results = all(`
    SELECT DISTINCT s.id, s.name, s.roll_number, s.year
    FROM students s JOIN certificates c ON c.student_id = s.id AND c.event_id = s.event_id
    WHERE s.event_id = ? AND c.status = 'published' AND (s.name LIKE ? OR s.roll_number LIKE ?)
    ORDER BY s.name LIMIT 12`, e.id, `%${q}%`, `%${q}%`);
  res.json({ results });   // fields are safe: no email, no token
});

/* confirm a selection: student id + published cert -> category & token (no email, no other data) */
app.get("/api/portal/:token/certinfo/:studentId", (req, res) => {
  if (!rateLimit(`cert:${ip(req)}`, 30, 60_000)) return res.status(429).json({ error: "Too many requests. Please wait." });
  const e = getEventByToken(req.params.token);
  if (!e) return res.status(403).json({ error: "Portal not active" });
  const c = row(`SELECT c.token, c.category FROM certificates c
                 WHERE c.student_id = ? AND c.event_id = ? AND c.status = 'published'`, req.params.studentId, e.id);
  if (!c) return res.status(404).json({ error: "No published certificate for this student" });
  res.json({ ok: true, category: c.category, token: c.token });
});

/* selection confirmation -> certificate preview data */
app.get("/api/portal/:token/cert/:certToken", (req, res) => {
  if (!rateLimit(`cert:${ip(req)}`, 30, 60_000)) return res.status(429).json({ error: "Too many requests. Please wait." });
  const e = getEventByToken(req.params.token);
  if (!e) return res.status(403).json({ error: "Portal not active" });
  const c = row(`SELECT c.*, s.name, s.roll_number, s.year
                 FROM certificates c JOIN students s ON s.id = c.student_id
                 WHERE c.token = ? AND c.event_id = ? AND c.status = 'published'`, req.params.certToken, e.id);
  if (!c) return res.status(404).json({ error: "Published certificate not found. Contact the club if your name is missing." });
  res.json({
    ok: true,
    certificate: {
      cert_uid: c.cert_uid, category: c.category, name: c.name, roll_number: c.roll_number,
      year: c.year, event_title: e.title, event_date: e.event_date, institute: e.institute
    }
  });
});

/* certificate preview page (HTML, published only) */
app.get("/api/portal/:token/preview/:certToken", (req, res) => {
  const e = getEventByToken(req.params.token);
  if (!e) return res.status(403).send("Portal not active");
  if (!rateLimit(`cert:${ip(req)}`, 30, 60_000)) return res.status(429).send("Too many requests");
  const c = row(`SELECT * FROM certificates WHERE token = ? AND event_id = ? AND status='published'`, req.params.certToken, e.id);
  if (!c) return res.status(404).send("Certificate not available");
  const s = row("SELECT * FROM students WHERE id = ?", c.student_id);
  buildCertData(c, s).then((d) => res.send(certPage(renderCertHTML(d))));
});

/* download PDF (published only, logged) */
app.get("/api/portal/:token/download/:certToken", async (req, res) => {
  if (!rateLimit(`dl:${ip(req)}`, 15, 60_000)) return res.status(429).json({ error: "Too many downloads. Please wait a minute." });
  const e = getEventByToken(req.params.token);
  if (!e) return res.status(403).json({ error: "Portal not active" });
  const c = row(`SELECT * FROM certificates WHERE token = ? AND event_id = ? AND status='published'`, req.params.certToken, e.id);
  if (!c) return res.status(404).json({ error: "Certificate not available" });
  const s = row("SELECT * FROM students WHERE id = ?", c.student_id);
  const buf = await certPDF(c, s);
  run("INSERT INTO download_logs (cert_id, ip, user_agent) VALUES (?,?,?)", c.id, ip(req), (req.headers["user-agent"] || "").slice(0, 200));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Certificate_${fileSafe(s.name)}.pdf"`);
  res.send(buf);
});

/* ---------------- verification ---------------- */
app.get("/api/verify/:token", (req, res) => {
  if (!rateLimit(`verify:${ip(req)}`, 40, 60_000)) return res.status(429).json({ error: "Too many requests." });
  const c = row(`SELECT c.token, c.cert_uid, c.category, c.status, s.name,
                        t.title event_title, t.event_date, t.institute, t.organiser
                 FROM certificates c JOIN students s ON s.id = c.student_id
                 JOIN events t ON t.id = c.event_id WHERE c.token = ?`, req.params.token);
  if (!c) return res.json({ valid: false, message: "Invalid certificate. This QR code does not match any issued certificate." });
  res.json({
    valid: c.status === "published",
    name: c.name, cert_uid: c.cert_uid, category: c.category, status: c.status,
    event_title: c.event_title, event_date: c.event_date, institute: c.institute, organiser: c.organiser
  });
});

/* ---------------- admin SPA data helper (event assets) ---------------- */
app.get("/api/admin/events/:id/assets", requireAdmin, (req, res) => {
  const e = row("SELECT logo_path, sig1_path, sig1_role, sig2_path, sig2_role FROM events WHERE id = ?", req.params.id);
  res.json({ assets: e || {} });
});

/* 404 for unknown api */
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

/* error handler */
app.use((err, req, res, next) => {
  console.error("[error]", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Server error" });
});

/* ============================================================
   Student portal HTML (Phase 2 SPA) — served at /portal/:token
   ============================================================ */
function portalHTML() {
  return fs.readFileSync(P("portal.html"), "utf8");
}

app.listen(PORT, () => {
  console.log("===========================================================");
  console.log("  Nature Club - E-Certificate Portal is running");
  console.log(`  Admin panel : ${BASE}/admin   (default: admin / admin123)`);
  console.log(`  Home        : ${BASE}/`);
  console.log("===========================================================");
});
