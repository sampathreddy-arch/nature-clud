#!/usr/bin/env node
/* ============================================================
   mongo-cli.js — Direct MongoDB Atlas CLI & Diagnostic Utility
   Cluster: cluster0.8zo4dqi.mongodb.net / ecocert
   ============================================================ */
const { spawn } = require("child_process");
const { connectMongo, Student, Certificate, Event, syncAllToMongo, MONGODB_URI } = require("./mongo");
const db = require("./db");

const args = process.argv.slice(2);
const command = (args[0] || "stats").toLowerCase();

async function main() {
  if (command === "mongosh" || command === "shell") {
    console.log("------------------------------------------------------------");
    console.log("Connecting to MongoDB Atlas via mongosh...");
    console.log("URI:", MONGODB_URI);
    console.log("------------------------------------------------------------\n");

    const isWin = process.platform === "win32";
    const npxCmd = isWin ? "npx.cmd" : "npx";
    const child = spawn(npxCmd, ["mongosh", MONGODB_URI], {
      stdio: "inherit",
      shell: true
    });
    child.on("error", (err) => {
      console.error("Error starting mongosh:", err.message);
      console.log("\nYou can run it manually with:");
      console.log(`npx mongosh "${MONGODB_URI}"`);
    });
    return;
  }

  console.log("Connecting to MongoDB Atlas...");
  const ok = await connectMongo();
  if (!ok) {
    console.error("Failed to connect to MongoDB Atlas. Check your internet connection.");
    process.exit(1);
  }

  try {
    switch (command) {
      case "stats":
      case "info": {
        const studentCount = await Student.countDocuments();
        const certCount = await Certificate.countDocuments();
        const eventCount = await Event.countDocuments();
        console.log("\n================ MongoDB Atlas Stats ================");
        console.log(`Database:     ecocert`);
        console.log(`Cluster:      cluster0.8zo4dqi.mongodb.net`);
        console.log(`Students:     ${studentCount}`);
        console.log(`Certificates: ${certCount}`);
        console.log(`Events:       ${eventCount}`);
        console.log("=====================================================\n");
        console.log("Available CLI commands:");
        console.log("  node mongo-cli.js stats           View collection counts");
        console.log("  node mongo-cli.js students [n]    View latest n students");
        console.log("  node mongo-cli.js certs [n]       View latest n certificates");
        console.log("  node mongo-cli.js sync            Force sync SQLite -> Atlas");
        console.log("  node mongo-cli.js mongosh         Launch mongosh interactive shell\n");
        break;
      }

      case "students": {
        const limit = parseInt(args[1], 10) || 10;
        const students = await Student.find().sort({ createdAt: -1 }).limit(limit).lean();
        console.log(`\n--- Latest ${students.length} Students in Atlas ---`);
        console.table(students.map(s => ({
          Name: s.name,
          Roll: s.roll_number,
          Dept: s.department || "-",
          Year: s.year || "-",
          Phone: s.phone || "-",
          Date: s.date || "-"
        })));
        break;
      }

      case "certs":
      case "certificates": {
        const limit = parseInt(args[1], 10) || 10;
        const certs = await Certificate.find().sort({ createdAt: -1 }).limit(limit).lean();
        console.log(`\n--- Latest ${certs.length} Certificates in Atlas ---`);
        console.table(certs.map(c => ({
          UID: c.cert_uid,
          Category: c.category,
          Status: c.status,
          IssueDate: c.issue_date || "-",
          Token: c.token
        })));
        break;
      }

      case "sync": {
        console.log("Synchronizing SQLite data with MongoDB Atlas...");
        const res = await syncAllToMongo(db);
        console.log("Sync complete:", res);
        break;
      }

      default:
        console.log(`Unknown command '${command}'. Use: stats | students | certs | sync | mongosh`);
    }
  } catch (err) {
    console.error("CLI error:", err);
  } finally {
    process.exit(0);
  }
}

main();
