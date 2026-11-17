import { useEffect, useState } from 'react';
import { message } from 'antd';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import api from './api';
import { buildBrandedExcelSheet } from './exportBranding';
import { getStoredUser } from './session';
import { canSeePath } from '../config/rbac';

/** Shared pieces for the AP reports (cycle time, exceptions) on Accounts Payable Management. */
export const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };
export const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');

/** Hours as "5 h" under a day, else "3.2 days". */
export const fmtHours = (h) => {
  if (h == null) return '—';
  if (h < 24) return `${Math.round(h)} h`;
  const days = h / 24;
  return `${days >= 10 ? Math.round(days) : Math.round(days * 10) / 10} day${days === 1 ? '' : 's'}`;
};
export const fmtDays = (d) => (d == null ? '—' : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`);
export const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

export const defaultRange = () => [dayjs().subtract(89, 'day').startOf('day'), dayjs().endOf('day')];
export const rangeParams = (range) => ({
  from: range?.[0] ? range[0].startOf('day').toISOString() : undefined,
  to: range?.[1] ? range[1].endOf('day').toISOString() : undefined
});

/** Whether the signed-in person can open a bill on the Invoices page (rows link there). */
export const canOpenBills = () => canSeePath(getStoredUser()?.role, '/procurement/invoices');

/** Excel export, unless the administrator turned it off (System settings). */
export function useExcelExport() {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    api.get('/system/settings/').then((res) => {
      const s = res?.data?.data || res?.data || {};
      if (s.allow_excel_export === false) setAllowed(false);
    }).catch(() => {});
  }, []);
  /** sheets: [{ name, title, columns: [{ label, value: (row) => any }], rows }] */
  const exportSheets = (sheets, fileName) => {
    if (!allowed) { message.warning('Excel export is disabled by administrator'); return; }
    if (!sheets.some((s) => s.rows.length)) { message.warning('Nothing to export'); return; }
    const book = XLSX.utils.book_new();
    sheets.forEach((s) => {
      const { headerRows, sheetData } = buildBrandedExcelSheet(s.rows, s.columns, s.title);
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([...headerRows, ...sheetData]), s.name.slice(0, 31));
    });
    XLSX.writeFile(book, `${fileName}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };
  return { allowed, exportSheets };
}
