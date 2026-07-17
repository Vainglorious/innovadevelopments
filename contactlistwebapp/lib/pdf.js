// Render the landscape PDF with pdfkit. Ported from build_outputs.py:build_pdf.
// Group sheets with no data rows are skipped (matches the Python behaviour), so
// an empty Owner-Suppliers sheet does not produce a blank page.
import PDFDocument from "pdfkit";

const NAVY = "#1F3864";
const GRID = "#BFBFBF";
const PAD = 3;

// Column-width weights, tuned for the 6- and 8-column layouts.
function weightsFor(ncols) {
  if (ncols === 6) return [1.3, 1.8, 2.2, 2.6, 2.6, 1.6];
  return [1.4, 1.6, 1.8, 2.4, 2.4, 1.4, 1.3, 2.6];
}

function drawTable(doc, header, rows, left, usable) {
  const ncols = header.length;
  const w = weightsFor(ncols).slice(0, ncols);
  const sum = w.reduce((a, b) => a + b, 0);
  const colW = w.map((x) => (x / sum) * usable);
  const fontSize = 7.5;
  const bottom = doc.page.height - doc.page.margins.bottom;

  const drawRow = (cells, isHeader) => {
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    const texts = cells.map((c) => String(c ?? ""));

    // Measure the tallest cell to size the row.
    let h = 0;
    texts.forEach((tx, i) => {
      const hh = doc.heightOfString(tx, { width: colW[i] - 2 * PAD });
      if (hh > h) h = hh;
    });
    h = Math.max(h, doc.currentLineHeight()) + 2 * PAD;

    if (doc.y + h > bottom) doc.addPage();
    const y = doc.y;

    if (isHeader) {
      doc.save().rect(left, y, usable, h).fill(NAVY).restore();
    }

    let x = left;
    texts.forEach((tx, i) => {
      doc.fillColor(isHeader ? "white" : "black");
      doc.text(tx, x + PAD, y + PAD, { width: colW[i] - 2 * PAD });
      x += colW[i];
    });

    // Grid lines.
    doc.strokeColor(GRID).lineWidth(0.5);
    doc.rect(left, y, usable, h).stroke();
    x = left;
    for (let i = 0; i < colW.length - 1; i++) {
      x += colW[i];
      doc.moveTo(x, y).lineTo(x, y + h).stroke();
    }

    doc.fillColor("black");
    doc.y = y + h;
  };

  drawRow(header, true);
  for (const r of rows) drawRow(r, false);
}

export function renderPdf(sheets) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: 36 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let first = true;

    for (const sheet of sheets) {
      const isNotes = !!sheet.isNotes;
      if (!isNotes && sheet.rows.length === 0) continue; // skip empty group sheets

      if (!first) doc.addPage();
      first = false;

      // Section title (navy).
      const titleTail = isNotes
        ? (sheet.rows[0] ? sheet.rows[0][0] : "")
        : sheet.title;
      doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY);
      doc.text(`${sheet.name} - ${titleTail}`, left, doc.y);
      doc.fillColor("black").moveDown(0.4);

      if (isNotes) {
        for (const [k, v] of sheet.rows) {
          doc.font("Helvetica-Bold").fontSize(9).text(String(k ?? ""), left, doc.y, { width: usable });
          doc.font("Helvetica").fontSize(9).text(String(v ?? ""), left, doc.y, { width: usable });
          doc.moveDown(0.4);
        }
        continue;
      }

      drawTable(doc, sheet.header, sheet.rows, left, usable);
    }

    doc.end();
  });
}
