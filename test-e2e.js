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
  await call("POST", "/api/admin/events/1/certificates", { student_ids: ids.slice(0, 3), category: "Participation" });
  await call("POST", "/api/admin/events/1/certificates", { student_ids: [ids[3]], category: "Runner-up" });
  await call("POST", "/api/admin/events/1/certificates", { student_ids: [ids[4]], category: "Winner" });
  d = await call("GET", "/api/admin/events/1/certificates");
  log("certificates created:", d.data.certificates.length, d.data.certificates.map(c => c.cert_uid).join(","));
  const certIds = d.data.certificates.map(c => c.id);
  const assigned = new Set(d.data.certificates.map(c => c.category));
  log("all official categories assigned:", ["Winner", "Runner-up", "Participation"].every(x => assigned.has(x)) ? "OK" : "FAIL");

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
  log("preview has an uncaptioned direct-download QR and no campus/verification text:", html.includes("Certificate download QR code") && !html.includes("SCAN TO DOWNLOAD") && !/bhongir/i.test(html) && !/api\/verify/i.test(html) ? "OK" : "FAIL");

  // Generate a PDF through the admin route for each official category.
  d = await call("GET", "/api/admin/events/1/certificates");
  for (const category of ["Winner", "Runner-up", "Participation"]) {
    const target = d.data.certificates.find(c => c.category === category);
    const pdf = await fetch(`${BASEC}/api/admin/certificates/${target.id}/pdf`, { headers: { Cookie: COOKIE } });
    const bytes = Buffer.from(await pdf.arrayBuffer());
    log(`${category} template PDF:`, pdf.status, "isPDF:", bytes.slice(0, 4).toString() === "%PDF");
  }

  // direct-link certificate info (QR codes use the download route, not verification)
  console.log("=== SMOKE TEST COMPLETE ===");
})().catch(e => { console.error("TEST ERROR:", e.message); process.exit(1); });
