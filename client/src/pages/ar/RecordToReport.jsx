import React from 'react';
import { Card } from 'antd';
import { ScrollText } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import FlowStrip from './FlowStrip';
import { R2R_FLOW, SOURCES } from '../../utils/arLedger';

const RecordToReport = () => (
  <div>
    <PageHeader
      icon={ScrollText}
      title="Record to Report"
      subtitle="Record-to-Report collects business transactions and converts them into financial statements."
    />
    <Card title="Objective" style={{ borderRadius: 16, marginBottom: 16 }}>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Trial Balance</li>
        <li>Profit & Loss Account</li>
        <li>Balance Sheet</li>
        <li>Cash Flow Statement</li>
        <li>Management Reports</li>
      </ul>
    </Card>
    <Card title="R2R Process Flow" style={{ borderRadius: 16, marginBottom: 16 }}>
      <FlowStrip steps={R2R_FLOW} rowSize={4} />
    </Card>
    <Card title="Sources Feeding R2R" style={{ borderRadius: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {SOURCES.map((source) => (
          <div key={source} style={{ background: '#EEF3FA', borderRadius: 8, padding: '10px 12px', fontWeight: 600, color: '#1E3A5F' }}>{source}</div>
        ))}
      </div>
      <div style={{ marginTop: 16, background: '#EEF3FA', borderRadius: 8, padding: '12px 14px' }}>
        All transactions eventually create journal entries.
      </div>
    </Card>
  </div>
);

export default RecordToReport;
