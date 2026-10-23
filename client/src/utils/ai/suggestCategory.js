/**
 * AI-Assisted Category Suggestion Logic
 * Weighted matcher to avoid broad-category false positives (e.g., Laptop -> Electronics).
 */

const CATEGORY_SIGNALS = [
  {
    match: ['laptop', 'notebook', 'ultrabook', 'macbook', 'chromebook'],
    prefers: ['computer', 'it asset', 'it', 'technology', 'information technology'],
    avoids: ['electronics']
  },
  {
    match: ['desktop', 'workstation', 'pc', 'all-in-one'],
    prefers: ['computer', 'it asset', 'it', 'technology'],
    avoids: ['electronics']
  },
  {
    match: ['monitor', 'keyboard', 'mouse', 'dock', 'ups', 'headset'],
    prefers: ['peripheral', 'computer', 'it', 'office equipment']
  },
  {
    match: ['printer', 'scanner', 'copier'],
    prefers: ['office equipment', 'it', 'technology']
  },
  {
    match: ['router', 'switch', 'firewall', 'server', 'nas'],
    prefers: ['network', 'infrastructure', 'it', 'technology']
  },
  {
    match: ['chair', 'table', 'desk', 'cabinet', 'sofa'],
    prefers: ['furniture', 'fittings', 'office furniture']
  },
  {
    match: ['car', 'truck', 'van', 'vehicle', 'bike'],
    prefers: ['vehicle', 'transport', 'automobile']
  },
  {
    match: ['ac', 'air conditioner', 'hvac', 'compressor', 'chiller'],
    prefers: ['hvac', 'electrical', 'appliance', 'plant']
  },
  {
    match: ['machine', 'lathe', 'drill', 'cnc', 'press'],
    prefers: ['machinery', 'plant', 'industrial', 'tools']
  }
];

const normalize = (v) => String(v || '').toLowerCase().trim();

const scoreCategory = (categoryName, signal) => {
  let score = 0;
  signal.prefers.forEach((token, idx) => {
    if (categoryName.includes(token)) score += 10 - idx;
  });
  (signal.avoids || []).forEach((token) => {
    if (categoryName.includes(token)) score -= 4;
  });
  return score;
};

export const suggestCategory = (assetName, categories) => {
  if (!assetName || !categories?.length) return null;
  const input = normalize(assetName);
  const signal = CATEGORY_SIGNALS.find((s) => s.match.some((m) => input.includes(m)));
  if (!signal) return null;

  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  categories.forEach((cat) => {
    const catName = normalize(cat.name || cat.category_name);
    const score = scoreCategory(catName, signal);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  });

  return bestScore > 0 ? best : null;
};

const DESCRIPTION_TEMPLATES = [
  {
    keywords: ['laptop', 'notebook', 'macbook', 'desktop', 'workstation', 'computer'],
    text: (name) => `${name} used for business applications, productivity workloads, and secure organizational access.`
  },
  {
    keywords: ['printer', 'scanner', 'copier'],
    text: (name) => `${name} deployed for document processing, printing, and operational record workflows.`
  },
  {
    keywords: ['router', 'switch', 'firewall', 'server'],
    text: (name) => `${name} supporting enterprise IT infrastructure and internal network service availability.`
  },
  {
    keywords: ['chair', 'table', 'desk', 'cabinet'],
    text: (name) => `${name} allocated as office furniture for day-to-day workspace and administrative operations.`
  },
  {
    keywords: ['car', 'truck', 'vehicle', 'van'],
    text: (name) => `${name} assigned for official transport and field operations under company asset controls.`
  }
];

export const generateDescription = (name) => {
  if (!name) return '';
  const input = normalize(name);
  const template = DESCRIPTION_TEMPLATES.find((t) => t.keywords.some((k) => input.includes(k)));
  if (template) return template.text(name);
  return `${name} recorded in the fixed asset register for controlled use, periodic verification, and lifecycle tracking.`;
};
