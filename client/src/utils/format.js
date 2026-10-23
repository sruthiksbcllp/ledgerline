export const formatCurrency = (value) => {
  if (!value && value !== 0) return '';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(value));
};

export const toNumberSafe = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const str = String(value).trim();
  const negative = str.startsWith('-');

  let s = str
    .replace(/[,\s]/g, '')       // drop thousands separators + whitespace
    .replace(/[^\d.]/g, '')      // drop currency symbols, letters, sign
    .replace(/(?<!\d)\./g, ''); // drop any dot NOT preceded by a digit (e.g. the "Rs." dot, a leading dot)

  // keep only the first decimal point; collapse any extras
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }

  const num = Number(s || '0') * (negative ? -1 : 1);
  return Number.isFinite(num) ? num : 0;
};

export const formatINR = (value, opts = {}) => {
  const amount = toNumberSafe(value);
  const {
    withSymbol = false,
    minimumFractionDigits = 0,
    maximumFractionDigits = 0
  } = opts;

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(amount);

  return withSymbol ? `Rs. ${formatted}` : formatted;
};

export const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};
