const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

class ExportService {
  async exportToExcel(data, columns, title) {
    const workbook = new ExcelJS.Workbook();
    const safeTitle = String(title || 'Report')
      .replace(/[\*\?:\\\/\[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Report';
    const worksheet = workbook.addWorksheet(safeTitle);

    // Style Header
    const headerRow = worksheet.addRow(columns.map(col => col.header));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F2744' }
      };
    });

    // Add Data (guard against undefined/non-array so a missing report branch is an empty sheet, not a 500)
    (Array.isArray(data) ? data : []).forEach(item => {
      const row = columns.map(col => {
        if (typeof col.key === 'function') return col.key(item);
        return item[col.key];
      });
      worksheet.addRow(row);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    return await workbook.xlsx.writeBuffer();
  }

  async exportToPdf(data, columns, title) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const left = 30;
      const right = doc.page.width - 30;
      const tableWidth = right - left;
      const colWidth = tableWidth / columns.length;
      const padX = 4, padY = 4, fontSize = 8;

      // Title + generated timestamp
      doc.fontSize(18).fillColor('#0F2744').text(title, left, 30, { width: tableWidth, align: 'center' });
      doc.fontSize(9).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleString()}`, left, doc.y + 4, { width: tableWidth, align: 'right' });
      let y = doc.y + 10;

      const drawRow = (cells, header = false) => {
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
        // Dynamic row height = tallest wrapped cell (fixes overlap on long asset codes)
        let rowH = 0;
        cells.forEach((val) => {
          const h = doc.heightOfString(String(val ?? '-'), { width: colWidth - padX * 2 });
          if (h > rowH) rowH = h;
        });
        rowH = Math.max(rowH + padY * 2, 16);
        // Page break
        if (y + rowH > doc.page.height - 30) {
          doc.addPage({ layout: 'landscape' });
          y = 30;
        }
        if (header) doc.rect(left, y, tableWidth, rowH).fill('#0F2744');
        doc.fillColor(header ? '#FFFFFF' : '#000000');
        cells.forEach((val, i) => {
          doc.text(String(val ?? '-'), left + i * colWidth + padX, y + padY, { width: colWidth - padX * 2 });
        });
        y += rowH;
        if (!header) doc.moveTo(left, y).lineTo(right, y).strokeColor('#eeeeee').lineWidth(0.5).stroke();
      };

      drawRow(columns.map((c) => c.header), true);
      (Array.isArray(data) ? data : []).forEach((item) => {
        drawRow(columns.map((col) => (typeof col.key === 'function' ? col.key(item) : item[col.key])));
      });

      doc.end();
    });
  }
}

module.exports = new ExportService();
