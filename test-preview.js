(async () => {
  const B = "http://localhost:3100";
  const lr = await fetch(B + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin123" }) });
  const cookie = lr.headers.getSetCookie()[0].split(";")[0];
  const d = await (await fetch(B + "/api/admin/events/1/certificates", { headers: { Cookie: cookie } })).json();
  const c = d.certificates.find(x => x.name.includes("Arjun"));
  console.log("cert row: id", c.id, "| name:", c.name, "| year:", c.year, "| category:", c.category, "| status:", c.status);
  const r = await fetch(B + "/api/admin/certificates/" + c.id + "/preview", { headers: { Cookie: cookie } });
  const t = await r.text();
  const rec = t.match(/class="sname"[^>]*>([^<]*)</);
  console.log("preview status:", r.status, "| recipient:", rec && rec[1]);
  console.log("runner-up subtitle:", t.includes("OF ACHIEVEMENT"));
  console.log("no old name:", !t.includes("Arjun Verma "));
})();