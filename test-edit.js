(async () => {
  const B = "http://localhost:3100";
  const lr = await fetch(B + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin123" }) });
  const cookie = lr.headers.getSetCookie()[0].split(";")[0];
  const h = { headers: { "Content-Type": "application/json", Cookie: cookie } };

  // 1. students list no longer exposes department
  let d = await (await fetch(B + "/api/admin/events/1/students", h)).json();
  console.log("1. student fields:", Object.keys(d.students[0]).join(","));

  // 2. edit certificate category + recipient name via the new flows
  d = await (await fetch(B + "/api/admin/events/1/certificates", h)).json();
  const c = d.certificates.find(x => x.name.includes("Arjun"));
  const up = await fetch(B + "/api/admin/certificates/" + c.id, { method: "PUT", headers: h.headers, body: JSON.stringify({ category: "Second Prize" }) });
  console.log("2. re-category PUBLISHED cert:", up.status, JSON.stringify(await up.json()));

  const su = await fetch(B + "/api/admin/students/" + c.student_id, { method: "PUT", headers: h.headers, body: JSON.stringify({ name: "Arjun Verma Reddy", year: "Second Year" }) });
  console.log("3. edit recipient name/year:", su.status);

  // 4. preview reflects the changes
  const pv = await (await fetch(B + "/api/admin/certificates/" + c.id + "/preview")).text();
  console.log("4. preview: newName:", pv.includes("Arjun Verma Reddy"), "| no old dept:", !pv.includes("MECH"), "| year:", pv.includes("Second Year"));

  // 5. portal still fine
  const ev = await (await fetch(B + "/api/admin/events", h)).json();
  const tok = ev.events[0].portal_url.split("/portal/")[1];
  const sr = await (await fetch(B + "/api/portal/" + tok + "/search?q=arjun")).json();
  console.log("5. portal search:", sr.results.map(r => r.name + " [" + Object.keys(r).join("/") + "]").join("  "));
})();
