/* ============================================================
   certgen.js — Certificate rendering (HTML preview + PDF)
   Design: Aurora Higher Education and Research Academy
   Pattern: Aurora Deemed University "NATURE CLUB PRESENTS" Pattern
   ============================================================ */
const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

/* ---- colour palette matching template ---- */
const MAROON     = "#801426";   // Aurora rich maroon (outer border, CERTIFICATE title, name line)
const MAROON_TXT = "#981b32";   // bright maroon
const GREEN      = "#1b5c2d";   // Nature club forest green (inner border, subtitle, event title)
const TEXT_BLACK = "#1a1a1a";   // main headings & body
const TEXT_MUTED = "#3a3a3a";   // secondary text & details
const BG_IVORY   = "#ffffff";   // crisp ivory-white background

const ACFG = {
  "Participation": { sub: "OF PARTICIPATION", title: "CERTIFICATE", prefix: "in recognition of enthusiastic and active participation in" },
  "First Prize":   { sub: "OF EXCELLENCE",    title: "CERTIFICATE", prefix: "in recognition of outstanding achievement and securing FIRST PRIZE in" },
  "Second Prize":  { sub: "OF EXCELLENCE",    title: "CERTIFICATE", prefix: "in recognition of outstanding achievement and securing SECOND PRIZE in" },
  "Third Prize":   { sub: "OF EXCELLENCE",    title: "CERTIFICATE", prefix: "in recognition of outstanding achievement and securing THIRD PRIZE in" }
};

/* ================================================================
   HTML CSS for Screen Preview & Print
   ================================================================ */
function certCSS() {
  return `
@page{size:A4 landscape;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#222;font-family:Georgia,'Times New Roman',serif}

/* Outer Certificate Canvas */
.cert{
  width:297mm;height:210mm;margin:12px auto;
  position:relative;overflow:hidden;
  background:${BG_IVORY};color:${TEXT_BLACK};
  /* Double border: Outer Maroon (3px), 8px gap, Inner Green (1.5px) */
  border:3px solid ${MAROON};
  outline:1.5px solid ${GREEN};
  outline-offset:-9px;
  box-shadow:0 8px 30px rgba(0,0,0,0.35);
}

/* 4 Corner Leaf Sprigs */
.leaf-corn{
  position:absolute;width:58px;height:58px;
  z-index:4;pointer-events:none;opacity:.95;
  object-fit:contain;
}
.leaf-corn.tl{top:13px;left:13px}
.leaf-corn.tr{top:13px;right:13px;transform:scaleX(-1)}
.leaf-corn.bl{bottom:13px;left:13px;transform:scaleY(-1)}
.leaf-corn.br{bottom:13px;right:13px;transform:scale(-1, -1)}

/* Inner Content Area */
.inner{
  position:absolute;inset:12px;z-index:2;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  padding:14px 44px 10px;
}

/* Top Header Row */
.header-row{
  width:100%;display:flex;align-items:center;justify-content:space-between;
  margin-bottom:8px;padding:0 6px;
}
.header-col-left{width:180px;text-align:left}
.header-col-left img{max-height:46px;max-width:170px;object-fit:contain;display:block}
.header-col-left .campus-tag{
  font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;
  color:${MAROON};letter-spacing:1px;margin-top:2px;text-transform:uppercase;
}

.header-col-center{flex:1;text-align:center;padding:0 8px}
.inst-title{
  font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:bold;
  letter-spacing:.8px;color:#111;text-transform:uppercase;line-height:1.25;
}
.inst-sub{
  font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:bold;
  color:#222;margin-top:2px;
}
.inst-loc{
  font-family:Arial,Helvetica,sans-serif;font-size:9.5px;
  color:#222;margin-top:1px;
}

.header-col-right{width:180px;display:flex;justify-content:flex-end}
.header-col-right img{max-height:56px;max-width:110px;object-fit:contain}

/* Presenter Line */
.presenter-line{
  font-family:Arial,Helvetica,sans-serif;font-size:11.5px;font-weight:bold;
  letter-spacing:3.5px;color:${GREEN};text-transform:uppercase;
  margin:4px 0 2px;
}

/* Big CERTIFICATE Heading */
.cert-main-word{
  font-size:44px;font-weight:bold;letter-spacing:10px;
  color:${MAROON_TXT};text-transform:uppercase;margin:0 0 1px;line-height:1.05;
}

/* Sub-title: OF PARTICIPATION */
.cert-sub-word{
  font-size:14px;font-weight:bold;letter-spacing:6px;
  color:${GREEN};text-transform:uppercase;margin-bottom:6px;
}

/* Presentation Intro */
.intro-line{
  font-size:13px;font-style:italic;color:#333;margin-bottom:6px;
}

/* Student Name & Maroon Line */
.name-wrap{
  width:620px;position:relative;margin:0 auto 6px;text-align:center;
}
.student-name{
  font-size:32px;font-weight:bold;color:#111;
  letter-spacing:.8px;padding-bottom:2px;
}
.name-rule{
  width:100%;height:1.5px;background:${MAROON};margin:2px auto 6px;
}

/* Academic Details Meta (B.Tech ... Year, Department of ...) */
.meta-row{
  font-size:12.5px;color:#222;margin-bottom:8px;
}
.meta-row .val{font-weight:bold;color:${GREEN};padding:0 4px}
.meta-row .blank{display:inline-block;border-bottom:1px solid #777;min-width:60px;height:14px;vertical-align:bottom}
.meta-row .blank-lg{min-width:160px}

/* Recognition text */
.recog-line{
  font-size:12.5px;color:#222;margin-bottom:6px;
}

/* Main Event Title */
.event-title-banner{
  font-size:21px;font-weight:bold;letter-spacing:1px;
  color:${GREEN};text-transform:uppercase;margin:2px 0 5px;
}

/* Organised By venue & date */
.org-details{
  font-size:11.5px;color:#222;line-height:1.45;margin-bottom:6px;
}

/* Activities bullet list */
.activities-line{
  font-size:9.5px;color:${GREEN};font-weight:600;
  letter-spacing:.4px;margin-bottom:8px;
}

/* Bottom Tagline */
.tagline-banner{
  font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;
  letter-spacing:2.8px;color:${GREEN};text-transform:uppercase;
  margin-bottom:10px;
}

/* Bottom Technology Partner & Signatures */
.footer-row{
  width:100%;margin-top:auto;
  display:flex;align-items:flex-end;justify-content:space-between;
  padding:0 24px 2px;
}
.sig-block{width:160px;text-align:center}
.sig-block img{height:42px;object-fit:contain;margin-bottom:-4px}
.sig-block .sline{border-top:1.2px solid #555;margin:3px auto 2px;width:130px}
.sig-block .srole{font-size:10px;font-weight:bold;color:#222}
.sig-block .ssub{font-size:8.5px;color:#666}

.partner-block{flex:1;text-align:center}
.partner-tag{
  font-family:Arial,Helvetica,sans-serif;font-size:8px;font-weight:bold;
  letter-spacing:1.5px;color:#222;text-transform:uppercase;margin-bottom:4px;
}
.partner-block img{height:26px;width:26px;object-fit:contain;display:inline-block}

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
  const heading = a.title;
  const subHeading = a.sub;
  const prefixText = a.prefix;

  const eventDate = esc(d.student.date || d.event.event_date || "14 November 2026");
  const eventTitle = esc(d.event.title || "ECO GAMES – PLAY FOR THE PLANET");

  const yearVal = d.student.year ? `<span class="val">${esc(d.student.year)}</span>` : `<span class="blank"></span>`;
  const deptVal = d.student.department ? `<span class="val">${esc(d.student.department)}</span>` : `<span class="blank blank-lg"></span>`;
  const rollNote = d.student.roll_number ? ` &nbsp; (Roll No: <span class="val">${esc(d.student.roll_number)}</span>)` : "";

  const renderSig = (img, role, fallback) => {
    if (!img && !role) return `<div class="sig-block"></div>`;
    const r = role || fallback;
    const sub = (role && role !== fallback) ? `<div class="ssub">${esc(fallback)}</div>` : "";
    return `
      <div class="sig-block">
        ${img ? `<img src="${img}" alt="sig">` : `<div style="height:42px"></div>`}
        <div class="sline"></div>
        <div class="srole">${esc(r)}</div>${sub}
      </div>`;
  };

  return `
<div class="cert" data-cert="${esc(d.certUid)}">
  <!-- 4 Corner Leaf Sprigs -->
  <img class="leaf-corn tl" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">
  <img class="leaf-corn tr" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">
  <img class="leaf-corn bl" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">
  <img class="leaf-corn br" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">

  <div class="inner">
    <!-- Top Header Row -->
    <div class="header-row">
      <div class="header-col-left">
        <img src="${d.logo || '/aurora_wordmark.png'}" alt="Aurora University" onerror="this.style.display='none'">
        <div class="campus-tag">BHONGIR CAMPUS</div>
      </div>
      <div class="header-col-center">
        <div class="inst-title">AURORA HIGHER EDUCATION AND RESEARCH ACADEMY</div>
        <div class="inst-sub">(Deemed-to-be-University, Estd. u/s 33 of UGC Act 1956)</div>
        <div class="inst-loc">Bhongir, Yadadri, Telangana | www.aurora.edu.in</div>
      </div>
      <div class="header-col-right">
        <img src="/aurora_emblem.png" alt="Aurora Emblem" onerror="this.style.display='none'">
      </div>
    </div>

    <!-- Presenter Line -->
    <div class="presenter-line">NATURE CLUB PRESENTS</div>

    <!-- Title: CERTIFICATE -->
    <div class="cert-main-word">${esc(heading)}</div>

    <!-- Subtitle: OF PARTICIPATION -->
    <div class="cert-sub-word">${esc(subHeading)}</div>

    <!-- Intro Line -->
    <div class="intro-line">This certificate is proudly presented to</div>

    <!-- Recipient Name & Maroon Underline -->
    <div class="name-wrap">
      <div class="student-name">${esc(d.student.name || "Student Name")}</div>
      <div class="name-rule"></div>
    </div>

    <!-- Academic Details: B.Tech ... Year, Department of ... -->
    <div class="meta-row">
      B.Tech &nbsp; ${yearVal} &nbsp; Year, &nbsp; Department of &nbsp; ${deptVal} ${rollNote}
    </div>

    <!-- Recognition Line -->
    <div class="recog-line">${prefixText}</div>

    <!-- Event Title Banner -->
    <div class="event-title-banner">${eventTitle}</div>

    <!-- Organization & Venue Details -->
    <div class="org-details">
      organized by the Nature Club, Aurora Deemed-to-be-University, Bhongir Campus,<br>
      on ${eventDate} at the University Seminar Hall.
    </div>

    <!-- Activities Bullet Line -->
    <div class="activities-line">
      Eco Rapid-Fire Quiz &nbsp;•&nbsp; Plastic-Free Challenge &nbsp;•&nbsp; Environmental Dumb Charades &nbsp;•&nbsp; Eco Innovation Challenge
    </div>

    <!-- Tagline Banner -->
    <div class="tagline-banner">
      BE AWARE &nbsp;•&nbsp; REDUCE &nbsp;•&nbsp; ACT &nbsp;•&nbsp; MAKE A DIFFERENCE
    </div>

    <!-- Footer: Signatures + Technology Partner Logo -->
    <div class="footer-row">
      ${renderSig(d.sig1, d.event.sig1_role, "Faculty Coordinator")}
      <div class="partner-block">
        <div class="partner-tag">TECHNOLOGY PARTNER</div>
        <img src="/niat_icon.png" alt="NIAT" onerror="this.style.display='none'">
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
    const heading = a.title;
    const subHeading = a.sub;
    const prefixText = a.prefix;

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

    /* ---- 1. White Background ---- */
    doc.rect(0, 0, W, H).fill(hex(BG_IVORY));

    /* ---- 2. Double Border Frame ---- */
    // Outer border: Maroon ~22pt margin from edge, lineWidth 2.6
    const mOut = 22;
    doc.lineWidth(2.6).rect(mOut, mOut, W - (mOut * 2), H - (mOut * 2)).stroke(hex(MAROON));

    // Inner border: Green ~31pt margin from edge, lineWidth 1.3
    const mIn = 31;
    doc.lineWidth(1.3).rect(mIn, mIn, W - (mIn * 2), H - (mIn * 2)).stroke(hex(GREEN));

    /* ---- 3. Leaf Corner Ornaments (3-leaf cluster) ---- */
    const leafPath = path.join(__dirname, "public", "leaf_corner_tri.png");
    const leafBuf = fs.existsSync(leafPath) ? fs.readFileSync(leafPath) : null;

    if (leafBuf) {
      const lSize = 44;
      // Top-Left
      try { doc.image(leafBuf, mIn + 4, mIn + 4, { width: lSize, height: lSize }); } catch {}

      // Top-Right (flipped horizontally)
      try {
        doc.save();
        doc.translate(W - mIn - 4, mIn + 4);
        doc.scale(-1, 1);
        doc.image(leafBuf, 0, 0, { width: lSize, height: lSize });
        doc.restore();
      } catch {}

      // Bottom-Left (flipped vertically)
      try {
        doc.save();
        doc.translate(mIn + 4, H - mIn - 4);
        doc.scale(1, -1);
        doc.image(leafBuf, 0, 0, { width: lSize, height: lSize });
        doc.restore();
      } catch {}

      // Bottom-Right (flipped both)
      try {
        doc.save();
        doc.translate(W - mIn - 4, H - mIn - 4);
        doc.scale(-1, -1);
        doc.image(leafBuf, 0, 0, { width: lSize, height: lSize });
        doc.restore();
      } catch {}
    }

    /* ---- 4. Top Header: Wordmark (Left), Emblem (Right), University Info (Center) ---- */
    const wordmarkPath = path.join(__dirname, "public", "aurora_wordmark.png");
    const emblemPath = path.join(__dirname, "public", "aurora_emblem.png");

    // Top-Left: Aurora Wordmark
    const leftLogo = d.logoBuf || (fs.existsSync(wordmarkPath) ? fs.readFileSync(wordmarkPath) : null);
    if (leftLogo) {
      try {
        doc.image(leftLogo, mIn + 18, 48, { fit: [145, 42], align: "left", valign: "top" });
      } catch {}
    }
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MAROON);
    doc.text("BHONGIR CAMPUS", mIn + 18, 92, { width: 145, align: "left", characterSpacing: 0.8 });

    // Top-Right: Aurora Emblem
    const rightLogo = fs.existsSync(emblemPath) ? fs.readFileSync(emblemPath) : null;
    if (rightLogo) {
      try {
        doc.image(rightLogo, W - mIn - 120, 44, { fit: [100, 56], align: "right", valign: "top" });
      } catch {}
    }

    // Center University Header
    let y = 48;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111");
    doc.text("AURORA HIGHER EDUCATION AND RESEARCH ACADEMY", 170, y, { width: W - 340, align: "center", characterSpacing: 0.6 });
    y += 15;
    doc.font("Helvetica").fontSize(7.8).fillColor("#222222");
    doc.text("(Deemed-to-be-University, Estd. u/s 33 of UGC Act 1956)", 170, y, { width: W - 340, align: "center" });
    y += 12;
    doc.text("Bhongir, Yadadri, Telangana | www.aurora.edu.in", 170, y, { width: W - 340, align: "center" });
    y += 17;

    /* ---- 5. NATURE CLUB PRESENTS ---- */
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(GREEN);
    doc.text("NATURE CLUB PRESENTS", 100, y, { width: W - 200, align: "center", characterSpacing: 3.5 });
    y += 17;

    /* ---- 6. CERTIFICATE (Large Maroon Serif) ---- */
    doc.font("Times-Bold").fontSize(38).fillColor(MAROON_TXT);
    doc.text(heading, 60, y, { width: W - 120, align: "center", characterSpacing: 9 });
    y += 42;

    /* ---- 7. OF PARTICIPATION (Green Serif) ---- */
    doc.font("Times-Bold").fontSize(12.5).fillColor(GREEN);
    doc.text(subHeading, 60, y, { width: W - 120, align: "center", characterSpacing: 5 });
    y += 20;

    /* ---- 8. Intro Line ---- */
    doc.font("Times-Italic").fontSize(11).fillColor("#333333");
    doc.text("This certificate is proudly presented to", 60, y, { width: W - 120, align: "center" });
    y += 22;

    /* ---- 9. Recipient Student Name & Maroon Line ---- */
    doc.font("Times-Bold").fontSize(26).fillColor("#111111");
    doc.text(d.student.name || "Student Name", 60, y, { width: W - 120, align: "center", characterSpacing: 0.8 });
    y += 32;

    // Maroon underline
    doc.moveTo(cx - 240, y).lineTo(cx + 240, y).lineWidth(1.4).stroke(hex(MAROON));
    y += 10;

    /* ---- 10. Academic Details Line: B.Tech ... Year, Department of ... ---- */
    const yrStr = d.student.year ? `${d.student.year}` : "_______";
    const deptStr = d.student.department ? `${d.student.department}` : "________________________";
    const rollStr = d.student.roll_number ? ` (Roll No: ${d.student.roll_number})` : "";
    const metaFull = `B.Tech   ${yrStr}   Year,   Department of   ${deptStr}${rollStr}`;

    doc.font("Times-Roman").fontSize(10.5).fillColor("#111111");
    doc.text(metaFull, 60, y, { width: W - 120, align: "center" });
    y += 18;

    /* ---- 11. Recognition Sentence ---- */
    doc.font("Times-Roman").fontSize(10.5).fillColor("#222222");
    doc.text(prefixText, 60, y, { width: W - 120, align: "center" });
    y += 18;

    /* ---- 12. Event Title: ECO GAMES – PLAY FOR THE PLANET ---- */
    const eventTitle = d.event.title || "ECO GAMES – PLAY FOR THE PLANET";
    doc.font("Times-Bold").fontSize(17).fillColor(GREEN);
    doc.text(eventTitle, 60, y, { width: W - 120, align: "center", characterSpacing: 0.8 });
    y += 24;

    /* ---- 13. Organizer & Venue Details ---- */
    const eventDate = d.student.date || d.event.event_date || "14 November 2026";
    doc.font("Times-Roman").fontSize(9.8).fillColor("#222222");
    doc.text(`organized by the Nature Club, Aurora Deemed-to-be-University, Bhongir Campus,`, 60, y, { width: W - 120, align: "center" });
    y += 13;
    doc.text(`on ${eventDate} at the University Seminar Hall.`, 60, y, { width: W - 120, align: "center" });
    y += 18;

    /* ---- 14. Activities Bullet Line ---- */
    doc.font("Helvetica").fontSize(7.5).fillColor(GREEN);
    doc.text("Eco Rapid-Fire Quiz   •   Plastic-Free Challenge   •   Environmental Dumb Charades   •   Eco Innovation Challenge",
      60, y, { width: W - 120, align: "center", characterSpacing: 0.3 });
    y += 15;

    /* ---- 15. Tagline Banner ---- */
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GREEN);
    doc.text("BE AWARE   •   REDUCE   •   ACT   •   MAKE A DIFFERENCE",
      60, y, { width: W - 120, align: "center", characterSpacing: 2.2 });

    /* ---- 16. Footer: Signatures + Technology Partner Logo ---- */
    const niatPath = path.join(__dirname, "public", "niat_icon.png");
    const niatBuf = fs.existsSync(niatPath) ? fs.readFileSync(niatPath) : null;

    // Technology Partner Center Block
    doc.font("Helvetica-Bold").fontSize(6.8).fillColor("#222222");
    doc.text("TECHNOLOGY PARTNER", cx - 80, H - 76, { width: 160, align: "center", characterSpacing: 1.2 });
    if (niatBuf) {
      try {
        doc.image(niatBuf, cx - 11, H - 64, { width: 22, height: 22 });
      } catch {}
    }

    // Optional Signatures on Left & Right
    const sigY = H - 68;
    const sigW = 120;
    const putSig = (buf, xc, role, fallback) => {
      if (!buf && !role) return;
      if (buf) {
        try { doc.image(buf, xc - sigW / 2, sigY - 36, { fit: [sigW, 34], align: "center", valign: "bottom" }); }
        catch {}
      }
      doc.moveTo(xc - sigW / 2 + 5, sigY).lineTo(xc + sigW / 2 - 5, sigY)
         .lineWidth(0.9).strokeColor(hex(TEXT_MUTED)).stroke();
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEXT_BLACK);
      doc.text(role || fallback, xc - sigW / 2, sigY + 3, { width: sigW, align: "center" });
      if (role && role !== fallback) {
        doc.font("Helvetica").fontSize(6.5).fillColor(TEXT_MUTED);
        doc.text(fallback, xc - sigW / 2, sigY + 12, { width: sigW, align: "center" });
      }
    };

    putSig(d.sig1Buf, mIn + 70, d.event.sig1_role, "Faculty Coordinator");
    putSig(d.sig2Buf, W - mIn - 70, d.event.sig2_role, "Principal");

    /* End of document (NO QR code) */
    doc.end();
  });
}

module.exports = { certCSS, renderCertHTML, generatePDF, ACFG, esc };
