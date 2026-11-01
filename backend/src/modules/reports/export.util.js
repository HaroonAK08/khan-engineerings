const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
// FreeSerif includes both Urdu/Arabic and Latin glyphs, so mixed strings such
// as a party name plus an Urdu label do not render as missing-glyph boxes.
const URDU_FONT = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf";
const URDU_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

function pdfFont(value, bold = false) {
  return URDU_RE.test(String(value ?? ""))
    ? "Urdu"
    : bold
      ? "Helvetica-Bold"
      : "Helvetica";
}

let cachedLogo;
function companyLogo() {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = fs.readFileSync(path.join(__dirname, "../../assets/logo.png"));
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

function money(n) {
  const num = Number(n || 0);
  const sign = num < 0 ? "-" : "";
  const [intPart, decPart] = Math.abs(num).toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withCommas}.${decPart}`;
}

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

async function workbookToBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

/**
 * @param {string} title
 * @param {string[]} columns
 * @param {Array<Array<string|number>>} rows
 * @param {Record<string, string|number>=} meta
 */
async function buildExcel({ title, sheetName, columns, rows, meta = {}, sections = null }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Khan Engineerings";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName || "Report");

  sheet.addRow([title]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`Generated: ${new Date().toISOString()}`]);
  Object.entries(meta).forEach(([k, v]) => sheet.addRow([`${k}: ${v}`]));
  sheet.addRow([]);

  const tableSections =
    Array.isArray(sections) && sections.length > 0
      ? sections
      : [{ heading: null, columns: columns || [], rows: rows || [] }];

  let maxCols = 0;
  tableSections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) sheet.addRow([]);
    if (section.heading) {
      sheet.addRow([section.heading]);
      sheet.getRow(sheet.rowCount).font = { bold: true, size: 12 };
    }
    const cols = section.columns || [];
    maxCols = Math.max(maxCols, cols.length);
    if (cols.length) {
      sheet.addRow(cols);
      sheet.getRow(sheet.rowCount).font = { bold: true };
    }
    (section.rows || []).forEach((r) => {
      const cells = Array.isArray(r) ? r : r?.cells || [];
      sheet.addRow(cells);
      const rowObj = sheet.getRow(sheet.rowCount);
      if (r && typeof r === "object" && !Array.isArray(r)) {
        if (r.bold) {
          rowObj.font = { bold: true };
        }
        if (r.bg) {
          const hex = r.bg.replace("#", "").toUpperCase();
          rowObj.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: `FF${hex}` },
          };
        }
      }
    });
  });

  const widthSource =
    (tableSections[0] && tableSections[0].columns) || columns || [];
  for (let i = 0; i < Math.max(maxCols, widthSource.length); i += 1) {
    const label = widthSource[i] || `Col ${i + 1}`;
    sheet.getColumn(i + 1).width = Math.min(48, Math.max(12, String(label).length + 4));
  }
  return workbookToBuffer(workbook);
}

/**
 * Multi-sheet workbook for combined reports.
 * @param {{ title: string, sheets: Array<{ sheetName: string, title?: string, columns: string[], rows: any[][], meta?: Record<string, any> }> }} opts
 */
async function buildExcelMulti({ title, sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Khan Engineerings";
  workbook.created = new Date();

  const cover = workbook.addWorksheet("Cover");
  cover.addRow([title || "Combined report"]);
  cover.getRow(1).font = { bold: true, size: 14 };
  cover.addRow([`Generated: ${new Date().toISOString()}`]);
  cover.addRow([`Sections: ${(sheets || []).map((s) => s.sheetName).join(", ")}`]);
  cover.getColumn(1).width = 48;

  for (const section of sheets || []) {
    const name = String(section.sheetName || "Sheet").slice(0, 31) || "Sheet";
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([section.title || name]);
    sheet.getRow(1).font = { bold: true, size: 13 };
    sheet.addRow([`Generated: ${new Date().toISOString()}`]);
    Object.entries(section.meta || {}).forEach(([k, v]) => sheet.addRow([`${k}: ${v}`]));
    sheet.addRow([]);
    const columns = section.columns || [];
    sheet.addRow(columns);
    sheet.getRow(sheet.rowCount).font = { bold: true };
    (section.rows || []).forEach((r) => sheet.addRow(r));
    columns.forEach((_, i) => {
      sheet.getColumn(i + 1).width = Math.min(36, Math.max(12, String(columns[i]).length + 4));
    });
  }

  return workbookToBuffer(workbook);
}

function normalizeWidths(count, ratios) {
  if (!Array.isArray(ratios) || ratios.length !== count) {
    return Array.from({ length: count }, () => 1 / Math.max(count, 1));
  }
  const sum = ratios.reduce((a, b) => a + Number(b || 0), 0) || 1;
  return ratios.map((r) => Number(r || 0) / sum);
}

function cellAlign(aligns, index, defaultAlign = "left") {
  if (!Array.isArray(aligns) || !aligns[index]) return defaultAlign;
  return aligns[index];
}

function isTotalRow(cells) {
  const first = String(cells[0] || "")
    .trim()
    .toLowerCase();
  return first === "total" || first.startsWith("total ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function findChrome() {
  const configured = process.env.CHROME_PATH || "/usr/bin/google-chrome";
  if (fs.existsSync(configured)) return { executablePath: configured, args: [] };

  const chromiumModule = await import("@sparticuz/chromium");
  const chromium = chromiumModule.default || chromiumModule;
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args || [],
  };
}

async function buildPdfWithChrome({
  title,
  subtitle,
  columns,
  rows,
  metaLines = [],
  metaPairs = null,
  sections = null,
  columnWidths = null,
  columnAlign = null,
  theme = "report",
  layout = "portrait",
}) {
  const isLandscape = String(layout).toLowerCase() === "landscape";
  const urduFontPath = require.resolve(
    "@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2"
  );
  const urduFontData = fs.readFileSync(urduFontPath).toString("base64");
  const tableSections =
    Array.isArray(sections) && sections.length > 0
      ? sections
      : [{ heading: null, columns: columns || [], rows: rows || [] }];
  const logo = companyLogo();
  const logoSrc = logo ? `data:image/png;base64,${logo.toString("base64")}` : "";
  const pairs =
    Array.isArray(metaPairs) && metaPairs.length > 0
      ? metaPairs
      : (metaLines || []).map((lineText) => {
          const raw = String(lineText || "");
          const idx = raw.indexOf(":");
          return idx === -1
            ? [raw, ""]
            : [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
        });

  const renderCell = (value, align = "left", header = false) => {
    const text = String(value ?? "");
    const direction = URDU_RE.test(text) ? "rtl" : "ltr";
    return `<${header ? "th" : "td"} dir="auto" style="text-align:${align};direction:${direction}">${escapeHtml(text).replace(/\n/g, "<br>")}</${header ? "th" : "td"}>`;
  };
  const renderRows = (section) =>
    (section.rows || [])
      .map((row, rowIndex) => {
        const cells = Array.isArray(row) ? row : row?.cells || [];
        const bold = Boolean(row && !Array.isArray(row) && row.bold) || isTotalRow(cells);
        const bg = row && !Array.isArray(row) && row.bg ? row.bg : rowIndex % 2 ? "#f8fafb" : "#ffffff";
        const aligns = section.columnAlign || columnAlign || [];
        return `<tr style="background:${escapeHtml(bg)};${bold ? "font-weight:700;" : ""}">${cells
          .map((cell, i) =>
            renderCell(
              cell,
              cellAlign(aligns, i, i >= cells.length - 3 && (section.columns || []).length >= 4 ? "right" : "left")
            )
          )
          .join("")}</tr>`;
      })
      .join("");

  const sectionsHtml = tableSections
    .map((section) => {
      const cols = section.columns || [];
      const widths = normalizeWidths(Math.max(cols.length, 1), section.columnWidths || columnWidths);
      const aligns = section.columnAlign || columnAlign || [];
      return `<section>${section.heading ? `<h3>${escapeHtml(section.heading)}</h3>` : ""}
        <table><colgroup>${widths.map((width) => `<col style="width:${width * 100}%">`).join("")}</colgroup>
        ${cols.length ? `<thead><tr>${cols.map((col, i) => renderCell(col, cellAlign(aligns, i), true)).join("")}</tr></thead>` : ""}
        <tbody>${renderRows(section)}</tbody></table></section>`;
    })
    .join("");

  const metaHtml = pairs.length
    ? `<div class="meta">${pairs
        .map(
          ([key, value]) =>
            `<div><small>${escapeHtml(key)}</small><strong dir="auto">${escapeHtml(value)}</strong></div>`
        )
        .join("")}</div>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:Urdu;src:url(data:font/woff2;base64,${urduFontData}) format("woff2");font-weight:400}
    *{box-sizing:border-box} @page{size:A4 ${isLandscape ? "landscape" : "portrait"};margin:12mm 10mm 15mm}
    body{margin:0;color:#1a1a1a;font-family:Arial,Urdu,sans-serif;font-size:${isLandscape ? 9 : 8.5}pt}
    .top{border-top:3px solid #173c55;padding-top:5px;display:flex;align-items:flex-start;gap:10px}
    .logo{width:32px;height:32px;object-fit:contain}.title{font-size:15pt;font-weight:700;flex:1}
    .stamp{font-size:7pt;color:#5c5c5c;text-align:right}.subtitle{font-size:9pt;color:#5c5c5c;margin:3px 0 12px}
    .meta{display:grid;grid-template-columns:repeat(${Math.min(3, Math.max(1, pairs.length))},1fr);gap:10px;background:#f7f9fa;border:1px solid #d7dee5;border-radius:4px;padding:8px;margin:6px 0 14px}
    .meta small{display:block;color:#5c5c5c;font-size:7pt}.meta strong{display:block;font-size:9pt;margin-top:3px}
    h3{font-size:10pt;background:#e6ecf2;padding:4px 8px;margin:10px 0 5px;border-radius:3px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:12px}
    th,td{border:1px solid #d7dee5;padding:5px;vertical-align:middle;overflow-wrap:anywhere;line-height:1.35}
    th{background:#eceff1;font-weight:700} thead{display:table-header-group} tr{page-break-inside:avoid}
    </style></head><body>
    ${theme === "report" ? `<div class="top">${logoSrc ? `<img class="logo" src="${logoSrc}">` : ""}<div class="title" dir="auto">${escapeHtml(title || "Report")}</div><div class="stamp">Generated ${escapeHtml(new Date().toISOString().slice(0, 16).replace("T", " "))}</div></div>${subtitle ? `<div class="subtitle" dir="auto">${escapeHtml(subtitle)}</div>` : ""}${metaHtml}` : `<h1 dir="auto">${escapeHtml(title || "Report")}</h1>${metaHtml}`}
    ${sectionsHtml}</body></html>`;

  const chrome = await findChrome();
  const puppeteerModule = await import("puppeteer-core");
  const puppeteer = puppeteerModule.default || puppeteerModule;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome.executablePath,
      args: [
      ...chrome.args,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      ],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return Buffer.from(
      await page.pdf({
      format: "A4",
      landscape: isLandscape,
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      })
    );
  } catch (error) {
    console.error("Browser PDF generation failed:", {
      message: error.message,
      name: error.name,
      executablePath: chrome.executablePath,
      vercel: Boolean(process.env.VERCEL),
    });
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function buildPdf(options) {
  try {
    return await buildPdfWithChrome(options);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return buildPdfPdfKit(options);
  }
}

/**
 * Stream a PDF table report into a buffer.
 * Pass either columns+rows, or sections: [{ heading, columns, rows, columnWidths?, columnAlign? }].
 * Options: theme "plain" | "report" (default report), columnWidths, columnAlign, metaPairs, layout.
 * Rows stay on one page (no orphan lines). Oversized item cells split into continuation rows.
 */
function buildPdfPdfKit({
  title,
  subtitle,
  columns,
  rows,
  metaLines = [],
  metaPairs = null,
  sections = null,
  columnWidths = null,
  columnAlign = null,
  theme = "report",
  layout = "portrait",
}) {
  return new Promise((resolve, reject) => {
    const isLandscape = String(layout).toLowerCase() === "landscape";
    const pageMargin = isLandscape ? 28 : 36;
    const footerReserve = 36;
    // Bottom margin must cover the footer band. Writing below PDFKit's bottom
    // margin triggers automatic addPage() and produces blank white pages.
    const doc = new PDFDocument({
      size: "A4",
      layout: isLandscape ? "landscape" : "portrait",
      bufferPages: true,
      autoFirstPage: true,
      margins: {
        top: pageMargin,
        left: pageMargin,
        right: pageMargin,
        bottom: footerReserve,
      },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Urdu", URDU_FONT);
    const originalText = doc.text.bind(doc);
    doc.text = (value, ...args) => {
      if (URDU_RE.test(String(value ?? ""))) {
        doc.font("Urdu");
        return originalText(value, ...args);
      }
      return originalText(value, ...args);
    };

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const usableWidth = right - left;
    const ink = "#1a1a1a";
    const muted = "#5c5c5c";
    const line = "#d7dee5";
    const headerBg = "#eceff1";
    const zebraBg = "#f8fafb";
    const sectionBg = "#e6ecf2";
    const accent = "#173c55";
    const accent2 = "#c2501a";
    const bodySize = isLandscape ? 8.5 : 8;
    const headerSize = isLandscape ? 8.5 : 8;
    const padX = 5;
    const padY = 6;
    const HIGHLIGHT_KEY_RE = /still to (receive|pay)/i;

    function contentBottom() {
      return doc.page.height - doc.page.margins.bottom;
    }

    function remainingSpace() {
      return Math.max(0, contentBottom() - doc.y);
    }

    if (theme === "report") {
      const logo = companyLogo();
      const logoSize = 32;
      const textLeft = logo ? left + logoSize + 10 : left;
      doc.rect(left, pageMargin - 8, usableWidth, 3).fill(accent);
      if (logo) {
        try {
          doc.image(logo, left, pageMargin + 2, { width: logoSize, height: logoSize });
        } catch {
          // Corrupt/unreadable logo asset: fall back to text-only header.
        }
      }
      doc.fillColor(ink);
      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(title || "Report", textLeft, pageMargin + 4, {
          width: usableWidth - (textLeft - left),
          lineBreak: false,
        });
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(muted)
        .text(`Generated ${stamp}`, left, pageMargin + 5, {
          width: usableWidth,
          align: "right",
          lineBreak: false,
        });
      doc.y = pageMargin + 22;
      if (subtitle) {
        doc.font("Helvetica").fontSize(9).fillColor(muted).text(String(subtitle), textLeft, doc.y, {
          width: usableWidth - (textLeft - left),
          lineBreak: false,
        });
      }
      doc.y = Math.max(doc.y + 14, pageMargin + 2 + logoSize + 6);
      doc.fillColor(ink);

      const pairs =
        Array.isArray(metaPairs) && metaPairs.length > 0
          ? metaPairs
          : (metaLines || []).map((lineText) => {
              const raw = String(lineText || "");
              const idx = raw.indexOf(":");
              if (idx === -1) return [raw, ""];
              return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()];
            });

      if (pairs.length > 0) {
        const boxTop = doc.y + 4;
        const colCount = Math.min(3, Math.max(1, pairs.length));
        const colW = usableWidth / colCount;
        const rowH = 28;
        const rowsNeeded = Math.ceil(pairs.length / colCount);
        const boxH = rowsNeeded * rowH + 10;
        doc.roundedRect(left, boxTop, usableWidth, boxH, 4).fill("#f7f9fa");
        doc
          .roundedRect(left, boxTop, usableWidth, boxH, 4)
          .strokeColor(line)
          .lineWidth(0.6)
          .stroke();

        pairs.forEach((pair, i) => {
          const [k, v] = Array.isArray(pair) ? pair : [String(pair), ""];
          const c = i % colCount;
          const r = Math.floor(i / colCount);
          const x = left + 10 + c * colW;
          const y = boxTop + 8 + r * rowH;
          const isHighlight = HIGHLIGHT_KEY_RE.test(String(k));
          doc.font("Helvetica").fontSize(7).fillColor(muted).text(String(k).toUpperCase(), x, y, {
            width: colW - 16,
            lineBreak: false,
          });
          doc
            .font("Helvetica-Bold")
            .fontSize(isHighlight ? 11 : 9)
            .fillColor(isHighlight ? accent2 : ink)
            .text(String(v), x, y + 11, { width: colW - 16, lineBreak: false });
        });
        doc.y = boxTop + boxH + 14;
        doc.fillColor(ink);
      } else {
        doc.y += 10;
      }
    } else {
      doc.fontSize(16).fillColor(ink).text(title, { underline: false });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#555").text(subtitle || "");
      metaLines.forEach((lineText) => doc.text(lineText));
      doc.fillColor("#000");
      doc.moveDown();
    }

    const tableSections =
      Array.isArray(sections) && sections.length > 0
        ? sections
        : [{ heading: null, columns: columns || [], rows: rows || [] }];

    tableSections.forEach((section, sectionIndex) => {
      const cols = section.columns || [];
      const sectionRows = section.rows || [];
      const widths = normalizeWidths(
        Math.max(cols.length, 1),
        section.columnWidths || columnWidths
      ).map((r) => r * usableWidth);
      const aligns = section.columnAlign || columnAlign || null;

      if (sectionIndex > 0) doc.y += 10;

      function measureHeaderHeight() {
        if (!cols.length) return 0;
        const heights = cols.map((col, i) => {
          doc.font(pdfFont(col, true)).fontSize(headerSize);
          return doc.heightOfString(String(col), {
            width: Math.max(widths[i] - padX * 2, 8),
            align: cellAlign(aligns, i),
          });
        });
        return Math.max(16, ...heights) + padY * 2;
      }

      function drawHeader() {
        if (!cols.length) return;
        const y = doc.y;
        const h = measureHeaderHeight();
        doc.rect(left, y, usableWidth, h).fill(headerBg);
        doc.rect(left, y, usableWidth, h).strokeColor(line).lineWidth(0.5).stroke();
        let x = left;
        cols.forEach((col, i) => {
          doc
            .font("Helvetica-Bold")
            .fontSize(headerSize)
            .fillColor(ink)
            .text(String(col), x + padX, y + padY, {
              width: Math.max(widths[i] - padX * 2, 8),
              align: cellAlign(aligns, i),
              height: h - padY * 2,
              ellipsis: true,
            });
          x += widths[i];
        });
        doc.y = y + h;
        doc.font("Helvetica");
      }

      function measureCells(cells, bold) {
        const heights = cells.map((cell, i) => {
          doc.font(pdfFont(cell, bold)).fontSize(bodySize);
          return doc.heightOfString(String(cell ?? ""), {
            width: Math.max((widths[i] || usableWidth / Math.max(cells.length, 1)) - padX * 2, 8),
            align: cellAlign(aligns, i, i >= cells.length - 3 ? "right" : "left"),
          });
        });
        return Math.max(14, ...heights) + padY * 2;
      }

      function startFreshPage() {
        doc.addPage();
        if (cols.length) drawHeader();
      }

      function ensureSpace(needed) {
        if (needed <= remainingSpace()) return;
        startFreshPage();
      }

      /** Split a multi-line items cell so each chunk fits in maxInnerHeight. */
      function chunkMultiline(text, colIndex, maxInnerHeight, bold) {
        const raw = String(text ?? "");
        const lines = raw.split("\n").filter((l) => l.length > 0);
        if (lines.length <= 1) return [raw];
        const w = Math.max((widths[colIndex] || usableWidth) - padX * 2, 8);
        doc.font(pdfFont(raw, bold)).fontSize(bodySize);
        const chunks = [];
        let current = [];
        for (const part of lines) {
          const trial = [...current, part].join("\n");
          const th = doc.heightOfString(trial, { width: w });
          if (current.length > 0 && th > maxInnerHeight) {
            chunks.push(current.join("\n"));
            current = [part];
          } else {
            current.push(part);
          }
        }
        if (current.length) chunks.push(current.join("\n"));
        return chunks.length ? chunks : [raw];
      }

      function expandRow(row) {
        const cells = Array.isArray(row) ? [...row] : [...(row?.cells || [])];
        const bold = Boolean(row?.bold) || isTotalRow(cells);
        const bg = row?.bg || null;
        const pageInner = Math.max(80, contentBottom() - pageMargin - measureHeaderHeight() - 8);
        let h = measureCells(cells, bold);
        if (h <= pageInner) {
          return [{ cells, bold, bg }];
        }
        // Find the tallest (usually Items) column and split its lines.
        let tallest = 0;
        let tallIdx = 1;
        cells.forEach((cell, i) => {
          doc.font(pdfFont(cell, bold)).fontSize(bodySize);
          const ch = doc.heightOfString(String(cell ?? ""), {
            width: Math.max((widths[i] || 40) - padX * 2, 8),
          });
          if (ch > tallest) {
            tallest = ch;
            tallIdx = i;
          }
        });
        const maxInner = pageInner - padY * 2;
        const parts = chunkMultiline(cells[tallIdx], tallIdx, maxInner, bold);
        return parts.map((part, idx) => {
          const next = [...cells];
          next[tallIdx] = part;
          if (idx > 0 && next[0] != null && String(next[0])) {
            next[0] = `${next[0]} (cont.)`;
          }
          // Clear money columns on continuation rows except first
          if (idx > 0) {
            for (let i = Math.max(2, tallIdx + 1); i < next.length; i += 1) {
              if (i !== tallIdx) next[i] = "";
            }
          }
          return { cells: next, bold: bold && idx === parts.length - 1, bg };
        });
      }

      function drawRow(cells, bold, rowIndex, bg) {
        let h = measureCells(cells, bold);
        // Whole row must fit; otherwise new page (avoids orphan lines).
        if (h > remainingSpace()) {
          startFreshPage();
          h = measureCells(cells, bold);
          // Extremely tall single line-block: cap to remaining page after header
          h = Math.min(h, Math.max(40, remainingSpace()));
        }
        const y = doc.y;
        if (theme === "report") {
          if (bg) {
            doc.rect(left, y, usableWidth, h).fill(bg);
          } else if (bold) {
            doc.rect(left, y, usableWidth, h).fill("#efefef");
          } else if (rowIndex % 2 === 1) {
            doc.rect(left, y, usableWidth, h).fill(zebraBg);
          }
          doc.rect(left, y, usableWidth, h).strokeColor(line).lineWidth(0.4).stroke();
        }

        // Block PDFKit auto page-breaks while painting this row's cells.
        const addPageOrig = doc.addPage.bind(doc);
        doc.addPage = function blockedAddPage() {
          return doc;
        };

        let x = left;
        try {
          cells.forEach((cell, i) => {
            const w = widths[i] || usableWidth / Math.max(cells.length, 1);
            const align = cellAlign(
              aligns,
              i,
              i >= cells.length - 3 && cols.length >= 4 ? "right" : "left"
            );
            doc
              .font(bold ? "Helvetica-Bold" : "Helvetica")
              .fontSize(bodySize)
              .fillColor(ink)
              .text(String(cell ?? ""), x + padX, y + padY, {
                width: Math.max(w - padX * 2, 8),
                height: Math.max(h - padY * 2, 8),
                align,
              });
            x += w;
          });
        } finally {
          doc.addPage = addPageOrig;
        }
        doc.font("Helvetica");
        doc.y = y + h;
      }

      if (section.heading) {
        const headingH = 24;
        const minAfter = measureHeaderHeight() + 40;
        ensureSpace(headingH + minAfter);
        const hy = doc.y;
        doc.roundedRect(left, hy, usableWidth, 18, 3).fill(sectionBg);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(ink)
          .text(String(section.heading), left + 8, hy + 4, {
            width: usableWidth - 16,
            height: 14,
            lineBreak: false,
          });
        doc.y = hy + 24;
        doc.font("Helvetica");
      }

      if (cols.length) {
        ensureSpace(measureHeaderHeight() + 40);
        drawHeader();
      }

      let drawn = 0;
      sectionRows.forEach((row) => {
        const pieces = expandRow(row);
        pieces.forEach((piece) => {
          drawRow(piece.cells, piece.bold, drawn, piece.bg);
          drawn += 1;
        });
      });
    });

    const pages = doc.bufferedPageRange();
    const addPageOrig = doc.addPage.bind(doc);
    // Footers must never create new pages (PDFKit will if y is past bottom margin).
    doc.addPage = function blockedFooterAddPage() {
      return doc;
    };
    try {
      for (let i = 0; i < pages.count; i += 1) {
        doc.switchToPage(i);
        const footerY = doc.page.height - footerReserve + 12;
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(muted)
          .text(`Khan Engineerings · Page ${i + 1} of ${pages.count}`, left, footerY, {
            width: usableWidth,
            align: "center",
            lineBreak: false,
            height: 12,
          });
      }
    } finally {
      doc.addPage = addPageOrig;
    }

    doc.end();
  });
}

function sendExcel(res, buffer, filename) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

function sendPdf(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

module.exports = {
  money,
  fmtDate,
  buildExcel,
  buildExcelMulti,
  buildPdf,
  sendExcel,
  sendPdf,
};
