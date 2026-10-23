import React, { useMemo, useState } from 'react';
import { Card, Col, Row, Typography } from 'antd';
import { BarChart3 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { inr, readArStore, statementsFrom, trialBalance } from '../../utils/arLedger';

const { Text } = Typography;

const Block = ({ title, children }) => (
  <Card style={{ borderRadius: 16, height: '100%' }} styles={{ header: { background: '#1E3A5F', color: '#fff' }, body: { padding: 16 } }} title={<span style={{ color: '#fff' }}>{title}</span>}>
    {children}
  </Card>
);

const Line = ({ label, amount, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: strong ? 700 : 500 }}>
    <span>{label}</span>
    {amount !== undefined ? <span>{inr(amount)}</span> : null}
  </div>
);

const FinancialStatements = () => {
  const [store] = useState(() => readArStore());
  const report = useMemo(() => statementsFrom(trialBalance(store)), [store]);

  return (
    <div>
      <PageHeader icon={BarChart3} title="Financial Statements" subtitle="Balance sheet, profit and loss, and cash flow prepared from the trial balance." />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Block title="Balance Sheet">
            <Text strong>Assets</Text>
            {report.assets.map((row) => <Line key={row.code} label={row.name} amount={row.amount} />)}
            <Text strong>Liabilities</Text>
            {report.liabilities.map((row) => <Line key={row.code} label={row.name} amount={row.amount} />)}
            <Text strong>Equity</Text>
            {report.equity.map((row) => <Line key={row.code} label={row.name} amount={row.amount} />)}
            <Line label="Retained earnings" amount={report.netProfit} strong />
          </Block>
        </Col>
        <Col xs={24} lg={8}>
          <Block title="Profit & Loss">
            <Line label="Revenue" amount={report.revenue} strong />
            <Line label="Less: Expenses" amount={report.expenses} />
            <Line label="Profit Before Tax" amount={report.netProfit} strong />
            <Line label="Tax" amount={0} />
            <Line label="Net Profit" amount={report.netProfit} strong />
          </Block>
        </Col>
        <Col xs={24} lg={8}>
          <Block title="Cash Flow Statement">
            <Text strong>Operating Activities</Text>
            <Line label="Net profit" amount={report.netProfit} />
            <div style={{ marginTop: 12 }}><Text strong>Investing Activities</Text></div>
            <Line label="Asset purchases" amount={0} />
            <div style={{ marginTop: 12 }}><Text strong>Financing Activities</Text></div>
            <Line label="Share capital movements" amount={0} />
          </Block>
        </Col>
      </Row>
    </div>
  );
};

export default FinancialStatements;
