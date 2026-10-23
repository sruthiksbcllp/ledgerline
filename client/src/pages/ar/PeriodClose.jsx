import React, { useState } from 'react';
import { Button, Card, Space, Table, Tag, message } from 'antd';
import { CalendarClock } from 'lucide-react';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import FlowStrip from './FlowStrip';
import { CLOSE_STEPS, NAVY_HEAD, plain, readArStore, writeArStore } from '../../utils/arLedger';

const TEMPLATES = [
  { key: 'accrual', title: 'Accruals', note: 'Expense incurred but invoice not received.', lines: [{ account: 'Audit Fees Expense', code: '500000', debit: 100000, credit: 0 }, { account: 'Accrued Liability', code: '230000', name: 'Accrued Liability', type: 'Liability', debit: 0, credit: 100000 }] },
  { key: 'prepay', title: 'Prepayments — initial entry', note: 'Expense paid in advance.', lines: [{ account: 'Prepaid Expense', code: '140000', name: 'Prepaid Expense', type: 'Asset', debit: 120000, credit: 0 }, { account: 'Bank', code: '110000', debit: 0, credit: 120000 }] },
  { key: 'recognise', title: 'Monthly recognition', note: 'Release one month of the prepayment.', lines: [{ account: 'Rent Expense', code: '500000', debit: 10000, credit: 0 }, { account: 'Prepaid Expense', code: '140000', name: 'Prepaid Expense', type: 'Asset', debit: 0, credit: 10000 }] },
  { key: 'depreciation', title: 'Depreciation', note: 'Charge depreciation for the period.', lines: [{ account: 'Depreciation Expense', debit: 'Dr', credit: '' }, { account: 'Accumulated Depreciation', debit: '', credit: 'Cr' }] },
  { key: 'provision', title: 'Provisions', note: 'Recognise a provision.', lines: [{ account: 'Provision Expense', debit: 'Dr', credit: '' }, { account: 'Provision Liability', debit: '', credit: 'Cr' }] },
];

const PeriodClose = () => {
  const [store, setStore] = useState(() => readArStore());

  const toggle = (step) => {
    const close = { ...store.close, [step]: !store.close[step] };
    const frozen = step === 'Trial Balance Freeze' ? !store.close[step] : store.frozen;
    setStore(writeArStore({ ...store, close, frozen }));
  };

  const postTemplate = (template) => {
    if (store.frozen) {
      message.error('Trial balance is frozen');
      return;
    }
    const numeric = template.lines.every((line) => typeof line.debit === 'number' && typeof line.credit === 'number' && line.code);
    if (!numeric) {
      message.info(`${template.title} is a memo template. Enter the amounts in Journal Entry.`);
      return;
    }
    let accounts = store.accounts;
    template.lines.forEach((line) => {
      if (line.name && !accounts.some((account) => account.code === line.code)) {
        accounts = [...accounts, { code: line.code, name: line.name, type: line.type, openingDr: 0, openingCr: 0 }];
      }
    });
    const journal = {
      id: `JE-${Date.now()}`,
      number: `CLOSE-${template.key.toUpperCase()}`,
      date: dayjs().format('YYYY-MM-DD'),
      entity: 'LedgerLine',
      company: 'LedgerLine',
      costCenter: '',
      reference: template.title,
      source: 'Period Close',
      status: 'POSTED',
      lines: template.lines.map((line) => ({ account: line.code, debit: line.debit, credit: line.credit })),
    };
    setStore(writeArStore({ ...store, accounts, journals: [journal, ...store.journals] }));
    message.success(`${template.title} posted`);
  };

  return (
    <div>
      <PageHeader icon={CalendarClock} title="Period Close" subtitle="Close AP and AR, post adjustments, freeze the trial balance, and issue the statements." />
      <Card title="Period Close Workflow" style={{ borderRadius: 16, marginBottom: 16 }}>
        <FlowStrip steps={CLOSE_STEPS} rowSize={3} />
        <Space wrap style={{ marginTop: 16 }}>
          {CLOSE_STEPS.map((step) => (
            <Button key={step} type={store.close[step] ? 'primary' : 'default'} onClick={() => toggle(step)}>
              {store.close[step] ? 'Done' : 'Mark'} · {step}
            </Button>
          ))}
        </Space>
        {store.frozen ? <Tag color="error" style={{ marginTop: 12 }}>Trial balance frozen</Tag> : null}
      </Card>
      <Card title="Month-End Close Activities" style={{ borderRadius: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {TEMPLATES.map((template) => (
            <div key={template.key}>
              <Space style={{ marginBottom: 8 }}>
                <strong>{template.title}</strong>
                <Button size="small" onClick={() => postTemplate(template)}>Post</Button>
              </Space>
              <div style={{ marginBottom: 8, color: '#64748B' }}>{template.note}</div>
              <Table
                size="small"
                pagination={false}
                rowKey="account"
                dataSource={template.lines}
                columns={[
                  { title: 'Account', dataIndex: 'account', onHeaderCell: NAVY_HEAD },
                  { title: 'Debit', dataIndex: 'debit', align: 'right', onHeaderCell: NAVY_HEAD, render: (value) => (typeof value === 'number' && value ? plain(value) : value || '') },
                  { title: 'Credit', dataIndex: 'credit', align: 'right', onHeaderCell: NAVY_HEAD, render: (value) => (typeof value === 'number' && value ? plain(value) : value || '') },
                ]}
              />
            </div>
          ))}
        </Space>
      </Card>
    </div>
  );
};

export default PeriodClose;
