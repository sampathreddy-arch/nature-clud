/* Smoke-check all official certificate categories without touching the database. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { generatePDF, renderCertHTML, CATEGORIES, normaliseCategory } = require("../certgen");

const base = {
  certUid: "EG26-TEST-0001",
  student: {
    name: "Kondeti Madur U Sampath",
    year: "II",
    department: "Computer Science and Engineering",
    date: "",
  },
  event: {
    title: "ECO GAMES – PLAY FOR THE PLANET",
    event_date: "14 November 2026",
    organiser: "Nature Club",
    sig1_role: "",
    sig2_role: "",
  },
  qrUrl: "https://example.invalid/api/portal/test-portal/download/test-certificate",
  sig1Buf: null,
  sig2Buf: null,
};

const EXPECTED = {
  Winner: ["OF ACHIEVEMENT", "In recognition of outstanding performance and securing the Winner position in"],
  "Runner-up": ["OF ACHIEVEMENT", "In recognition of excellent performance and securing the Runner-up position in"],
  Participation: ["OF PARTICIPATION", "In recognition of enthusiastic and active participation in"],
};

(async () => {
  assert.deepEqual(CATEGORIES, ["Winner", "Runner-up", "Participation"]);
  assert.equal(normaliseCategory("First Prize"), "Winner");
  assert.equal(normaliseCategory("Second Prize"), "Runner-up");

  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });

  for (const category of CATEGORIES) {
    const data = { ...base, category };
    const html = renderCertHTML(data);
    assert.ok(html.includes(EXPECTED[category][0]), `${category}: heading`);
    assert.ok(html.includes(EXPECTED[category][1]), `${category}: recognition`);
    assert.ok(html.includes(base.student.name), `${category}: student name`);
    assert.ok(html.includes(base.student.department), `${category}: department`);
    assert.ok(html.includes(base.certUid), `${category}: certificate ID`);
    assert.ok(html.includes("BE AWARE"), `${category}: footer slogan`);
    assert.ok(!/bhongir/i.test(html) && !/api\/verify/i.test(html), `${category}: no campus or QR verification wording`);
    assert.ok(html.includes("Certificate download QR code") && !html.includes("SCAN TO DOWNLOAD"), `${category}: QR is present without a caption`);

    const pdfBytes = await generatePDF(data);
    const doc = await PDFDocument.load(pdfBytes);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - 841.89) < 0.1, `${category}: A4 landscape width`);
    assert.ok(Math.abs(height - 595.28) < 0.1, `${category}: A4 landscape height`);
    fs.writeFileSync(path.join(outDir, `sample_${category.replace("-", "_")}.pdf`), pdfBytes);
    console.log(`${category}: PDF ready (${pdfBytes.length} bytes)`);
  }

  const longStudent = {
    ...base.student,
    name: "Sai Charan Reddy Vyasarayani Ganesh Kumar Sarma",
    department: "Electronics and Communication Engineering",
  };
  const longHtml = renderCertHTML({ ...base, student: longStudent, category: "Winner" });
  assert.ok(longHtml.includes(longStudent.name), "long name remains in preview");
  assert.ok(longHtml.includes(longStudent.department), "long department remains in preview");
  const longPdf = await generatePDF({ ...base, student: longStudent, category: "Winner" });
  fs.writeFileSync(path.join(outDir, "sample_longname.pdf"), longPdf);
  console.log("Long name and department: PDF ready");
})().catch((error) => {
  console.error("Certificate smoke check failed:", error);
  process.exitCode = 1;
});
