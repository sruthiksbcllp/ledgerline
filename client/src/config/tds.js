// TDS sections offered on the vendor master and the invoice (Income-tax Act 1961 numbering; the
// 2025 Act renumbers them from 1 April 2026). Rates are the usual company rates and can be edited.
export const TDS_SECTIONS = [
  { value: '194C', label: '194C – Contractors', rate: 2 },
  { value: '194J', label: '194J – Professional / technical fees', rate: 10 },
  { value: '194I', label: '194-I – Rent (land / building)', rate: 10 },
  { value: '194H', label: '194H – Commission / brokerage', rate: 5 },
  { value: '194Q', label: '194Q – Purchase of goods', rate: 0.1 },
  { value: '194A', label: '194A – Interest', rate: 10 },
];

export const defaultTdsRate = (section) => TDS_SECTIONS.find((s) => s.value === section)?.rate;
