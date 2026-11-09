// TDS sections offered on the vendor master and the invoice, Income-tax Act 2025 (in force 1 April
// 2026). `value` is the old 1961-Act number, saved on vendors and invoices; the label leads with the
// new Section 393 reference. Rates are FY 2026-27 company rates and can be edited.
export const TDS_SECTIONS = [
  { value: '194C', ref: '393(1) Sl. 6(i)', label: '393(1) Sl. 6(i) – Contractors (old 194C)', rate: 2 },
  { value: '194J', ref: '393(1) Sl. 6(iii)', label: '393(1) Sl. 6(iii) – Professional fees (old 194J)', rate: 10 },
  { value: '194J(a)', ref: '393(1) Sl. 6(iii)', label: '393(1) Sl. 6(iii) – Technical fees (old 194J(a))', rate: 2 },
  { value: '194I', ref: '393(1) Sl. 2(ii)', label: '393(1) Sl. 2(ii) – Rent: land / building (old 194-I(b))', rate: 10 },
  { value: '194I(a)', ref: '393(1) Sl. 2(ii)', label: '393(1) Sl. 2(ii) – Rent: plant / machinery (old 194-I(a))', rate: 2 },
  { value: '194H', ref: '393(1) Sl. 1(ii)', label: '393(1) Sl. 1(ii) – Commission / brokerage (old 194H)', rate: 2 },
  { value: '194Q', ref: '393(1) Sl. 8(ii)', label: '393(1) Sl. 8(ii) – Purchase of goods (old 194Q)', rate: 0.1 },
  { value: '194A', ref: '393(1) Sl. 5(iii)', label: '393(1) Sl. 5(iii) – Interest (old 194A)', rate: 10 },
  { value: '194D', ref: '393(1) Sl. 1(i)', label: '393(1) Sl. 1(i) – Insurance commission (old 194D)', rate: 10 },
  { value: '194R', ref: '393(1) Sl. 8(iv)', label: '393(1) Sl. 8(iv) – Business perquisites (old 194R)', rate: 10 },
];

export const defaultTdsRate = (section) => TDS_SECTIONS.find((s) => s.value === section)?.rate;

/** Short form for summaries: "393(1) Sl. 6(i) (194C)". */
export const tdsSectionLabel = (section) => {
  const s = TDS_SECTIONS.find((x) => x.value === section);
  return s ? `${s.ref} (${section})` : (section || '');
};
