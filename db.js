/* ============================================================
   db.js — Common database for Phase 1 (Admin) & Phase 2 (Student)
   Uses the built-in SQLite module of Node.js (node:sqlite)
   ============================================================ */
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const DATA_DIR = process.env.ECOCERT_DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "ecocert.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

/* ---------------- schema ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  event_date     TEXT NOT NULL,
  organiser      TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'Participation',
  institute      TEXT NOT NULL DEFAULT 'Aurora Deemed-to-be-University',
  motto          TEXT DEFAULT 'BE AWARE • REDUCE • ACT • MAKE A DIFFERENCE',
  issued_line    TEXT DEFAULT '',
  logo_path      TEXT,
  sig1_path      TEXT,
  sig1_role      TEXT DEFAULT 'Faculty Coordinator',
  sig2_path      TEXT,
  sig2_role      TEXT DEFAULT 'Principal',
  portal_token   TEXT UNIQUE,
  portal_active  INTEGER NOT NULL DEFAULT 0,
  cert_prefix    TEXT DEFAULT 'CERT',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  department  TEXT DEFAULT '',
  year        TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  date        TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, roll_number)
);

CREATE TABLE IF NOT EXISTS certificates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT UNIQUE NOT NULL,          -- direct-link token for the student portal
  cert_uid      TEXT UNIQUE NOT NULL,          -- human-readable certificate ID (EG26-0001)
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category      TEXT NOT NULL DEFAULT 'Participation',  -- Winner | Runner-up | Participation
  status        TEXT NOT NULL DEFAULT 'draft', -- draft | approved | published
  issue_date    TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT,
  UNIQUE (student_id, event_id)                -- one certificate per student per event (no duplicates)
);

CREATE TABLE IF NOT EXISTS download_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cert_id     INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  ip          TEXT,
  user_agent  TEXT,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_event ON students(event_id);
CREATE INDEX IF NOT EXISTS idx_cert_event     ON certificates(event_id);
CREATE INDEX IF NOT EXISTS idx_cert_student   ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_logs_cert      ON download_logs(cert_id);
`);

/* ---------------- helpers ---------------- */
const uid = (n) => crypto.randomBytes(n).toString("base64url");

function row(sql, ...params)  { return db.prepare(sql).get(...params); }
function all(sql, ...params)  { return db.prepare(sql).all(...params); }
function run(sql, ...params)  { return db.prepare(sql).run(...params); }

/* ---------------- seed ---------------- */
function safeAlter(sql) { try { db.exec(sql); } catch (e) { if (!String(e.message).includes("duplicate")) throw e; } }

(function seed() {
  /* template wording columns (admin-editable) */
  safeAlter("ALTER TABLE events ADD COLUMN heading TEXT DEFAULT 'CERTIFICATE'");
  safeAlter("ALTER TABLE events ADD COLUMN intro TEXT DEFAULT 'This certificate is proudly presented to'");
  /* comprehensive student and certificate date/data columns */
  safeAlter("ALTER TABLE students ADD COLUMN department TEXT DEFAULT ''");
  safeAlter("ALTER TABLE students ADD COLUMN phone TEXT DEFAULT ''");
  safeAlter("ALTER TABLE students ADD COLUMN date TEXT DEFAULT ''");
  safeAlter("ALTER TABLE certificates ADD COLUMN issue_date TEXT DEFAULT ''");
  /* certificate theme/template background */
  safeAlter("ALTER TABLE events ADD COLUMN template_path TEXT DEFAULT NULL");
  const bcrypt = require("bcryptjs");
  if (!row("SELECT id FROM admins LIMIT 1")) {
    run("INSERT INTO admins (username, password_hash) VALUES (?, ?)",
      "admin", bcrypt.hashSync("admin123", 10));
    console.log("[db] Default admin created ->  username: admin   password: admin123  (change it in Dashboard)");
  }
  if (!row("SELECT id FROM events LIMIT 1")) {
    run(`INSERT INTO events (title, event_date, organiser, category, institute, motto, issued_line,
          portal_token, portal_active, cert_prefix, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
      "ECO GAMES – PLAY FOR THE PLANET",
      "14 November 2026",
      "Nature Club",
      "Participation",
      "Aurora Deemed-to-be-University",
      "BE AWARE • REDUCE • ACT • MAKE A DIFFERENCE",
      "",
      uid(12), "EG26");
    console.log("[db] Default event seeded: ECO GAMES – PLAY FOR THE PLANET (14 November 2026)");
  }
  /* Normalize existing public Eco Games event details without deleting records. */
  for (const e of all("SELECT id, institute, issued_line, motto FROM events")) {
    const inst = String(e.institute || "").replace(/\s*[–-]\s*Bhongir Campus/gi, "").replace(/Bhongir Campus,?\s*/gi, "").trim();
    const line = String(e.issued_line || "").replace(/Bhongir Campus,?\s*/gi, "").trim();
    const eventTitle = String(row("SELECT title FROM events WHERE id = ?", e.id)?.title || "");
    const ecoGames = /eco games\s*[–-]\s*play for the planet/i.test(eventTitle);
    const nextInst = ecoGames ? "Aurora Deemed-to-be-University" : inst;
    const nextLine = ecoGames ? "" : line;
    const officialMotto = "BE AWARE • REDUCE • ACT • MAKE A DIFFERENCE";
    const nextMotto = ecoGames ? officialMotto : e.motto;
    if (nextInst !== e.institute || nextLine !== e.issued_line || nextMotto !== e.motto) {
      run("UPDATE events SET institute = ?, issued_line = ?, motto = ? WHERE id = ?", nextInst, nextLine, nextMotto, e.id);
    }
  }
  /* Normalize legacy award labels in place; certificate IDs and relationships stay unchanged. */
  run("UPDATE certificates SET category = 'Winner' WHERE lower(trim(category)) IN ('first prize', 'first', '1st')");
  run("UPDATE certificates SET category = 'Runner-up' WHERE lower(trim(category)) IN ('second prize', 'second', '2nd', 'runner up', 'runnerup')");
  run("UPDATE certificates SET category = 'Participation' WHERE lower(trim(category)) IN ('third prize', 'third', '3rd', 'participant')");
})();

module.exports = { db, row, all, run, uid, UPLOAD_DIR, DATA_DIR };
