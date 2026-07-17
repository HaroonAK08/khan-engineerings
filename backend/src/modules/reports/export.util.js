const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

function money(n) {
  return Number(n || 0).toFixed(2);
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
async function buildExcel({ title, sheetName, columns, rows, meta = {} }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Khan Engineerings";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName || "Report");

  sheet.addRow([title]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`Generated: ${new Date().toISOString()}`]);
  Object.entries(meta).forEach(([k, v]) => sheet.addRow([`${k}: ${v}`]));
  sheet.addRow([]);
  sheet.addRow(columns);
  sheet.getRow(sheet.rowCount).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  columns.forEach((_, i) => {
    sheet.getColumn(i + 1).width = Math.min(36, Math.max(12, String(columns[i]).length + 4));
  });
  return workbookToBuffer(workbook);
}

/**
 * Stream a simple PDF table report into a buffer.
 */
function buildPdf({ title, subtitle, columns, rows, metaLines = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title, { underline: false });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#555").text(subtitle || "");
    metaLines.forEach((line) => doc.text(line));
    doc.fillColor("#000");
    doc.moveDown();

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / Math.max(columns.length, 1);

    function drawHeader() {
      doc.fontSize(8).font("Helvetica-Bold");
      let x = doc.page.margins.left;
      const y = doc.y;
      columns.forEach((col) => {
        doc.text(String(col), x, y, { width: colWidth - 4, ellipsis: true });
        x += colWidth;
      });
      doc.moveDown(0.8);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke("#ccc");
      doc.moveDown(0.4);
      doc.font("Helvetica");
    }

    drawHeader();

    rows.forEach((row) => {
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
        drawHeader();
      }
      let x = doc.page.margins.left;
      const y = doc.y;
      let maxH = 12;
      row.forEach((cell) => {
        const h = doc.heightOfString(String(cell ?? ""), { width: colWidth - 4 });
        maxH = Math.max(maxH, h);
        doc.fontSize(8).text(String(cell ?? ""), x, y, { width: colWidth - 4 });
        x += colWidth;
      });
      doc.y = y + maxH + 4;
    });

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
  buildPdf,
  sendExcel,
  sendPdf,
};
