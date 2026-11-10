(async () => {
  const B = "http://localhost:3100";
  const lr = await fetch(B + "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin123" }) });
  const cookie = lr.headers.getSetCookie()[0].split(";")[0];
  const h = { headers: { "Content-Type": "application/json", Cookie: cookie } };

  /* 1. edit certificate design/wording via Event settings */
  const up = await fetch(B + "/api/admin/events/1", { method: "PUT", body: JSON.stringify({ heading: "CERTIFICATE & AWARD", intro: "This prestigious certificate is proudly presented to" }), ...h, method_outer: undefined }).catch(() => {});
  console.log("save event wording:", up?.status);

  /* 2. preview reflects wording */
  let d = await (await fetch(B + "/api/admin/events/1/certificates", h)).json();
  const c = d.certificates[0];
  const pv = await (await fetch(B + "/api/admin/certificates/" + c.id + "/preview", { headers: { Cookie: cookie } })).text();
  console.log("preview heading:", pv.includes("CERTIFICATE &amp; AWARD") || pv.includes("CERTIFICATE & AWARD"));
  console.log("preview intro:", pv.includes("prestigious certificate"));

  /* 3. students tab chip editing flow: students list + cert lookup */
  const st = await (await fetch(B + "/api/admin/events/1/students", h)).json();
  console.log("students listed:", st.students.length, "| has cert_token:", "cert_token" in st.students[0]);

  /* restore default wording */
  await fetch(B + "/api/admin/events/1", { method: "PUT", headers: h.headers, body: JSON.stringify({ heading: "CERTIFICATE", intro: "This certificate is proudly presented to" }) });
  const pv2 = await (await fetch(B + "/api/admin/certificates/" + c.id + "/preview", { headers: { Cookie: cookie } })).text();
  console.log("restored wording OK:", pv2.includes("This certificate is proudly presented to"));
})();
