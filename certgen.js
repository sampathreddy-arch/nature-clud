/* ============================================================
   certgen.js — Certificate rendering (HTML preview + PDF)
   Design: Aurora Higher Education and Research Academy
   Pattern: Aurora Deemed University Eco-Cert Pattern
   ============================================================ */
const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

/* ---- colour palette ---- */
const GREEN      = "#164324";   // dark forest green (primary headings & borders)
const GREEN_MID  = "#2e7d4f";   // medium green
const GOLD       = "#b8860b";   // warm mustard gold for accents
const IVORY      = "#fafaf2";   // soft ivory/white background
const TEXT_DARK  = "#1a2c1d";   // dark body text
const TEXT_MUTED = "#556855";   // muted secondary text

const ACFG = {
  "Participation": { label: "CERTIFICATE OF PARTICIPATION", sub: "PARTICIPATION", tag: "PARTICIPATION" },
  "First Prize":   { label: "FIRST PRIZE",                  sub: "OF EXCELLENCE", tag: "FIRST PRIZE"   },
  "Second Prize":  { label: "SECOND PRIZE",                 sub: "OF EXCELLENCE", tag: "SECOND PRIZE"  },
  "Third Prize":   { label: "THIRD PRIZE",                  sub: "OF EXCELLENCE", tag: "THIRD PRIZE"   }
};

/* ---------------- HTML CSS for Screen Preview & Print ---------------- */
function certCSS() {
  return `
@page{size:A4 landscape;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#253325;font-family:Georgia,'Times New Roman',serif}

/* Certificate Outer Canvas (A4 landscape) */
.cert{
  width:297mm;height:210mm;margin:12px auto;
  position:relative;overflow:hidden;
  background:${IVORY};color:${TEXT_DARK};
  /* double border: outer 4px green, 6px ivory gap, inner 1.5px green */
  border:4.5px solid ${GREEN};
  outline:1.8px solid ${GREEN};
  outline-offset:-10px;
  box-shadow:0 8px 30px rgba(0,0,0,0.35);
}

/* Template background if custom image uploaded */
.cert.has-template{background-size:cover;background-position:center;background-repeat:no-repeat}
.cert.has-template .cert-bg-overlay{position:absolute;inset:0;background:rgba(250,250,242,.84);z-index:0}

/* Leaf Sprig Ornaments in 4 Inner Corners */
.leaf-corn{
  position:absolute;width:64px;height:64px;
  z-index:4;pointer-events:none;opacity:.92;
  object-fit:contain;
}
.leaf-corn.tl{top:14px;left:14px}
.leaf-corn.tr{top:14px;right:14px;transform:scaleX(-1)}
.leaf-corn.bl{bottom:14px;left:14px;transform:scaleY(-1)}
.leaf-corn.br{bottom:14px;right:14px;transform:scale(-1, -1)}

/* Inner Content Area */
.inner{
  position:absolute;inset:12px;z-index:2;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:14px 44px;
}

/* Header Grid: Left Wordmark, Center Text, Right Emblem */
.header-row{
  width:100%;display:flex;align-items:center;justify-content:space-between;
  margin-bottom:6px;padding:0 10px;
}
.header-col-left{width:160px;display:flex;justify-content:flex-start}
.header-col-left img{max-height:54px;max-width:150px;object-fit:contain}

.header-col-center{flex:1;text-align:center;padding:0 8px}
.inst-title{font-size:16px;font-weight:bold;letter-spacing:1.8px;color:${GREEN};text-transform:uppercase;line-height:1.2}
.inst-sub{font-size:15px;font-weight:bold;letter-spacing:1.8px;color:${GREEN};text-transform:uppercase;margin-top:2px}
.campus-name{font-size:11.5px;font-weight:bold;letter-spacing:2.5px;color:${GREEN};text-transform:uppercase;margin-top:3px}
.accred-line{font-size:9.5px;color:${TEXT_MUTED};margin-top:3px;letter-spacing:.3px}

.header-col-right{width:160px;display:flex;justify-content:flex-end}
.header-col-right img{max-height:60px;max-width:110px;object-fit:contain}

/* Organiser Accent Line */
.org-divider{
  display:flex;align-items:center;justify-content:center;
  width:320px;margin:5px 0 6px;
}
.org-divider::before, .org-divider::after{
  content:'';flex:1;border-bottom:1px solid ${GOLD};opacity:.7;
}
.org-label{
  padding:0 12px;font-size:11px;font-weight:bold;
  letter-spacing:3px;color:${GOLD};text-transform:uppercase;
}

/* Certificate Award Heading */
.cert-heading{
  font-size:36px;font-weight:bold;letter-spacing:6px;
  color:${GREEN};text-transform:uppercase;margin:2px 0 4px;line-height:1.1;
}

/* Presentation Intro */
.intro-line{
  font-size:13.5px;font-style:italic;color:${TEXT_MUTED};margin-bottom:3px;
}

/* Recipient Name - Bold Academic Serif */
.name-line{
  font-size:34px;font-weight:bold;color:${GREEN};
  letter-spacing:1px;margin:2px 0 4px;line-height:1.15;
}

/* Student Metadata: Roll No | Dept | Year */
.meta-line{
  font-size:12px;color:${GREEN};font-weight:600;letter-spacing:.5px;margin-bottom:8px;
}
.meta-sep{color:${TEXT_MUTED};font-weight:normal;padding:0 6px}

/* Citation Body Paragraph */
.body-paragraph{
  font-size:12.5px;line-height:1.55;color:${TEXT_DARK};
  max-width:760px;margin:0 auto 10px;
}
.body-paragraph b{color:${GREEN}}

/* Event Highlight Callout */
.event-callout{
  margin-top:2px;margin-bottom:10px;
}
.event-callout .event-title{
  font-size:14.5px;font-weight:bold;color:${GREEN};letter-spacing:.5px;
}
.event-callout .event-sub{
  font-size:11px;color:${TEXT_MUTED};margin-top:2px;
}

/* Bottom Row: Signatures + NIAT Center Logo */
.bottom-row{
  width:100%;margin-top:auto;
  display:flex;align-items:flex-end;justify-content:space-between;
  padding:0 20px 4px;
}
.sig-box{width:160px;text-align:center}
.sig-box img{height:44px;object-fit:contain;margin-bottom:-4px}
.sig-box .sline{border-top:1.2px solid ${TEXT_MUTED};margin:4px auto 3px;width:130px}
.sig-box .srole{font-size:10.5px;font-weight:bold;color:${TEXT_DARK}}
.sig-box .ssub{font-size:9px;color:${TEXT_MUTED}}

.partner-logo-box{flex:1;display:flex;justify-content:center;align-items:center}
.partner-logo-box img{height:46px;max-width:240px;object-fit:contain}

@media print{
  body{background:#fff}
  .cert{margin:0;box-shadow:none;page-break-after:always}
  .cert:last-child{page-break-after:auto}
}
`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

/* ---------------- Render HTML Certificate ---------------- */
function renderCertHTML(d) {
  const a = ACFG[d.category] || ACFG.Participation;
  const isWinner = d.category !== "Participation";
  const heading = a.label;
  const intro = d.event.intro || "This is proudly presented to";

  const eventDate  = esc(d.student.date || d.event.event_date || "14 November 2026");
  const organiser  = esc(d.event.organiser || "Nature Club");
  const eventTitle = esc(d.event.title || "ECO GAMES – PLAY FOR THE PLANET");

  /* citation body text matching pattern */
  const bodyText = isWinner
    ? `for securing <b>${esc(d.category.toUpperCase())}</b> in the competitive eco-innovation project showcase and environmental awareness drive during ${eventTitle} on ${eventDate}.`
    : `for active and enthusiastic participation in the competitive eco-innovation project showcase and environmental awareness drive during ${eventTitle} on ${eventDate}${d.student.year ? ` (${esc(d.student.year)})` : ""}.`;

  /* student meta string */
  const metaParts = [];
  if (d.student.roll_number) metaParts.push(`Roll No: ${esc(d.student.roll_number)}`);
  if (d.student.department)  metaParts.push(esc(d.student.department));
  if (d.student.year)        metaParts.push(esc(d.student.year));
  const metaHtml = metaParts.join('<span class="meta-sep">|</span>');

  /* custom template bg if uploaded */
  const templateStyle = d.templateUrl ? `background-image:url('${d.templateUrl}')` : "";
  const templateClass = d.templateUrl ? " has-template" : "";

  /* signatures if available */
  const renderSig = (img, role, fallback) => {
    if (!img && !role) return `<div class="sig-box"></div>`;
    const r = role || fallback;
    const sub = (role && role !== fallback) ? `<div class="ssub">${esc(fallback)}</div>` : "";
    return `
      <div class="sig-box">
        ${img ? `<img src="${img}" alt="sig">` : `<div style="height:44px"></div>`}
        <div class="sline"></div>
        <div class="srole">${esc(r)}</div>${sub}
      </div>`;
  };

  return `
<div class="cert${templateClass}" data-cert="${esc(d.certUid)}"${templateStyle ? ` style="${templateStyle}"` : ""}>
  ${d.templateUrl ? `<div class="cert-bg-overlay"></div>` : ""}

  <!-- 4 Corner Leaf Sprigs -->
  <img class="leaf-corn tl" src="/leaf_corner.png" alt="" onerror="this.style.display='none'">
  <img class="leaf-corn tr" src="/leaf_corner.png" alt="" onerror="this.style.display='none'">
  <img class="leaf-corn bl" src="/leaf_corner.png" alt="" onerror="this.style.display='none'">
  <img class="leaf-corn br" src="/leaf_corner.png" alt="" onerror="this.style.display='none'">

  <div class="inner">
    <!-- Top Header Row -->
    <div class="header-row">
      <div class="header-col-left">
        <img src="${d.logo || '/aurora_wordmark.png'}" alt="Aurora University" onerror="this.style.display='none'">
      </div>
      <div class="header-col-center">
        <div class="inst-title">AURORA HIGHER EDUCATION AND</div>
        <div class="inst-sub">RESEARCH ACADEMY</div>
        <div class="campus-name">BHONGIR CAMPUS</div>
        <div class="accred-line">Approved by AICTE | Affiliated to State University | Accredited A+ Grade</div>
      </div>
      <div class="header-col-right">
        <img src="/aurora_emblem.png" alt="Aurora Emblem" onerror="this.style.display='none'">
      </div>
    </div>

    <!-- Organiser Gold Accent -->
    <div class="org-divider">
      <div class="org-label">${organiser}</div>
    </div>

    <!-- Award Heading -->
    <div class="cert-heading">${esc(heading)}</div>

    <!-- Intro Line -->
    <div class="intro-line">${esc(intro)}</div>

    <!-- Student Name -->
    <div class="name-line">${esc(d.student.name)}</div>

    <!-- Student Details Meta -->
    <div class="meta-line">${metaHtml}</div>

    <!-- Citation Body -->
    <div class="body-paragraph">${bodyText}</div>

    <!-- Event Title Callout -->
    <div class="event-callout">
      <div class="event-title">&ldquo;${eventTitle}&rdquo;</div>
      <div class="event-sub">Conducted on ${eventDate} &nbsp;·&nbsp; Organized by ${organiser}</div>
    </div>

    <!-- Bottom Row: Signatures + NIAT Partner Logo -->
    <div class="bottom-row">
      ${renderSig(d.sig1, d.event.sig1_role, "Faculty Coordinator")}
      <div class="partner-logo-box">
        <img src="/niat_logo.png" alt="NIAT NxtWave of Innovation in Advanced Technologies" onerror="this.style.display='none'">
      </div>
      ${renderSig(d.sig2, d.event.sig2_role, "Principal")}
    </div>
  </div>
</div>`;
}

/* ================================================================
   PDF GENERATION  (PDFKit, A4 landscape, Print-Quality)
   ================================================================ */
const PT = 2.83465; // 1 mm → points
function hex(h) { return h.replace("#",""); }

function generatePDF(d) {
  return new Promise((resolve, reject) => {
    const a = ACFG[d.category] || ACFG.Participation;
    const isWinner = d.category !== "Participation";
    const W = 297 * PT, H = 210 * PT;   // 841.89 x 595.28 pt

    const doc = new PDFDocument({
      size: [W, H],
      margin: 0,
      info: {
        Title: `Certificate – ${d.student.name}`,
        Author: d.event.organiser || "Nature Club",
        Subject: `${d.category} - ${d.event.title}`
      }
    });

    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const cx = W / 2;

    /* ---- 1. Soft Ivory Background ---- */
    doc.rect(0, 0, W, H).fill(hex(IVORY));

    /* Custom Template Background Image (if uploaded) */
    if (d.templateBuf) {
      try {
        doc.image(d.templateBuf, 0, 0, { width: W, height: H });
        doc.save().fillOpacity(0.84).rect(0, 0, W, H).fill(hex(IVORY)).restore();
      } catch (e) {
        console.warn("[certgen PDF] template background error:", e.message);
      }
    }

    /* ---- 2. Double Border Frame ---- */
    // Outer border: ~14mm from edge, 4.5pt dark green
    const mOut = 36;
    doc.lineWidth(4.5).rect(mOut, mOut, W - (mOut * 2), H - (mOut * 2)).stroke(hex(GREEN));

    // Inner border: ~4.5mm inside outer border, 1.2pt dark green
    const mIn = 48;
    doc.lineWidth(1.2).rect(mIn, mIn, W - (mIn * 2), H - (mIn * 2)).stroke(hex(GREEN));

    /* ---- 3. Leaf Corner Ornaments ---- */
    const leafPath = path.join(__dirname, "public", "leaf_corner.png");
    const leafBuf = fs.existsSync(leafPath) ? fs.readFileSync(leafPath) : null;

    if (leafBuf) {
      const lSize = 48;
      // Top-Left corner
      try { doc.image(leafBuf, mIn + 6, mIn + 6, { width: lSize, height: lSize }); } catch {}

      // Top-Right corner (flipped horizontally)
      try {
        doc.save();
        doc.translate(W - mIn - 6, mIn + 6);
        doc.scale(-1, 1);
        doc.image(leafBuf, 0, 0, { width: lSize, height: lSize });
        doc.restore();
      } catch {}

      // Bottom-Left corner (flipped vertically)
      try {
        doc.save();
        doc.translate(mIn + 6, H - mIn - 6);
        doc.scale(1, -1);
        doc.image(leafBuf, 0, 0, { width: lSize, height: lSize });
        doc.restore();
      } catch {}

      // Bottom-Right corner (flipped both)
      try {
        doc.save();
        doc.translate(W - mIn - 6, H - mIn - 6);
        doc.scale(-1, -1);
        doc.image(leafBuf, 0, 0, { width: lSize, height: lSize });
        doc.restore();
      } catch {}
    }

    /* ---- 4. Top Header Logos & Institution Name ---- */
    const wordmarkPath = path.join(__dirname, "public", "aurora_wordmark.png");
    const emblemPath = path.join(__dirname, "public", "aurora_emblem.png");

    // Top-Left: Aurora Wordmark
    const leftLogo = d.logoBuf || (fs.existsSync(wordmarkPath) ? fs.readFileSync(wordmarkPath) : null);
    if (leftLogo) {
      try {
        doc.image(leftLogo, mIn + 22, 60, { fit: [140, 52], align: "left", valign: "center" });
      } catch {}
    }

    // Top-Right: Aurora Emblem
    const rightLogo = fs.existsSync(emblemPath) ? fs.readFileSync(emblemPath) : null;
    if (rightLogo) {
      try {
        doc.image(rightLogo, W - mIn - 132, 54, { fit: [110, 60], align: "right", valign: "center" });
      } catch {}
    }

    // Center Header Text
    let y = 62;
    doc.font("Times-Bold").fontSize(15).fillColor(GREEN);
    doc.text("AURORA HIGHER EDUCATION AND", 170, y, { width: W - 340, align: "center", characterSpacing: 1.8 });
    y += 18;
    doc.text("RESEARCH ACADEMY", 170, y, { width: W - 340, align: "center", characterSpacing: 1.8 });
    y += 18;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(GREEN);
    doc.text("BHONGIR CAMPUS", 170, y, { width: W - 340, align: "center", characterSpacing: 2.5 });
    y += 14;
    doc.font("Helvetica").fontSize(7.5).fillColor(TEXT_MUTED);
    doc.text("Approved by AICTE | Affiliated to State University | Accredited A+ Grade",
      170, y, { width: W - 340, align: "center", characterSpacing: 0.4 });
    y += 18;

    /* ---- 5. Organiser Accent Line ---- */
    const orgText = (d.event.organiser || "NATURE CLUB").toUpperCase();
    doc.moveTo(cx - 140, y + 5).lineTo(cx - 55, y + 5).lineWidth(0.8).stroke(hex(GOLD));
    doc.moveTo(cx + 55, y + 5).lineTo(cx + 140, y + 5).lineWidth(0.8).stroke(hex(GOLD));

    doc.font("Helvetica-Bold").fontSize(9).fillColor(GOLD);
    doc.text(orgText, cx - 55, y, { width: 110, align: "center", characterSpacing: 3 });
    y += 20;

    /* ---- 6. Award / Certificate Heading ---- */
    doc.font("Times-Bold").fontSize(26).fillColor(GREEN);
    doc.text(a.label, 60, y, { width: W - 120, align: "center", characterSpacing: 5 });
    y += 34;

    /* ---- 7. Presentation Intro Line ---- */
    doc.font("Times-Italic").fontSize(11).fillColor(TEXT_MUTED);
    doc.text(d.event.intro || "This is proudly presented to", 60, y, { width: W - 120, align: "center" });
    y += 18;

    /* ---- 8. Recipient Student Name (Prestigious Bold Academic Serif) ---- */
    doc.font("Times-Bold").fontSize(32).fillColor(GREEN);
    doc.text(d.student.name, 60, y, { width: W - 120, align: "center", characterSpacing: 1 });
    y += 38;

    /* ---- 9. Student Details Meta Line ---- */
    const metaParts = [];
    if (d.student.roll_number) metaParts.push(`Roll No: ${d.student.roll_number}`);
    if (d.student.department)  metaParts.push(d.student.department);
    if (d.student.year)        metaParts.push(d.student.year);
    const metaStr = metaParts.join("   |   ");

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(GREEN);
    doc.text(metaStr, 60, y, { width: W - 120, align: "center", characterSpacing: 0.6 });
    y += 20;

    /* ---- 10. Citation Body Text ---- */
    const eventDate  = d.student.date || d.event.event_date || "14 November 2026";
    const eventTitle = d.event.title || "ECO GAMES – PLAY FOR THE PLANET";

    const bodyText = isWinner
      ? `for securing ${d.category.toUpperCase()} in the competitive eco-innovation project showcase and environmental awareness drive during ${eventTitle} on ${eventDate}.`
      : `for active and enthusiastic participation in the competitive eco-innovation project showcase and environmental awareness drive during ${eventTitle} on ${eventDate}${d.student.year ? ` (${d.student.year})` : ""}.`;

    doc.font("Times-Roman").fontSize(10).fillColor(TEXT_DARK);
    doc.text(bodyText, 95, y, { width: W - 190, align: "center", lineGap: 3.5 });
    y += 38;

    /* ---- 11. Event Title Callout ---- */
    doc.font("Times-Bold").fontSize(12).fillColor(GREEN);
    doc.text(`“${eventTitle}”`, 80, y, { width: W - 160, align: "center" });
    y += 15;

    doc.font("Helvetica").fontSize(8.5).fillColor(TEXT_MUTED);
    doc.text(`Conducted on ${eventDate} · Organized by ${d.event.organiser || "Nature Club"}`,
      80, y, { width: W - 160, align: "center" });

    /* ---- 12. Bottom Row: Signatures + NIAT Center Logo ---- */
    const niatPath = path.join(__dirname, "public", "niat_logo.png");
    const niatBuf = fs.existsSync(niatPath) ? fs.readFileSync(niatPath) : null;

    if (niatBuf) {
      try {
        doc.image(niatBuf, cx - 95, H - 110, { fit: [190, 48], align: "center", valign: "center" });
      } catch {}
    }

    // Optional Signatures on left & right if uploaded
    const sigY = H - 85;
    const sigW = 120;
    const putSig = (buf, xc, role, fallback) => {
      if (!buf && !role) return;
      if (buf) {
        try { doc.image(buf, xc - sigW / 2, sigY - 38, { fit: [sigW, 36], align: "center", valign: "bottom" }); }
        catch {}
      }
      doc.moveTo(xc - sigW / 2 + 5, sigY).lineTo(xc + sigW / 2 - 5, sigY)
         .lineWidth(0.9).strokeColor(hex(TEXT_MUTED)).stroke();
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEXT_DARK);
      doc.text(role || fallback, xc - sigW / 2, sigY + 3, { width: sigW, align: "center" });
      if (role && role !== fallback) {
        doc.font("Helvetica").fontSize(6.5).fillColor(TEXT_MUTED);
        doc.text(fallback, xc - sigW / 2, sigY + 12, { width: sigW, align: "center" });
      }
    };

    putSig(d.sig1Buf, mIn + 75, d.event.sig1_role, "Faculty Coordinator");
    putSig(d.sig2Buf, W - mIn - 75, d.event.sig2_role, "Principal");

    /* End of document (NO QR code) */
    doc.end();
  });
}

module.exports = { certCSS, renderCertHTML, generatePDF, ACFG, esc };
