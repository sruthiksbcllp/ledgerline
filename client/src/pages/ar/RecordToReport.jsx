import React, { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Space, Tag, Typography } from 'antd';
import { BarChart3, BookOpen, CalendarClock, FileBarChart2, Layers, ListChecks, Scale, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { canSeePath } from '../../config/rbac';
import { getStoredUser } from '../../utils/session';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text, Paragraph } = Typography;

const FLOW = ['Transaction', 'Sub-ledger', 'Journal entry', 'General ledger', 'Trial balance', 'Financial statements'];
const SOURCES = [
  { name: 'Accounts Payable (P2P)', detail: 'Goods receipt, service entry, vendor invoice, payment, purchase return, TDS deposit' },
  { name: 'Accounts Receivable (O2C)', detail: 'Customer invoice, receipt, credit note, unapplied cash, credit-loss provision, write-off' },
  { name: 'Manual journals', detail: 'Prepared by one person and approved by another before they post' },
];
const PAGES = [
  { path: '/finance/ar/chart-of-accounts', icon: ListChecks, title: 'Chart of Accounts', text: 'Every ledger account with its balance; control accounts are marked.' },
  { path: '/finance/ar/journal-entry', icon: BookOpen, title: 'Journal Entry', text: 'Manual journals, maker-checker: prepare, approve, post.' },
  { path: '/finance/ar/general-ledger', icon: Layers, title: 'General Ledger', text: 'Every posted journal line, filtered by date, account or source.' },
  { path: '/finance/ar/reconciliations', icon: Scale, title: 'Reconciliations', text: 'Bank, GST and customer reconciliations for the month.' },
  { path: '/finance/ar/trial-balance', icon: FileBarChart2, title: 'Trial Balance', text: 'Debit and credit balance of every account; must balance.' },
  { path: '/finance/ar/financial-statements', icon: BarChart3, title: 'Financial Statements', text: 'Profit and loss, balance sheet and cash movements, from the ledger.' },
  { path: '/finance/ar/period-close', icon: CalendarClock, title: 'Period Close', text: 'The nine month-end steps, from closing AP and AR to the closed period.' },
];

const RecordToReport = () => {
  const navigate = useNavigate();
  const role = getStoredUser()?.role;
  const [tb, setTb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/r2r/trial-balance')
      .then((r) => setTb(r?.data?.data || null))
      .catch((e) => setError(errorOf(e, 'Could not load the trial balance')));
  }, []);

  return (
    <div>
      <PageHeader
        icon={<ScrollText size={22} />}
        title="Record to Report"
        subtitle="Collects every posted transaction and turns it into the trial balance and financial statements."
      />

      <Card style={{ ...card, marginBottom: 16 }} title="How the books are built">
        <Paragraph style={{ marginBottom: 12 }}>
          Every business transaction is first recorded in its sub-ledger (Accounts Payable or Accounts Receivable). The
          sub-ledger posts a balanced journal to the general ledger. The trial balance and the financial statements are
          built from those posted journals only, never straight from the transaction tables.
        </Paragraph>
        <Space wrap size={[8, 8]}>
          {FLOW.map((step, i) => (
            <span key={step}>
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>{i + 1}. {step}</Tag>
              {i < FLOW.length - 1 && <Text type="secondary" style={{ margin: '0 4px' }}>→</Text>}
            </span>
          ))}
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card style={{ ...card, height: '100%' }} title="What feeds the ledger">
            {SOURCES.map((s) => (
              <div key={s.name} style={{ marginBottom: 10 }}>
                <Text strong>{s.name}</Text>
                <div><Text type="secondary">{s.detail}</Text></div>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ ...card, height: '100%' }} title="Trial balance today">
            {error && <Alert type="error" showIcon message={error} />}
            {tb && (
              <>
                <Alert
                  type={tb.balanced ? 'success' : 'error'}
                  showIcon
                  message={tb.balanced ? 'The books balance' : 'The books do not balance'}
                  description={`As of ${fmt(tb.as_of)}: debit ${inr(tb.total_dr)} · credit ${inr(tb.total_cr)} · ${tb.rows.length} accounts with postings`}
                />
                <Text type="secondary" style={{ display: 'block', marginTop: 10 }}>
                  The figures include every sub-ledger that posts to the ledger, Accounts Payable and Accounts Receivable alike. These pages only read them.
                </Text>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {PAGES.filter((p) => canSeePath(role, p.path)).map((p) => {
          const Icon = p.icon;
          return (
            <Col xs={24} md={12} xl={8} key={p.path}>
              <Card hoverable style={{ ...card, height: '100%' }} onClick={() => navigate(p.path)}>
                <Space align="start" size={12}>
                  <Icon size={22} />
                  <div>
                    <Text strong>{p.title}</Text>
                    <div><Text type="secondary">{p.text}</Text></div>
                  </div>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default RecordToReport;
