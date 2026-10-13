/**
 * AI-Assisted Data Cleaning Service
 * Normalizes input data and corrects common typos for bulk imports.
 */

const CORRECTIONS = {
  'lptop': 'Laptop',
  'lap-top': 'Laptop',
  'desk-top': 'Desktop',
  'dsktop': 'Desktop',
  'furnture': 'Furniture',
  'furnitue': 'Furniture',
  'vehical': 'Vehicle',
  'vehcle': 'Vehicle',
  'machinery': 'Machinery',
  'mchnry': 'Machinery',
  'elctrical': 'Electrical',
  'elctronic': 'Electronic',
  'computr': 'Computer',
  'softare': 'Software',
  'licence': 'License'
};

/**
 * Cleans text by trimming and correcting common typos
 * @param {string} value 
 * @returns {string}
 */
const cleanText = (value) => {
  if (!value || typeof value !== 'string') return value;
  
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  
  // Return corrected value if found in dictionary
  if (CORRECTIONS[lower]) {
    return CORRECTIONS[lower];
  }
  
  return trimmed;
};

/**
 * Smartly matches an input string against a list of master objects
 * @param {string} input 
 * @param {Array} masterList 
 * @param {string} nameKey 
 * @returns {Object|null}
 */
const smartMatch = (input, masterList, nameKey = 'name') => {
  if (!input || !masterList?.length) return null;
  
  const cleaned = cleanText(input).toLowerCase();
  
  // 1. Exact Match
  const exact = masterList.find(m => (m[nameKey] || '').toLowerCase() === cleaned);
  if (exact) return exact;
  
  // 2. Partial Match (e.g., "IT" matches "IT Equipment")
  const partial = masterList.find(m => (m[nameKey] || '').toLowerCase().includes(cleaned));
  if (partial) return partial;
  
  return null;
};

module.exports = {
  cleanText,
  smartMatch
};
