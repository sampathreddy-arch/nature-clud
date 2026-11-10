/* ============================================================
   mongo.js — MongoDB Atlas integration for Eco Certificate Portal
   Cluster: cluster0.8zo4dqi.mongodb.net
   ============================================================ */
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://madurusampath_db_user:G7U1hWsRu7ng4HTL@cluster0.8zo4dqi.mongodb.net/ecocert?retryWrites=true&w=majority";

/* ---------------- schemas & models ---------------- */
const StudentSchema = new mongoose.Schema({
  sqlite_id: Number,
  event_id: { type: Number, index: true },
  name: { type: String, required: true, trim: true },
  roll_number: { type: String, required: true, trim: true, index: true },
  department: { type: String, default: "", trim: true },
  year: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true },
  phone: { type: String, default: "", trim: true },
  date: { type: String, default: "", trim: true },
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

StudentSchema.index({ event_id: 1, roll_number: 1 }, { unique: true });

const CertificateSchema = new mongoose.Schema({
  sqlite_id: Number,
  token: { type: String, unique: true, index: true },
  cert_uid: { type: String, unique: true, index: true },
  student_id: Number,
  event_id: { type: Number, index: true },
  category: { type: String, default: "Participation" },
  status: { type: String, default: "draft" },
  issue_date: { type: String, default: "" },
  created_at: { type: Date, default: Date.now },
  published_at: Date
}, { timestamps: true });

const EventSchema = new mongoose.Schema({
  sqlite_id: { type: Number, unique: true },
  title: String,
  event_date: String,
  organiser: String,
  category: String,
  institute: String,
  motto: String,
  issued_line: String,
  portal_token: String,
  portal_active: Boolean,
  cert_prefix: String,
  heading: String,
  intro: String,
  logo_path: String,
  sig1_path: String,
  sig1_role: String,
  sig2_path: String,
  sig2_role: String
}, { timestamps: true });

const DownloadLogSchema = new mongoose.Schema({
  cert_id: Number,
  cert_uid: String,
  ip: String,
  user_agent: String,
  downloaded_at: { type: Date, default: Date.now }
});

const Student = mongoose.models.Student || mongoose.model("Student", StudentSchema);
const Certificate = mongoose.models.Certificate || mongoose.model("Certificate", CertificateSchema);
const Event = mongoose.models.Event || mongoose.model("Event", EventSchema);
const DownloadLog = mongoose.models.DownloadLog || mongoose.model("DownloadLog", DownloadLogSchema);

let isConnected = false;

async function connectMongo() {
  if (isConnected) return true;
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });
    isConnected = true;
    console.log("[mongo] Connected to MongoDB Atlas cluster0.8zo4dqi.mongodb.net");
    return true;
  } catch (err) {
    console.warn("[mongo] Could not connect to MongoDB Atlas:", err.message);
    isConnected = false;
    return false;
  }
}

async function syncStudent(s) {
  if (!isConnected) return;
  try {
    await Student.findOneAndUpdate(
      { event_id: s.event_id, roll_number: s.roll_number },
      {
        name: s.name,
        roll_number: s.roll_number,
        department: s.department || "",
        year: s.year || "",
        email: s.email || "",
        phone: s.phone || "",
        date: s.date || "",
        sqlite_id: s.id || s.sqlite_id
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (err) {
    console.error("[mongo] Error syncing student:", err.message);
  }
}

async function deleteStudent(eventId, rollNumber) {
  if (!isConnected) return;
  try {
    await Student.deleteOne({ event_id: eventId, roll_number: rollNumber });
  } catch (err) {
    console.error("[mongo] Error deleting student:", err.message);
  }
}

async function syncCertificate(c) {
  if (!isConnected) return;
  try {
    await Certificate.findOneAndUpdate(
      { cert_uid: c.cert_uid },
      {
        token: c.token,
        student_id: c.student_id,
        event_id: c.event_id,
        category: c.category,
        status: c.status,
        issue_date: c.issue_date || "",
        sqlite_id: c.id || c.sqlite_id,
        published_at: c.status === "published" ? new Date() : undefined
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (err) {
    console.error("[mongo] Error syncing certificate:", err.message);
  }
}

async function syncAllFromSQLite(dbModule) {
  if (!isConnected) await connectMongo();
  if (!isConnected) return { ok: false, error: "Not connected to MongoDB" };

  try {
    const { all } = dbModule;
    const events = all("SELECT * FROM events");
    for (const e of events) {
      await Event.findOneAndUpdate(
        { sqlite_id: e.id },
        { ...e, sqlite_id: e.id, portal_active: !!e.portal_active },
        { upsert: true, returnDocument: "after" }
      );
    }

    const students = all("SELECT * FROM students");
    for (const s of students) {
      await Student.findOneAndUpdate(
        { event_id: s.event_id, roll_number: s.roll_number },
        { ...s, sqlite_id: s.id },
        { upsert: true, returnDocument: "after" }
      );
    }

    const certs = all("SELECT * FROM certificates");
    for (const c of certs) {
      await Certificate.findOneAndUpdate(
        { cert_uid: c.cert_uid },
        { ...c, sqlite_id: c.id },
        { upsert: true, returnDocument: "after" }
      );
    }

    const studentCount = await Student.countDocuments();
    const certCount = await Certificate.countDocuments();
    return {
      ok: true,
      eventsSynced: events.length,
      studentsSynced: students.length,
      certsSynced: certs.length,
      totalMongoStudents: studentCount,
      totalMongoCerts: certCount
    };
  } catch (err) {
    console.error("[mongo] syncAll error:", err);
    return { ok: false, error: err.message };
  }
}

async function getMongoStatus() {
  const connected = mongoose.connection.readyState === 1;
  let studentsCount = 0, certsCount = 0;
  if (connected) {
    try {
      studentsCount = await Student.countDocuments();
      certsCount = await Certificate.countDocuments();
    } catch {}
  }
  return {
    connected,
    host: "cluster0.8zo4dqi.mongodb.net",
    database: mongoose.connection.name || "ecocert",
    studentsCount,
    certsCount
  };
}

module.exports = {
  mongoose,
  Student,
  Certificate,
  Event,
  DownloadLog,
  connectMongo,
  syncStudent,
  deleteStudent,
  syncCertificate,
  syncAllFromSQLite,
  getMongoStatus
};

