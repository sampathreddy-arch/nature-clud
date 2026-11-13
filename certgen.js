/* ============================================================
   certgen.js — Official Eco Games certificate rendering
   Template-based generation (pdf-lib):
   the three uploaded Aurora / Nature Club certificate PDFs are
   used as-is as page backgrounds; only the student fields,
   certificate ID and signature areas are drawn on top.

   Templates (copies of the uploaded originals, never modified):
     templates/Eco_Games_Winner.pdf          (CERTIFICATE OF ACHIEVEMENT — Winner)
     templates/Eco_Games_Runner_Up.pdf       (CERTIFICATE OF ACHIEVEMENT — Runner-up)
     templates/Eco_Games_Participation.pdf   (CERTIFICATE OF PARTICIPATION)

   The uploaded Winner and Runner-up PDFs contain overlapping text
   (a leftover "OF PARTICIPATION" subtitle and the participation
   recognition sentence) — both are covered with a background patch
   and re-drawn correctly at the same design position.

   Published certificates include a QR code that opens the student's
   direct download endpoint. It does not point to a verification endpoint.
   ============================================================ */
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

/* ---------------- palette (sampled from the official templates) ---------------- */
const MAROON     = "#A81C4A";  // Aurora maroon — big word, name rule
const GREEN_SUB  = "#1B5E20";  // forest green — subtitle, NATURE CLUB PRESENTS, footer
const GREEN_TITLE= "#2E7D32";  // bright green — event title
const BODY       = "#2B2B2B";  // body text
const BG_CREAM   = "#FFFDF7";  // template ivory background

/* ---------------- certificate categories ---------------- */
/* Exactly three official categories. Legacy categories stored in the
   database (First Prize / Second Prize / Third Prize) are mapped to the
   closest official template at render time; stored records are untouched. */
const CATEGORIES = ["Winner", "Runner-up", "Participation"];

const TEMPLATES = {
  Winner: {
    file: "Eco_Games_Winner.pdf",
    sub: "OF ACHIEVEMENT",
    recognition: "In recognition of outstanding performance and securing the Winner position in",
    fixOverlay: true,
  },
  "Runner-up": {
    file: "Eco_Games_Runner_Up.pdf",
    sub: "OF ACHIEVEMENT",
    recognition: "In recognition of excellent performance and securing the Runner-up position in",
    fixOverlay: true,
  },
  Participation: {
    file: "Eco_Games_Participation.pdf",
    sub: "OF PARTICIPATION",
    recognition: "In recognition of enthusiastic and active participation in",
    fixOverlay: false,
  },
};

function normaliseCategory(cat) {
  const k = String(cat || "").trim().toLowerCase();
  if (["winner", "first prize", "first", "1st"].includes(k)) return "Winner";
  if (["runner-up", "runner up", "runnerup", "second prize", "second", "2nd"].includes(k)) return "Runner-up";
  if (["participation", "participant", "third prize", "third", "3rd"].includes(k)) return "Participation";
  return null;
}

/* ---------------- template geometry (points, y measured from page bottom) ---------------- */
const PAGE_W = 841.89, PAGE_H = 595.28;
const CX = PAGE_W / 2;
const G = {
  certWord:   { y: 457.3, size: 44 },                    // CERTIFICATE
  headerMain: { y: 545.5, size: 10.5 },                  // university name
  headerSub:  { y: 536.8, size: 9.6 },                   // official accreditation line
  headerSite: { y: 525.3, size: 9.5 },                   // website, below the accreditation line
  subWord:    { y: 435.3, size: 12.5, targetW: 193.1 },  // green subtitle line
  goldLine:   { y: 423.2, x0: 330.5, x1: 511.0 },        // gold separator (in template)
  presented:  { y: 400.3, size: 14 },
  nameRule:   { y: 355.3, x0: 170, x1: 672 },            // maroon rule (in template)
  name:       { y: 367.0, maxW: 496, maxSize: 30, minSize: 12 },
  yearBlank:  { x0: 263.0, x1: 329.5 },                  // year blank line [261..331.5]
  deptBlank:  { x0: 453.5, x1: 620.0 },                  // dept blank line [451.5..622]
  metaRow:    { y: 325.3, size: 13 },
  recognition:{ y: 293.3, size: 13.5, coverTop: 309, coverBottom: 285 },
  eventTitle: { y: 261.3, size: 24, targetW: 452.0 },
  orgLine:    { y: 231.3, size: 13 },
  dateLine:   { y: 214.3, size: 13 },
  activities: { y: 189.3, size: 8.5 },
  tagline:    { y: 161.3, size: 8.5, targetW: 322.3 },
  certId:     { x: 90, y: 44, size: 7.5 },               // bottom-left corner (away from the partner shield)
  sigLine:    { y: 90 }, sigRole: { y: 80 }, sigBlockW: 130,
};
/* overlay patch regions used to erase the duplicated text in the
   uploaded Winner / Runner-up files (subtitle + recognition lines) */
const PATCH_SUB = { x: 296, y: 427.5, w: 250, h: 24.5 };
const PATCH_RECOG = { x: 238, y: 285, w: 384, h: 24 };
/* The source design carries two raster header lines below the academy name:
   "(Deemed-to-be-University, Estd. u/s 33 of UGC Act 1956)" (y≈536.8) and
   "Bhongir, Yadadri, Telangana | www.aurora.edu.in" (y≈525.3). They are part
   of the artwork image, so both are masked on generated copies (measured
   glyph bands: 533.5–544.8 and 523–533; academy line starts at 545.3 and
   NATURE CLUB text at 512.5 — the patch sits between those) and the campus
   location is dropped: the institutional line and the site URL are
   re-typeset in their place. */
const PATCH_CAMPUS = { x: 285, y: 521, w: 272, h: 23.8 };
const INST_LINE = "(Deemed-to-be-University, Estd. u/s 33 of UGC Act 1956)";
const INST_INK = "#5A3431";
const TEMPLATE_DATE = "14 November 2026";
const TEMPLATE_TITLE = "ECO GAMES – PLAY FOR THE PLANET";

/* ---------------- helpers ---------------- */
const hexRGB = (h) => rgb(
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255
);
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* make a string safe for the standard PDF fonts (WinAnsi) */
function win(s) {
  return String(s ?? "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

const templateCache = new Map();
function loadTemplateBytes(file) {
  if (!templateCache.has(file)) {
    templateCache.set(file, fs.readFileSync(path.join(__dirname, "templates", file)));
  }
  return templateCache.get(file);
}

/* font-width measuring (shared by PDF + HTML preview so both fit alike) */
let METRICS = null;
async function getFontMetrics() {
  if (!METRICS) {
    const doc = await PDFDocument.create();
    const fonts = {};
    for (const name of ["TimesRomanBold", "TimesRoman", "TimesRomanItalic", "HelveticaBold", "Helvetica"]) {
      fonts[name] = await doc.embedFont(StandardFonts[name]);
    }
    METRICS = { fonts };
  }
  return { w: (name, size, text) => METRICS.fonts[name].widthOfTextAtSize(text, size) };
}

async function fitSize(getW, fontName, text, maxSize, minSize, maxW) {
  let size = maxSize;
  while (size > minSize && getW(fontName, size, text) > maxW) size -= 0.5;
  return size;
}
function fitSizeSync(M, fontName, text, maxSize, minSize, maxW) {
  let size = maxSize;
  while (size > minSize && M.w(fontName, size, text) > maxW) size -= 0.5;
  return size;
}

/* ================================================================
   PDF GENERATION — official template + dynamic overlay
   ================================================================ */
async function generatePDF(d) {
  const cat = normaliseCategory(d.category) || "Participation";
  const T = TEMPLATES[cat];

  const pdf = await PDFDocument.load(loadTemplateBytes(T.file));
  const page = pdf.getPage(0);
  const { w: gw } = await getFontMetrics();

  const timesBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesRoman = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  const drawCentered = (text, font, size, y, color, opts = {}) => {
    const cs = opts.charSpacing || 0;
    page.drawText(text, {
      x: CX - (font.widthOfTextAtSize(text, size) + cs * Math.max(0, text.length - 1)) / 2,
      y, size, font, color, ...(cs ? { characterSpacing: cs } : {}),
    });
  };
  /* pdf-lib drawText has no letter-spacing option — draw char by char to
     reproduce the template's letterspaced style exactly */
  const drawSpaced = (text, font, size, y, color, charSpacing) => {
    const cs = charSpacing || 0;
    let x = CX - (font.widthOfTextAtSize(text, size) + cs * Math.max(0, text.length - 1)) / 2;
    for (const ch of text) {
      page.drawText(ch, { x, y, size, font, color });
      x += font.widthOfTextAtSize(ch, size) + cs;
    }
  };
  const drawCenteredIn = (text, font, size, y, color, x0, x1) => {
    page.drawText(text, {
      x: (x0 + x1) / 2 - font.widthOfTextAtSize(text, size) / 2,
      y, size, font, color,
    });
  };
  /* character spacing that stretches text to a target width (matches template look) */
  const spreadTo = (text, font, size, targetW) => {
    const nat = font.widthOfTextAtSize(text, size);
    const cs = (targetW - nat) / Math.max(1, text.length - 1);
    return cs > 0 ? cs : 0;
  };
  const patch = (p) => page.drawRectangle({ x: p.x, y: p.y, width: p.w, height: p.h, color: hexRGB(BG_CREAM) });

  /* Mask the raster header lines (institution line + campus location line)
     in the artwork and re-typeset them without the campus location. Only
     generated copies are patched; the source PDFs stay untouched. */
  patch(PATCH_CAMPUS);
  drawCentered(INST_LINE, helvBold, G.headerSub.size, G.headerSub.y, hexRGB(INST_INK));
  drawCentered("www.aurora.edu.in", helvBold, G.headerSite.size, G.headerSite.y, hexRGB(INST_INK));

  /* ---- 1. Fix the overlapping heading & recognition text (Winner / Runner-up) ---- */
  if (T.fixOverlay) {
    patch(PATCH_SUB);     // erases duplicated "OF PARTICIPATION" + category word
    drawSpaced(T.sub, helvBold, G.subWord.size, G.subWord.y, hexRGB(GREEN_SUB),
      spreadTo(T.sub, helvBold, G.subWord.size, G.subWord.targetW));
  }
  /* Re-typeset the recognition line for every template so capitalization and
     category wording agree between Winner, Runner-up, and Participation. */
  patch(PATCH_RECOG);
  drawCentered(win(T.recognition), timesRoman, G.recognition.size, G.recognition.y, hexRGB(BODY));
  /* Add sentence punctuation to the event title already printed in the art. */
  page.drawText(".", { x: 650.5, y: G.eventTitle.y, size: G.eventTitle.size, font: timesBold, color: hexRGB(GREEN_TITLE) });

  /* ---- 2. Event date (only if it differs from the one printed in the template) ---- */
  const evDate = win(d.event.event_date || TEMPLATE_DATE) || TEMPLATE_DATE;
  if (evDate && evDate !== TEMPLATE_DATE) {
    page.drawRectangle({ x: 265, y: 210, width: 320, height: 10, color: hexRGB(BG_CREAM) });
    drawCentered(`on ${evDate} at the University Seminar Hall.`, timesRoman, G.dateLine.size, G.dateLine.y, hexRGB(BODY));
  }

  /* ---- 3. Recipient name above the maroon rule (shrink-to-fit, no overlap) ---- */
  const name = win(d.student.name) || "Student Name";
  const nameSize = await fitSize(gw, "TimesRomanBold", name, G.name.maxSize, G.name.minSize, G.name.maxW);
  drawCentered(name, timesBold, nameSize, G.name.y, hexRGB("#1F1F1F"));

  /* ---- 4. B.Tech year + department on the template blanks ---- */
  const year = win(d.student.year);
  if (year) {
    const s = await fitSize(gw, "TimesRoman", year, G.metaRow.size, 6, G.yearBlank.x1 - G.yearBlank.x0);
    drawCenteredIn(year, timesRoman, s, G.metaRow.y, hexRGB(BODY), G.yearBlank.x0, G.yearBlank.x1);
  }
  const dept = win(d.student.department);
  if (dept) {
    const s = await fitSize(gw, "TimesRoman", dept, G.metaRow.size, 6, G.deptBlank.x1 - G.deptBlank.x0);
    drawCenteredIn(dept, timesRoman, s, G.metaRow.y, hexRGB(BODY), G.deptBlank.x0, G.deptBlank.x1);
  }

  /* ---- 5. Signature areas (bottom band, left & right of the partner logo) ---- */
  const putSig = async (buf, cx, role, fallback) => {
    const r = win(role || "");
    if (!buf && !r) return;
    if (buf) {
      try {
        const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
        const img = isPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
        const scale = Math.min(120 / img.width, 34 / img.height);
        page.drawImage(img, {
          x: cx - (img.width * scale) / 2,
          y: G.sigLine.y + 2,
          width: img.width * scale,
          height: img.height * scale,
        });
      } catch { /* unsupported image type — line & role still drawn */ }
    }
    page.drawLine({
      start: { x: cx - G.sigBlockW / 2 + 5, y: G.sigLine.y },
      end: { x: cx + G.sigBlockW / 2 - 5, y: G.sigLine.y },
      thickness: 0.9, color: hexRGB("#555555"),
    });
    drawCenteredIn(r || fallback, helvBold, 7.5, G.sigRole.y, hexRGB(BODY), cx - G.sigBlockW / 2, cx + G.sigBlockW / 2);
    if (r && fallback && r !== fallback) {
      drawCenteredIn(win(fallback), helv, 6.5, G.sigRole.y - 9, hexRGB("#666666"), cx - G.sigBlockW / 2, cx + G.sigBlockW / 2);
    }
  };
  await putSig(d.sig1Buf, CX - 181, d.event.sig1_role, "Faculty Coordinator");
  await putSig(d.sig2Buf, CX + 181, d.event.sig2_role, "Principal");

  /* ---- 6. Unique certificate ID (bottom-left) ---- */
  if (d.certUid) {
    page.drawText(`Certificate ID: ${win(d.certUid)}`, {
      x: G.certId.x, y: G.certId.y, size: G.certId.size, font: helv, color: hexRGB("#6B6B6B"),
    });
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

/* ================================================================
   HTML PREVIEW — faithful replica of the official template layout
   (same geometry constants as the PDF overlay, positioned in pt)
   ================================================================ */
function certCSS() {
  return `
@page{size:A4 landscape;margin:0}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#3a4d3a;font-family:'Times New Roman',Times,serif;color:${BODY}}
.cert{position:relative;width:${PAGE_W}pt;height:${PAGE_H}pt;margin:12px auto;background:${BG_CREAM};overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.abs{position:absolute;left:0;right:0;text-align:center;line-height:1;white-space:nowrap}
.leaf{position:absolute;width:44pt;height:44pt;object-fit:contain;z-index:3}
.leaf.tl{top:20pt;left:20pt}.leaf.tr{top:20pt;right:20pt;transform:scaleX(-1)}
.leaf.bl{bottom:20pt;left:20pt;transform:scaleY(-1)}.leaf.br{bottom:20pt;right:20pt;transform:scale(-1,-1)}
.wm{position:absolute;top:112pt;left:78pt;height:36pt;object-fit:contain}
.emblem{position:absolute;top:96pt;right:78pt;height:52pt;object-fit:contain}
.inst1{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:10.5pt;color:#1F1F1F;letter-spacing:.3pt}
  .inst2{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:${G.headerSub.size}pt;color:#5A3431}
  .inst3{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:${G.headerSite.size}pt;color:#5A3431}
.nature{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:9.5pt;letter-spacing:3.6pt;color:${GREEN_SUB}}
.certword{font-size:44pt;font-weight:bold;letter-spacing:10pt;color:${MAROON};text-indent:10pt}
.subtitle{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:12.5pt;color:${GREEN_SUB};letter-spacing:5pt;text-indent:5pt}
.goldsep{position:absolute;left:${G.goldLine.x0}pt;width:${(G.goldLine.x1 - G.goldLine.x0).toFixed(1)}pt;top:${(PAGE_H - G.goldLine.y).toFixed(1)}pt;height:0;border-top:1.1pt solid #BF9130}
.goldsep::after{content:'';position:absolute;left:50%;top:-2.6pt;margin-left:-2.6pt;width:5.2pt;height:5.2pt;border-radius:50%;background:#BF9130}
.presented{font-style:italic;font-size:14pt;color:${BODY}}
.sname{font-weight:bold;font-size:30pt;color:#1F1F1F}
.namerule{position:absolute;left:${G.nameRule.x0}pt;width:${(G.nameRule.x1 - G.nameRule.x0).toFixed(1)}pt;top:${(PAGE_H - G.nameRule.y).toFixed(1)}pt;border-top:1.1pt solid ${MAROON}}
.meta{font-size:13pt;color:${BODY}}
.meta .seg{position:absolute;white-space:nowrap}
.recog{font-size:13.5pt;color:${BODY}}
.evtitle{font-weight:bold;font-size:24pt;letter-spacing:2.7pt;text-indent:2.7pt;color:${GREEN_TITLE}}
.orgline,.dateline{font-size:13pt;color:${BODY}}
.acts{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:${GREEN_SUB}}
.tagline{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:8.5pt;letter-spacing:3.4pt;text-indent:3.4pt;color:${GREEN_SUB}}
.certid{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#6B6B6B;letter-spacing:.4pt}
.tech{font-family:'Times New Roman',serif;font-weight:bold;font-size:10.5pt;letter-spacing:.6pt;color:#1F1F1F}
.niat{object-fit:fill;display:block;clip-path:polygon(0 0,100% 0,100% 62%,92% 77%,78% 89%,50% 100%,22% 89%,8% 77%,0 62%)}
.sig{position:absolute;width:${G.sigBlockW}pt;text-align:center}
.sig img{max-width:100%;max-height:30pt;object-fit:contain;margin-bottom:-2pt}
.sig .sline{border-top:.9pt solid #555;margin:2pt 4pt 0}
.sig .srole{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:7.5pt;color:${BODY};margin-top:2pt}
.sig .ssub{font-family:Arial,Helvetica,sans-serif;font-size:6.5pt;color:#666;margin-top:1.5pt}
@media print{body{background:#fff}.cert{margin:0;box-shadow:none;page-break-after:always}.cert:last-child{page-break-after:auto}}
`;
}

/* baseline (PDF, from bottom) -> CSS top (from page top) for a line of font-size s */
const top = (y, s) => (PAGE_H - y - s * 0.8).toFixed(2) + "pt";

function renderCertHTML(d) {
  const cat = normaliseCategory(d.category) || "Participation";
  const T = TEMPLATES[cat];

  const eventDate = d.event.event_date || TEMPLATE_DATE;
  const name = win(d.student.name) || "Student Name";
  const year = win(d.student.year);
  const dept = win(d.student.department);
  const M = getFontMetricsSync(); // sync cached metrics (available after first PDF gen)

  const nameSize = M ? fitSizeSync(M, "TimesRomanBold", name, G.name.maxSize, G.name.minSize, G.name.maxW) : G.name.maxSize;
  const yearSize = year && M ? fitSizeSync(M, "TimesRoman", year, G.metaRow.size, 6, G.yearBlank.x1 - G.yearBlank.x0) : G.metaRow.size;
  const deptSize = dept && M ? fitSizeSync(M, "TimesRoman", dept, G.metaRow.size, 6, G.deptBlank.x1 - G.deptBlank.x0) : G.metaRow.size;

  /* letter-spacing stretched to the same line widths as the template (PDF parity) */
  const spread = (fontName, size, text, targetW, fallback) => {
    if (!M) return fallback;
    const nat = M.w(fontName, size, text);
    const cs = (targetW - nat) / Math.max(1, text.length - 1);
    return (cs > 0 ? cs : 0).toFixed(2) + "pt";
  };
  const subCs = spread("HelveticaBold", 12.5, T.sub, G.subWord.targetW, "5pt");
  const certCs = spread("TimesRomanBold", 44, "CERTIFICATE", 365.6, "10pt");
  const evCs = spread("TimesRomanBold", 24, d.event.title || TEMPLATE_TITLE, G.eventTitle.targetW, "2.7pt");
  const tagCs = spread("HelveticaBold", 8.5, "BE AWARE • REDUCE • ACT • MAKE A DIFFERENCE", G.tagline.targetW, "3.4pt");

  const sigBlock = (buf, role, fallback, cx) => {
    const r = win(role || "");
    if (!buf && !r) return "";
    return `<div class="sig" style="left:${(cx - G.sigBlockW / 2).toFixed(1)}pt;top:${(PAGE_H - 124).toFixed(1)}pt">
      ${buf ? `<img src="${buf}" alt="signature">` : ""}
      <div class="sline"></div>
      <div class="srole">${esc(r || fallback)}</div>
      ${r && fallback && r !== fallback ? `<div class="ssub">${esc(fallback)}</div>` : ""}
    </div>`;
  };

  return `
<div class="cert" data-cert="${esc(d.certUid)}">
  <img class="leaf tl" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">
  <img class="leaf tr" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">
  <img class="leaf bl" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">
  <img class="leaf br" src="/leaf_corner_tri.png" alt="" onerror="this.style.display='none'">

  <img class="wm" src="${d.logo || "/aurora_wordmark.png"}" alt="Aurora Deemed-to-be-University" onerror="this.style.display='none'">
  <img class="emblem" src="/aurora_emblem.png" alt="Aurora emblem" onerror="this.style.display='none'">

  <div class="abs inst1" style="top:${top(G.headerMain.y, G.headerMain.size)};transform:scaleX(.72)">AURORA HIGHER EDUCATION AND RESEARCH ACADEMY</div>
  <div class="abs inst2" style="top:${top(G.headerSub.y, G.headerSub.size)}">${esc(INST_LINE)}</div>
  <div class="abs inst3" style="top:${top(G.headerSite.y, G.headerSite.size)}">www.aurora.edu.in</div>

  <div class="abs nature" style="top:${top(G.certWord.y + 48, 9.5)}">NATURE CLUB PRESENTS</div>
  <div class="abs certword" style="top:${top(G.certWord.y, 44)};letter-spacing:${certCs};text-indent:${certCs}">CERTIFICATE</div>
  <div class="abs subtitle" style="top:${top(G.subWord.y, 12.5)};letter-spacing:${subCs};text-indent:${subCs}">${esc(T.sub)}</div>
  <div class="goldsep"></div>

  <div class="abs presented" style="top:${top(G.presented.y, 14)}">This certificate is proudly presented to</div>
  <div class="abs sname" style="top:${top(G.name.y, nameSize)};font-size:${nameSize}pt">${esc(name)}</div>
  <div class="namerule"></div>

  <div class="meta">
    <span class="seg" style="left:220.3pt;top:${top(G.metaRow.y, 13)}">B.Tech</span>
    <span class="seg" style="left:${G.yearBlank.x0}pt;width:${(G.yearBlank.x1 - G.yearBlank.x0).toFixed(1)}pt;top:${top(G.metaRow.y, yearSize)};text-align:center;font-size:${yearSize}pt">${esc(year || "")}</span>
    <span class="seg" style="left:334.7pt;top:${top(G.metaRow.y, 13)}">Year,</span>
    <span class="seg" style="left:372.9pt;top:${top(G.metaRow.y, 13)}">Department of</span>
    <span class="seg" style="left:${G.deptBlank.x0}pt;width:${(G.deptBlank.x1 - G.deptBlank.x0).toFixed(1)}pt;top:${top(G.metaRow.y, deptSize)};text-align:center;font-size:${deptSize}pt">${esc(dept || "")}</span>
  </div>

  <div class="abs recog" style="top:${top(G.recognition.y, 13.5)}">${esc(T.recognition)}</div>
  <div class="abs evtitle" style="top:${top(G.eventTitle.y, 24)};letter-spacing:${evCs};text-indent:${evCs}">${esc(d.event.title || TEMPLATE_TITLE)}.</div>

  <div class="abs orgline" style="top:${top(G.orgLine.y, 13)}">organized by the Nature Club, Aurora Deemed-to-be-University,</div>
  <div class="abs dateline" style="top:${top(G.dateLine.y, 13)}">on ${esc(eventDate)} at the University Seminar Hall.</div>

  <div class="abs acts" style="top:${top(G.activities.y, 8.5)}">Eco Rapid-Fire Quiz&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;Plastic-Free Challenge&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;Environmental Dumb Charades&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;Eco Innovation Challenge</div>
  <div class="abs tagline" style="top:${top(G.tagline.y, 8.5)};letter-spacing:${tagCs};text-indent:${tagCs}">BE AWARE&nbsp;&nbsp;•&nbsp;&nbsp;REDUCE&nbsp;&nbsp;•&nbsp;&nbsp;ACT&nbsp;&nbsp;•&nbsp;&nbsp;MAKE A DIFFERENCE</div>

  <div class="abs tech" style="top:${top(107, 10.5)}">TECHNOLOGY PARTNER</div>
  <img class="niat" src="/niat_icon.png" alt="NIAT Technology Partner shield" style="position:absolute;left:${CX - 14}pt;top:${(PAGE_H - 50 - 35).toFixed(2)}pt;width:28pt;height:35pt" onerror="this.style.display='none'">

  ${sigBlock(d.sig1, d.event.sig1_role, "Faculty Coordinator", CX - 181)}
  ${sigBlock(d.sig2, d.event.sig2_role, "Principal", CX + 181)}

  ${d.certUid ? `<div class="certid" style="position:absolute;left:${G.certId.x}pt;top:${top(G.certId.y, G.certId.size)}">Certificate ID: ${esc(d.certUid)}</div>` : ""}
</div>`;
}

/* ---- synchronous metric access for the HTML preview (after warm-up) ---- */
function getFontMetricsSync() {
  return METRICS ? { w: (name, size, text) => METRICS.fonts[name].widthOfTextAtSize(text, size) } : null;
}
/* warm the metric cache so HTML previews have exact fit sizes even before any PDF is made */
(async () => { try { await getFontMetrics(); } catch { /* metrics stay optional */ } })();

module.exports = { certCSS, renderCertHTML, generatePDF, CATEGORIES, TEMPLATES, normaliseCategory, esc };
