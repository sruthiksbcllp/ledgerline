import { inr, num, plain } from './apLedger';

const STORE_KEY = 'ledgerline.ar.ledger.v1';

export { inr, num, plain };

export const NAVY_HEAD = () => ({ style: { background: '#1E3A5F', color: '#fff', fontWeight: 700 } });

export const DEFAULT_ACCOUNTS = [
  { code: '100000', name: 'Assets', type: 'Group', openingDr: 0, openingCr: 0 },
  { code: '110000', name: 'Bank', type: 'Asset', openingDr: 1000000, openingCr: 0 },
  { code: '120000', name: 'Accounts Receivable', type: 'Asset', openingDr: 250000, openingCr: 0 },
  { code: '130000', name: 'Inventory', type: 'Asset', openingDr: 500000, openingCr: 0 },
  { code: '200000', name: 'Liabilities', type: 'Group', openingDr: 0, openingCr: 0 },
  { code: '210000', name: 'Accounts Payable', type: 'Liability', openingDr: 0, openingCr: 250000 },
  { code: '220000', name: 'GST Payable', type: 'Liability', openingDr: 0, openingCr: 0 },
  { code: '300000', name: 'Equity', type: 'Group', openingDr: 0, openingCr: 0 },
  { code: '310000', name: 'Share Capital', type: 'Equity', openingDr: 0, openingCr: 0 },
  { code: '400000', name: 'Revenue', type: 'Revenue', openingDr: 0, openingCr: 5000000 },
  { code: '500000', name: 'Expenses', type: 'Expense', openingDr: 3500000, openingCr: 0 },
];

export const R2R_FLOW = [
  'Transaction Capture',
  'Journal Entry',
  'General Ledger',
  'Account Reconciliation',
  'Period Close',
  'Adjustments',
  'Financial Statements',
];

export const POSTING_FLOW = ['Business Transaction', 'Journal Entry', 'GL Posting', 'Trial Balance'];

export const CLOSE_STEPS = [
  'Close AP',
  'Close AR',
  'Bank Reconciliations',
  'Accrual Entries',
  'Depreciation',
  'Management Review',
  'Trial Balance Freeze',
  'Financial Statements',
  'Period Closed',
];

export const SOURCES = ['P2P', 'O2C', 'Payroll', 'Inventory', 'Fixed Assets', 'Banking', 'Treasury', 'Tax', 'Manual Journals', 'Intercompany'];

const emptyStore = () => ({
  accounts: DEFAULT_ACCOUNTS,
  journals: [],
  reconciliations: {
    bank: { left: 0, right: 0 },
    vendor: { left: 0, right: 0 },
    gst: { left: 0, right: 0 },
  },
  close: {},
  frozen: false,
});

export function readArStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '');
    return {
      accounts: Array.isArray(parsed?.accounts) && parsed.accounts.length ? parsed.accounts : DEFAULT_ACCOUNTS,
      journals: Array.isArray(parsed?.journals) ? parsed.journals : [],
      reconciliations: { ...emptyStore().reconciliations, ...(parsed?.reconciliations || {}) },
      close: parsed?.close || {},
      frozen: Boolean(parsed?.frozen),
    };
  } catch {
    return emptyStore();
  }
}

export function writeArStore(next) {
  const safe = {
    accounts: next.accounts || DEFAULT_ACCOUNTS,
    journals: next.journals || [],
    reconciliations: next.reconciliations || emptyStore().reconciliations,
    close: next.close || {},
    frozen: Boolean(next.frozen),
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(safe));
  return safe;
}

export function accountLabel(accounts, code) {
  const account = accounts.find((item) => item.code === code);
  return account ? `${account.code} ${account.name}` : code;
}

export function trialBalance(store) {
  const rows = store.accounts
    .filter((account) => account.type !== 'Group')
    .map((account) => {
      let debit = num(account.openingDr);
      let credit = num(account.openingCr);
      store.journals.filter((journal) => journal.status === 'POSTED').forEach((journal) => {
        journal.lines.forEach((line) => {
          if (line.account !== account.code) return;
          debit += num(line.debit);
          credit += num(line.credit);
        });
      });
      const net = Math.round((debit - credit) * 100) / 100;
      return {
        code: account.code,
        name: account.name,
        type: account.type,
        side: net >= 0 ? 'Dr' : 'Cr',
        amount: Math.abs(net),
        debit,
        credit,
      };
    })
    .filter((row) => row.amount !== 0 || row.debit || row.credit);
  const totalDr = rows.reduce((sum, row) => sum + (row.side === 'Dr' ? row.amount : 0), 0);
  const totalCr = rows.reduce((sum, row) => sum + (row.side === 'Cr' ? row.amount : 0), 0);
  return { rows, totalDr, totalCr, balanced: Math.abs(totalDr - totalCr) < 0.01 };
}

export function statementsFrom(tb) {
  const ofType = (type) => tb.rows.filter((row) => row.type === type);
  const signed = (row) => (row.side === 'Dr' ? row.amount : -row.amount);
  const assets = ofType('Asset');
  const liabilities = ofType('Liability');
  const equity = ofType('Equity');
  const revenue = ofType('Revenue').reduce((sum, row) => sum + (row.side === 'Cr' ? row.amount : -row.amount), 0);
  const expenses = ofType('Expense').reduce((sum, row) => sum + (row.side === 'Dr' ? row.amount : -row.amount), 0);
  const netProfit = revenue - expenses;
  return { assets, liabilities, equity, revenue, expenses, netProfit, signed };
}
