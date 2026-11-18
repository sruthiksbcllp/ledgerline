import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Col, DatePicker, Row, Space, Typography, message } from 'antd';
import { BarChart3 } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const Block = ({ title, children, extra }) => (
  <Card style={{ ...card, height: '100%' }} title={title} extra={extra}>
    {children}
  </Card>
);

const Line = ({ label, amount, strong, indent }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', paddingLeft: indent ? 14 : 0, borderBottom: '1px solid var(--color-border)' }}>
    <Text strong={strong}>{label}</Text>
    <Text strong={strong} type={amount < 0 ? 'danger' : undefined}>{inr(amount)}</Text>
  </div>
);

const Lines = ({ rows }) => (rows.length
  ? rows.map((r) => <Line key={r.code} indent label={`${r.code} · ${r.name}`} amount={r.amount} />)
  : <Text type="secondary">Nothing posted</Text>);

const FinancialStatements = () => {
  const [range, setRange] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {};
      const r = await api.get('/r2r/statements', { params });
      setData(r?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the financial statements'));
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const pl = data?.profit_and_loss;
  const bs = data?.balance_sheet;
  const cf = data?.cash_flow;

  return (
    <div>
      <PageHeader
        icon={<BarChart3 size={22} />}
        title="Financial Statements"
        subtitle="Profit and loss for the period, the balance sheet at its end, and cash movements, all from the posted ledger."
        actions={[
          <RangePicker
            key="r"
            value={range || (data ? [dayjs(data.from), dayjs(data.to)] : null)}
            onChange={(v) => setRange(v && v[0] && v[1] ? v : null)}
            format="DD MMM YYYY"
          />,
        ]}
      />

      {data && (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Text type="secondary">Period {fmt(data.from)} to {fmt(data.to)} · {data.note}</Text>
        </Space>
      )}

      {loading && !data && <Card loading style={card} />}

      {data && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Block title="Profit and loss">
              <Text strong>Revenue</Text>
              <Lines rows={pl.income} />
              <Line label="Total revenue" amount={pl.total_income} strong />
              <div style={{ height: 12 }} />
              <Text strong>Less: expenses</Text>
              <Lines rows={pl.expenses} />
              <Line label="Total expenses" amount={pl.total_expenses} strong />
              <div style={{ height: 12 }} />
              <Line label={pl.profit >= 0 ? 'Profit for the period (before tax)' : 'Loss for the period (before tax)'} amount={pl.profit} strong />
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Sales returns and discounts reduce revenue (shown as negative amounts).
              </Text>
            </Block>
          </Col>
          <Col xs={24} lg={12}>
            <Block title={`Balance sheet at ${fmt(data.to)}`}>
              <Alert
                style={{ marginBottom: 12 }}
                type={bs.balanced ? 'success' : 'error'}
                showIcon
                message={bs.balanced ? 'Assets equal liabilities plus equity' : 'The balance sheet does not balance'}
              />
              <Text strong>Assets</Text>
              <Lines rows={bs.assets} />
              <Line label="Total assets" amount={bs.total_assets} strong />
              <div style={{ height: 12 }} />
              <Text strong>Liabilities</Text>
              <Lines rows={bs.liabilities} />
              <Line label="Total liabilities" amount={bs.total_liabilities} strong />
              <div style={{ height: 12 }} />
              <Text strong>Equity</Text>
              <Lines rows={bs.equity} />
              <Line indent label="Retained earnings (profit to date)" amount={bs.retained_earnings} />
              <Line label="Total equity" amount={bs.total_equity} strong />
              <div style={{ height: 12 }} />
              <Line label="Liabilities plus equity" amount={Math.round((bs.total_liabilities + bs.total_equity) * 100) / 100} strong />
            </Block>
          </Col>
          <Col xs={24}>
            <Block title="Cash flow: movements on the bank account (1010)">
              {cf.operating.length
                ? cf.operating.map((r) => <Line key={r.label} indent label={r.label} amount={r.amount} />)
                : <Text type="secondary">No bank movements in the period</Text>}
              <Line label="Net change in cash" amount={cf.net} strong />
              <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Operating activities, grouped by the sub-ledger that posted the bank entry.
              </Text>
            </Block>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default FinancialStatements;
