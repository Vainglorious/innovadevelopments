// Render the 6-sheet workbook with exceljs. Ported from build_outputs.py:build_xlsx.
import ExcelJS from "exceljs";

const NAVY = "FF1F3864";
const GREY = "FFF2F2F2";
const BORDER_COLOR = "FFBFBFBF";

const thinBorder = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

function applyColumnWidths(ws, rows) {
  const widths = {};
  for (const r of rows) {
    r.forEach((v, i) => {
      const len = String(v ?? "").length + 2;
      widths[i] = Math.min(Math.max(widths[i] || 10, len), 55);
    });
  }
  for (const [i, w] of Object.entries(widths)) {
    ws.getColumn(Number(i) + 1).width = w;
  }
}

export async function renderXlsx(sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Contact List Web App";

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);

    if (sheet.isNotes) {
      for (const r of sheet.rows) {
        const row = ws.addRow(r);
        row.getCell(1).font = { bold: true };
        row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      }
      applyColumnWidths(ws, sheet.rows);
      continue;
    }

    const ncols = sheet.header.length;

    // Row 1: title, merged across all columns.
    ws.addRow([sheet.title]);
    ws.mergeCells(1, 1, 1, ncols);
    const t = ws.getCell(1, 1);
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    t.alignment = { horizontal: "left", vertical: "center" };
    ws.getRow(1).height = 22;

    // Row 2: header.
    const hr = ws.addRow(sheet.header);
    hr.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { vertical: "center" };
      c.border = thinBorder;
    });

    // Rows 3+: data, bordered, wrapped, with alternating grey banding.
    for (const r of sheet.rows) {
      const row = ws.addRow(r);
      for (let c = 1; c <= ncols; c++) {
        const cell = ws.getCell(row.number, c);
        cell.border = thinBorder;
        cell.alignment = { vertical: "top", wrapText: true };
        if (row.number % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
        }
      }
    }

    ws.views = [{ state: "frozen", ySplit: 2 }];
    applyColumnWidths(ws, [[sheet.title], sheet.header, ...sheet.rows]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
