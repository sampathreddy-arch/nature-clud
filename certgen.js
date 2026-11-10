/* ============================================================
   certgen.js — Certificate rendering (HTML preview + PDF)
   Shared by admin preview, student portal and downloads.
   ============================================================ */
const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const GREEN = "#1f5c36", GREEN2 = "#2e7d4f", GOLD = "#b8860b";

/* find a nicer script font on Windows, fallback handled by caller */
function findFont() {
  const cands = ["segoescb.ttf", "segoesc.ttf", "BRUSHSCI.TTF", "MTCORSVA.TTF", "bradhitc.ttf"];
  for (const f of cands) {
    const p = path.join("C:\\Windows\\Fonts", f);
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

const ACFG = {
  "Participation": { sub: "OF PARTICIPATION", badge: "Participation", emoji: ""             },
  "First Prize":   { sub: "OF EXCELLENCE",    badge: "First Prize",   emoji: "\u{1F3C6}"    },
  "Second Prize":  { sub: "OF EXCELLENCE",    badge: "Second Prize",  emoji: "\u{1F948}"    },
  "Third Prize":   { sub: "OF EXCELLENCE",    badge: "Third Prize",   emoji: "\u{1F949}"    }
};

/* ---------------- HTML preview (screen) ---------------- */
function certCSS() {
  return `
@page{size:A4 landscape;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#3a4d3a;font-family:Georgia,'Times New Roman',serif}
.cert{width:297mm;height:210mm;margin:12px auto;position:relative;background:#fffdf5;color:#2b3a2b;overflow:hidden;
 border:6px solid ${GREEN};outline:4px solid #fffdf5;outline-offset:-14px;
 background-image:radial-gradient(ellipse at 8% 8%,#f2fbee 0%,rgba(255,253,245,0) 55%),radial-gradient(ellipse at 92% 92%,#f2fbee 0%,rgba(255,253,245,0) 55%)}
.corn{position:absolute;font-size:52px;color:${GREEN2};opacity:.9;line-height:1;z-index:3}
.corn.tl{top:22px;left:26px;transform:rotate(-8deg)}.corn.tr{top:22px;right:26px;transform:rotate(8deg)}
.corn.bl{bottom:22px;left:26px;transform:rotate(8deg)}.corn.br{bottom:22px;right:26px;transform:rotate(-8deg)}
.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:300px;color:${GREEN2};opacity:.055;z-index:1;transform:rotate(-12deg)}
.inner{position:absolute;inset:16px;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px 60px}
.logo{height:64px;margin-bottom:2px}
.institute{font-size:22px;font-weight:bold;letter-spacing:2px;color:${GREEN};text-transform:uppercase}
.organiser{font-size:13px;letter-spacing:4px;color:#6b7d6b;text-transform:uppercase;margin-top:3px}
.divider{width:420px;height:2px;background:linear-gradient(90deg,transparent,${GOLD},transparent);margin:11px 0}
.cert-word{font-size:54px;letter-spacing:14px;color:${GREEN};margin-top:2px;font-weight:bold}
.cert-sub{font-size:18px;letter-spacing:6px;color:${GOLD};text-transform:uppercase;margin-bottom:9px}
.intro{font-size:15px;font-style:italic;color:#4a5d4a}
.recipient{font-family:'Segoe Script','Brush Script MT',Georgia,cursive;font-size:44px;color:${GREEN};margin:3px 0 2px;font-weight:bold}
.nameline{width:520px;height:2px;background:${GOLD};margin-bottom:11px}
.body-text{font-size:14px;line-height:1.5;color:#3c4d3c;max-width:760px}
.event-name{font-size:1.45em;font-weight:bold;color:#b0720a;letter-spacing:1px}
.award-badge{display:inline-flex;align-items:center;gap:8px;margin-top:9px;padding:7px 32px;border-radius:60px;
 background:linear-gradient(180deg,${GREEN2},${GREEN});color:#fff8e1;font-size:15px;letter-spacing:3px;text-transform:uppercase;font-weight:bold}
.team-chip{display:inline-block;margin-top:9px;padding:5px 24px;border:1.5px solid ${GREEN2};border-radius:40px;color:${GREEN};font-size:13px;letter-spacing:1.5px;background:#f2fbee}
.signrow{margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:flex-end;padding:0 30px}
.sign{text-align:center;width:220px}
.sign img{height:52px;margin-bottom:-4px;object-fit:contain}
.sign .line{border-top:1.6px solid #4a5d4a;margin-bottom:5px}
.sign .role{font-size:12px;font-weight:bold;color:#2b3a2b}
.sign .sub{font-size:10.5px;color:#6b7d6b}
.idline{position:absolute;bottom:32px;left:56px;font-size:11px;color:#7a8b7a;z-index:2}
.idline b{color:${GREEN2}}
.footline{position:absolute;bottom:32px;left:0;right:0;text-align:center;font-size:11px;color:#7a8b7a;z-index:2}
.footwrap{position:absolute;bottom:30px;right:56px;text-align:center;z-index:2}
.footwrap img{width:66px;height:66px;display:block}
.footwrap span{font-size:8.5px;color:#7a8b7a;letter-spacing:.5px}
@media print{body{background:#fff}.cert{margin:0;page-break-after:always}.cert:last-child{page-break-after:auto}}
`;
}

function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/**
 * data = { certUid, category, student:{name,roll_number,department,year},
 *          event:{institute?,title,event_date,organiser,motto,issued_line},   // institute text passes through event
 *          logo: dataURL|null, sig1: dataURL|null, sig2: dataURL|null,
 *          qr: dataURL (verification QR), verifyUrl }
 */
function renderCertHTML(d) {
  const a = ACFG[d.category] || ACFG.Participation;
  const winner = d.category !== "Participation";
  const heading = d.event.heading || "CERTIFICATE";
  const intro = d.event.intro || "This certificate is proudly presented to";
  let ach = winner ? `for securing the <b>${esc(d.category)}</b>`
                   : "for active and enthusiastic participation";
  if (d.student.year) ach += ` (${esc(d.student.year)})`;

  const verUrl = esc(d.verifyUrl || "");
  const sigBlock = (img, role, fallback) =>
    `<div class="sign">${img ? `<img src="${img}" alt="">` : ""}<div class="line"></div><div class="role">${esc(role || fallback)}</div><div class="sub">${esc(fallback)}</div></div>`;

  return `<div class="cert" data-cert="${esc(d.certUid)}">
  <div class="watermark">🌿</div>
  <div class="corn tl">🌿</div><div class="corn tr">🌳</div><div class="corn bl">🌱</div><div class="corn br">🍁</div>
  <div class="inner">
    ${d.logo ? `<img class="logo" src="${d.logo}" alt="logo">` : ""}
    <div class="institute">${esc(d.event.institute)}</div>
    <div class="organiser">Organised by ${esc(d.event.organiser)}</div>
    <div class="divider"></div>
    <div class="cert-word">${esc(heading)}</div>
    <div class="cert-sub">${a.sub}</div>
    <div class="intro">${esc(intro)}</div>
    <div class="recipient" id="cert-name">${esc(d.student.name)}</div>
    <div class="nameline"></div>
    <div class="body-text">${ach} in &ldquo;<span class="event-name">${esc(d.event.title)}</span>&rdquo; held on ${esc(d.event.event_date)}.</div>
    ${winner ? `<div class="award-badge"><span>${a.emoji}</span> ${esc(a.badge)}</div>` : ""}
    <div class="signrow">
      ${sigBlock(d.sig1, d.event.sig1_role, "Faculty Coordinator")}
      ${sigBlock(d.sig2, d.event.sig2_role, "Principal")}&nbsp;
      <div style="width:132px"></div>
    </div>
  </div>
  <div class="idline">Certificate ID: <b>${esc(d.certUid)}</b>${d.event.issued_line ? ` &nbsp;•&nbsp; ${esc(d.event.issued_line)}` : ""}</div>
  <div class="footline">${esc(d.event.motto || "")}</div>
  <div class="footwrap"><img src="${d.qr}" alt="verify"><span>SCAN TO VERIFY</span></div>
</div>`;
}

/* ---------------- PDF (print-quality A4 landscape) ---------------- */
const PT = 2.83465;                       // 1 mm in points
function hex(h) { return h.replace("#", ""); }

function generatePDF(d) {
  return new Promise((resolve, reject) => {
    const a = ACFG[d.category] || ACFG.Participation;
    const W = 297 * PT, H = 210 * PT;
    const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `Certificate ${d.certUid} - ${d.student.name}`, Author: d.event.organiser } });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const cx = W / 2;
    const scriptFont = findFont();

    /* frame */
    doc.lineWidth(6).rect(10, 10, W - 20, H - 20).stroke(hex(GREEN));
    doc.lineWidth(1.4).rect(20, 20, W - 40, H - 40).stroke(hex(GOLD));

    let y = 34;
    if (d.logoBuf) { doc.image(d.logoBuf, cx - 30, y, { fit: [60, 60], align: "center" }); y += 66; }
    else y += 14;

    const langs = (size, font, color, spacing, text, dy = 0) => {
      doc.font(font).fontSize(size).fillColor(color);
      doc.text(text, 30, y + dy, { width: W - 60, align: "center", characterSpacing: spacing, lineGap: 2 });
    };

    langs(15, "Helvetica-Bold", GREEN, 1.2, d.event.institute.toUpperCase());
    y += 26;
    langs(9, "Helvetica", "#6b7d6b", 3, `ORGANISED BY ${d.event.organiser.toUpperCase()}`);
    y += 20;
    doc.moveTo(cx - 150, y).lineTo(cx + 150, y).lineWidth(1.2).strokeOpacity(0.9).stroke(hex(GOLD));
    y += 14;

    doc.font("Helvetica-Bold").fontSize(30).fillColor(GREEN);
    doc.text(d.event.heading || "CERTIFICATE", 30, y, { width: W - 60, align: "center", characterSpacing: 10 });
    y += 38;
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(GOLD);
    doc.text(a.sub, 30, y, { width: W - 60, align: "center", characterSpacing: 5 });
    y += 26;
    doc.font("Helvetica-Oblique").fontSize(11).fillColor("#4a5d4a");
    doc.text(d.event.intro || "This certificate is proudly presented to", 30, y, { width: W - 60, align: "center" });
    y += 22;

    doc.font(scriptFont || "Times-Bold", 32).fillColor(GREEN);
    doc.text(d.student.name, 30, y, { width: W - 60, align: "center" });
    y += 44;
    doc.moveTo(cx - 210, y).lineTo(cx + 210, y).lineWidth(1.4).stroke(hex(GOLD));
    y += 18;

    let ach = d.category !== "Participation"
      ? `for securing the ${d.category}`
      : "for active and enthusiastic participation";
    if (d.student.year) ach += ` (${d.student.year})`;
    ach += ` in "${d.event.title}" held on ${d.event.event_date}.`;

    doc.font("Helvetica").fontSize(10.5).fillColor("#3c4d3c");
    doc.text(ach, 90, y, { width: W - 180, align: "center", lineGap: 3 });
    y += 46;

    if (d.category !== "Participation") {
      const label = `${a.badge}`.toUpperCase();
      doc.font("Helvetica-Bold").fontSize(10);
      const tw = doc.widthOfString(label) + 46;
      doc.roundedRect(cx - tw / 2, y, tw, 24, 12).fill(hex(GREEN));
      doc.fillColor("#fff8e1").fontSize(10);
      doc.text(label, cx - tw / 2, y + 7.5, { width: tw, align: "center", characterSpacing: 2 });
      y += 36;
    } else y += 6;

    /* signatures row */
    const sy = H - 118;
    const sigW = 150;
    const putSig = (buf, xc, role, fallback) => {
      if (buf) { doc.image(buf, xc - sigW / 2, sy - 46, { fit: [sigW, 44], align: "center", valign: "bottom" }); }
      doc.moveTo(xc - sigW / 2 + 10, sy).lineTo(xc + sigW / 2 - 10, sy).lineWidth(1).strokeColor("#4a5d4a").stroke();
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#2b3a2b");
      doc.text(role || fallback, xc - sigW / 2, sy + 5, { width: sigW, align: "center" });
      doc.font("Helvetica").fontSize(7).fillColor("#6b7d6b");
      doc.text(fallback, xc - sigW / 2, sy + 15, { width: sigW, align: "center" });
    };
    putSig(d.sig1Buf, cx - 210, d.event.sig1_role, "Faculty Coordinator");
    putSig(d.sig2Buf, cx + 210, d.event.sig2_role, "Principal");

    /* footer */
    doc.font("Helvetica").fontSize(8).fillColor("#7a8b7a");
    doc.text(`Certificate ID: ${d.certUid}${d.event.issued_line ? "  •  " + d.event.issued_line : ""}`, 34, H - 44, { width: W - 200, align: "left" });
    doc.text(d.event.motto || "", 30, H - 44, { width: W - 170, align: "center" });

    /* verification QR */
    if (d.qrBuf) {
      doc.image(d.qrBuf, W - 118, H - 112, { fit: [70, 70] });
      doc.font("Helvetica").fontSize(6.5).fillColor("#7a8b7a");
      doc.text("SCAN TO VERIFY", W - 124, H - 38, { width: 82, align: "center" });
    }

    doc.end();
  });
}

module.exports = { certCSS, renderCertHTML, generatePDF, ACFG, esc };
