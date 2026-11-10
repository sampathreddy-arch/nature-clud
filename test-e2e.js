/* end-to-end smoke test */
const BASEC = process.env.BASE || "http://localhost:3100";
let COOKIE = "";

async function call(method, path, body, expectJson = true) {
  const r = await fetch(BASEC + path, {
    method,
    headers: { "Content-Type": "application/json", ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get("set-cookie");
  if (sc) COOKIE = sc.split(";")[0];
  if (expectJson) return { status: r.status, data: await r.json() };
  return { status: r.status, r };
}

(async () => {
  const log = (...a) => console.log(...a);

  // login
  let d = await call("POST", "/api/admin/login", { username: "admin", password: "admin123" });
  log("login:", d.status, d.data.username || d.data.error);

  // add students
  const students = [
    { name: "Rahul Sharma", roll_number: "B23CS001", department: "CSE", year: "2", email: "rahul@example.com" },
    { name: "Ananya Reddy", roll_number: "B23CS002", department: "CSE", year: "2", email: "ananya@example.com" },
    { name: "Kiran Kumar", roll_number: "B23EC003", department: "ECE", year: "2", email: "" },
    { name: "Meena Das", roll_number: "B23EC004", department: "ECE", year: "2", email: "" },
    { name: "Arjun Verma", roll_number: "B23ME005", department: "MECH", year: "2", email: "" }
  ];
  const ids = [];
  for (const s of students) {
    d = await call("POST", "/api/admin/events/1/students", s);
    let sid = d.data.id;
    if (Number.isInteger(sid)) ids.push(sid);
  }
  log("students added:", ids.length);

  // duplicate roll rejected?
  d = await call("POST", "/api/admin/events/1/students", students[0]);
  log("duplicate roll rejected:", d.status === 409 ? "OK" : `FAIL ${d.status}`);

  // assign categories
  await call("POST", "/api/admin/events/1/certificates", { student_ids: ids.slice(0, 4), category: "Participation" });
  await call("POST", "/api/admin/events/1/certificates", { student_ids: [ids[4]], category: "First Prize" });
  d = await call("GET", "/api/admin/events/1/certificates");
  log("certificates created:", d.data.certificates.length, d.data.certificates.map(c => c.cert_uid).join(","));
  const certIds = d.data.certificates.map(c => c.id);

  // unapproved publish should fail
  d = await call("POST", "/api/admin/certificates/status", { ids: certIds, status: "published" });
  log("publish before approve blocked:", d.status === 400 ? "OK" : "FAIL");

  // approve + publish
  d = await call("POST", "/api/admin/certificates/status", { ids: certIds, status: "approved" });
  log("approve:", d.status, d.data.ok ? "OK" : JSON.stringify(d.data));
  d = await call("POST", "/api/admin/certificates/status", { ids: certIds, status: "published" });
  log("publish:", d.status, d.data.ok ? "OK" : JSON.stringify(d.data));

  // stats
  d = await call("GET", "/api/admin/stats");
  log("stats:", JSON.stringify(d.data));

  // activate portal
  d = await call("PUT", "/api/admin/events/1", { portal_active: 1 });
  const ev = await call("GET", "/api/admin/events");
  const ev1 = ev.data.events[0];
  log("portal url:", ev1.portal_url);

  // portal: info
  const token = ev1.portal_url.split("/portal/")[1];
  d = await call("GET", `/api/portal/${token}`);
  log("portal info:", d.status, d.data.event?.title);

  // search published only
  const pub = await fetch(`${BASEC}/api/portal/${token}/search?q=ra`);
  const pd = await pub.json();
  log("search results:", pd.results.map(r => r.name).join(", "), "| email exposed:", pd.results.some(r => "email" in r));

  // certinfo for first result
  d = await call("GET", `/api/portal/${token}/certinfo/${pd.results[0].id}`);
  const certToken = d.data.token;
  log("certinfo:", d.data.category, certToken?.slice(0, 8) + "…");

  // download PDF
  const dl = await fetch(`${BASEC}/api/portal/${token}/download/${certToken}`, { headers: { Cookie: COOKIE } });
  const buf = Buffer.from(await dl.arrayBuffer());
  log("download pdf:", dl.status, `bytes=${buf.length}`, "isPDF:", buf.slice(0, 4).toString() === "%PDF",
      (dl.headers.get("content-disposition") || ""));

  // preview html
  const pv = await fetch(`${BASEC}/api/portal/${token}/preview/${certToken}`);
  const html = await pv.text();
  log("preview html:", pv.status, html.includes("CERTIFICATE") ? "OK" : "no cert?");

  // verify token
  d = await call("GET", `/api/verify/${certToken}`);
  log("verify:", d.data.valid, d.data.name, d.data.category, d.data.cert_uid);
  d = await call("GET", "/api/verify/bogus-token-123");
  log("bogus verify ->", d.data.valid === false ? "OK invalid" : "FAIL");

  // zip
  const z = await call("GET", "/api/admin/events/1/zip", undefined, false);
  const zb = Buffer.from(await z.r.arrayBuffer());
  log("zip export:", z.r.status, `bytes=${zb.length}`, "isZIP:", zb.slice(0, 2).toString() === "PK");

  console.log("=== SMOKE TEST COMPLETE ===");
})().catch(e => { console.error("TEST ERROR:", e.message); process.exit(1); });
