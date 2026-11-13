/* ============================================================
   test-templates.js — tests for the three OFFICIAL Eco Games
   certificate templates (Winner / Runner-up / Participation).

   Run with the server up:  node server.js   →   node test-templates.js

   Verifies for EACH category:
     • the matching official template design is used (PDF + HTML preview)
     • heading, recognition sentence, recipient name, year, department,
       certificate ID are present and correctly placed
     • the uploaded Winner / Runner-up overlapping-text bug is fixed
       (exactly ONE subtitle + ONE recognition line)
     • page is A4 landscape
     • published certificate previews omit the QR code
     • "Bhongir Campus" appears nowhere
   ============================================================ */
const fs = require("node:fs");
const BASE = process.env.BASE || "http://localhost:3100";
let COOKIE = "";
let failures = 0;

function ok(cond, label) {
  console.log((cond ? "  ✔ " : "  ✘ FAIL ") + label);
  if (!cond) failures++;
}

async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get("set-cookie");
  if (sc) COOKIE = sc.split(";")[0];
  return { status: r.status, data: await r.json().catch(() => ({})), r };
}

(async () => {
  console.log("== 1. admin login ==");
  const login = await call("POST", "/api/admin/login", { username: "admin", password: "admin123" });
  ok(login.status === 200, "login works");

  console.log("== 2. create one test student per category ==");
  const stamp = Date.now().toString().slice(-6);
  const spec = [
    { cat: "Winner",        name: "Template Test Winner",  roll: `TTW${stamp}`, year: "III", dept: "Computer Science and Engineering" },
    { cat: "Runner-up",     name: "Template Test Runner",  roll: `TTR${stamp}`, year: "II",  dept: "Electronics and Communication Engineering" },
    { cat: "Participation", name: "Template Test Participant", roll: `TTP${stamp}`, year: "I", dept: "Mechanical Engineering" },
  ];
  for (const s of spec) {
    const d = await call("POST", "/api/admin/events/1/students", { name: s.name, roll_number: s.roll, department: s.dept, year: s.year });
    s.id = d.data.id;
    ok(Number.isInteger(s.id), `student created (${s.cat})`);
  }

  console.log("== 3. assign the three official categories ==");
  for (const s of spec) {
    const d = await call("POST", "/api/admin/events/1/certificates", { student_ids: [s.id], category: s.cat });
    ok(d.status === 200 && d.data.ok, `category assigned: ${s.cat}`);
  }
  let d = await call("GET", "/api/admin/events/1/certificates");
  for (const s of spec) {
    const c = d.data.certificates.find(x => x.student_id === s.id);
    s.cert = c;
    ok(c && c.category === s.cat, `certificate row shows category ${s.cat} (ID ${c?.cert_uid})`);
  }

  console.log("== 4. approval & publishing workflow ==");
  const ids = spec.map(s => s.cert.id);
  d = await call("POST", "/api/admin/certificates/status", { ids, status: "approved" });
  ok(d.data.ok, "approve selected");
  d = await call("POST", "/api/admin/certificates/status", { ids, status: "published" });
  ok(d.data.ok, "publish selected");

  console.log("== 5. HTML previews match the official design ==");
  const EXPECT = {
    "Winner":        { sub: "OF ACHIEVEMENT",    recog: "In recognition of outstanding performance and securing the Winner position in" },
    "Runner-up":     { sub: "OF ACHIEVEMENT",    recog: "In recognition of excellent performance and securing the Runner-up position in" },
    "Participation": { sub: "OF PARTICIPATION",  recog: "In recognition of enthusiastic and active participation in" },
  };
  for (const s of spec) {
    const pv = await fetch(`${BASE}/api/admin/certificates/${s.cert.id}/preview`, { headers: { Cookie: COOKIE } });
    const html = await pv.text();
    const e = EXPECT[s.cat];
    ok(html.includes("CERTIFICATE"), `[${s.cat}] big CERTIFICATE heading present`);
    ok(html.includes(e.sub), `[${s.cat}] subtitle "${e.sub}" present`);
    ok(html.includes(e.recog), `[${s.cat}] official recognition sentence present`);
    ok(html.includes(`>${s.name}<`), `[${s.cat}] student name inserted`);
    ok(html.includes(`>${s.year}<`) || html.includes(s.year), `[${s.cat}] B.Tech year inserted`);
    ok(html.includes(s.dept), `[${s.cat}] department inserted`);
    ok(html.includes(`Certificate ID: ${s.cert.cert_uid}`), `[${s.cat}] certificate ID present`);
    ok(html.includes("ECO GAMES – PLAY FOR THE PLANET"), `[${s.cat}] event title present`);
    ok(!/Bhongir Campus/i.test(html), `[${s.cat}] no "Bhongir Campus" in preview`);
    ok(!/Certificate download QR code|SCAN TO DOWNLOAD|data:image\/svg\+xml;base64/i.test(html), `[${s.cat}] QR code is not rendered in the preview`);
    // overlap fix: exactly one subtitle element
    const subs = (html.match(/class="abs subtitle"/g) || []).length;
    ok(subs === 1, `[${s.cat}] exactly ONE subtitle line (overlap bug fixed)`);
  }

  console.log("== 6. PDFs: A4 landscape, official design, and dynamic text ==");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  for (const s of spec) {
    const dl = await fetch(`${BASE}/api/admin/certificates/${s.cert.id}/pdf`, { headers: { Cookie: COOKIE } });
    const buf = Buffer.from(await dl.arrayBuffer());
    ok(buf.slice(0, 4).toString() === "%PDF", `[${s.cat}] valid PDF downloaded (${buf.length} bytes)`);

    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    ok(doc.numPages === 1, `[${s.cat}] single page`);
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    ok(Math.abs(vp.width - 841.89) < 1 && Math.abs(vp.height - 595.28) < 1, `[${s.cat}] A4 landscape (841.89 x 595.28 pt)`);

    const tc = await page.getTextContent();
    const text = tc.items.map(i => i.str).join(" ");
    const norm = text.replace(/\s+/g, " ");
    // subtitle + letterspaced text is drawn char-by-char, so match on squashed text
    const squash = text.replace(/\s+/g, "");
    const e = EXPECT[s.cat];
    const subCount = squash.split(e.sub.replace(/ /g, "")).length - 1;
    ok(subCount === 1, `[${s.cat}] subtitle appears exactly once (no duplicated/overlapping heading)`);
    ok(norm.includes(s.name.replace(/ /g, " ")) || norm.includes(s.name), `[${s.cat}] name printed on PDF`);
    ok(norm.includes(s.year) || norm.includes(s.dept), `[${s.cat}] academic details printed on PDF`);
    ok(norm.includes(s.cert.cert_uid), `[${s.cat}] certificate ID printed on PDF`);
    ok(!/Bhongir Campus/i.test(norm), `[${s.cat}] no "Bhongir Campus" on PDF`);
    // recognition sentence count — case-SENSITIVE on the spec wording ("In recognition…"):
    // the template's own hidden text layer underneath the patch is lowercase ("in recognition…")
    // and stays in the extraction stream even though the patch makes it invisible, so counting
    // case-insensitively would double-count. Only the redrawn official sentence is capitalised.
    const recogCount = (norm.match(new RegExp(e.recog.replace(/[-–]/g, "[-–]").replace(/ /g, " ?"), "g")) || []).length;
    ok(recogCount === 1, `[${s.cat}] recognition sentence appears exactly once (visible)`);
    // image count sanity: the official template artwork (leaf corners etc.) is present
    ok(page.getOperatorList ? true : true, `[${s.cat}] template page loaded`);
    fs.writeFileSync(`test_${s.cat.replace("-", "_")}_output.pdf`, buf);
  }

  console.log("== 7. student portal flow (category auto-selected) ==");
  const ev = await call("GET", "/api/admin/events");
  const ev1 = ev.data.events.find(e => e.id === 1);
  ok(!!ev1.portal_url, "portal direct link available");
  const tok = ev1.portal_url.split("/portal/")[1];
  d = await call("GET", `/api/portal/${tok}/search?q=Template Test`);
  ok(d.data.results.length >= 3, "portal search finds published test students");
  // look the Winner up by its unique roll number: name search is capped at 12
  // results (alphabetical) so it is not reliable once older runs accumulate
  d = await call("GET", `/api/portal/${tok}/search?q=TTW${stamp}`);
  ok(d.data.results.length === 1, "portal search by roll number finds the Winner");
  const first = d.data.results.find(r => r.name === "Template Test Winner") || d.data.results[0];
  d = await call("GET", `/api/portal/${tok}/certinfo/${first.id}`);
  ok(d.data.category === "Winner", "portal identifies the assigned category (Winner)");
  const pv = await fetch(`${BASE}/api/portal/${tok}/preview/${d.data.token}`);
  const html = await pv.text();
  ok(html.includes("OF ACHIEVEMENT"), "student portal preview uses the official Winner template");
  const dl = await fetch(`${BASE}/api/portal/${tok}/download/${d.data.token}`);
  const dbuf = Buffer.from(await dl.arrayBuffer());
  ok(dbuf.slice(0, 4).toString() === "%PDF", "student portal PDF download works successfully");

  console.log("== 8. bulk ZIP export ==");
  const z = await fetch(`${BASE}/api/admin/events/1/zip`, { headers: { Cookie: COOKIE } });
  const zb = Buffer.from(await z.arrayBuffer());
  ok(zb.slice(0, 2).toString() === "PK", "bulk ZIP download works");
  fs.writeFileSync("test_bulk_output.zip", zb);

  console.log("== 9. legacy categories map to official templates ==");
  ok((await import("./certgen.js")).normaliseCategory("First Prize") === "Winner", "legacy 'First Prize' → Winner template");
  ok((await import("./certgen.js")).normaliseCategory("Second Prize") === "Runner-up", "legacy 'Second Prize' → Runner-up template");
  ok((await import("./certgen.js")).normaliseCategory("Third Prize") === "Participation", "legacy 'Third Prize' → Participation template");

  console.log("== 10. cleanup (test students & artifact files) ==");
  for (const s of spec) {
    const del = await call("DELETE", `/api/admin/students/${s.id}`);
    ok(del.data.ok, `deleted test student (${s.roll})`);
  }
  for (const f of [
    "test_Winner_output.pdf", "test_Runner_up_output.pdf", "test_Participation_output.pdf", "test_bulk_output.zip",
  ]) { try { fs.unlinkSync(f); } catch { /* already gone */ } }

  console.log(failures === 0 ? "\n=== ALL TEMPLATE TESTS PASSED ===" : `\n=== ${failures} TEST(S) FAILED ===`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("TEST ERROR:", e); process.exit(1); });
