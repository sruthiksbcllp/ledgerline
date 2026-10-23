import moment from 'moment';

const BRAND_LOGO_URL = '/branding/sbc-logo.png';
const EXCEL_BRAND_NAME = 'LedgerLine';
const EXCEL_BRAND_TAGLINE = 'AR and AP';

let cachedLogoDataUrl = null;

const fileToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const getBrandLogoDataUrl = async () => {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const response = await fetch(BRAND_LOGO_URL);
    if (!response.ok) return null;
    const blob = await response.blob();
    cachedLogoDataUrl = await fileToDataUrl(blob);
    return cachedLogoDataUrl;
  } catch {
    return null;
  }
};

export const addPdfBranding = async (doc, title) => {
  const logo = await getBrandLogoDataUrl();
  const topY = 10;
  const logoWidth = 22;
  const logoHeight = 22;
  const leftX = 14;
  const titleX = leftX;
  const titleY = logo ? topY + logoHeight + 8 : 18;

  if (logo) {
    doc.addImage(logo, 'PNG', leftX, topY, logoWidth, logoHeight);
  }

  doc.setFontSize(12);
  doc.text(title, titleX, titleY);

  return titleY + 8;
};

export const buildBrandedExcelSheet = (rows, columns, title) => {
  const exportRows = Array.isArray(rows) ? rows : [];
  const headerRows = [
    [EXCEL_BRAND_NAME],
    [EXCEL_BRAND_TAGLINE],
    [title],
    [`Generated: ${moment().format('DD-MM-YYYY HH:mm')}`],
    []
  ];

  const dataRows = exportRows.map((row) =>
    columns.map((column) => {
      if (typeof column.value === 'function') return column.value(row);
      return row?.[column.value];
    })
  );

  return {
    sheetData: [columns.map((column) => column.label), ...dataRows],
    headerRows
  };
};
