import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const LINKS = { close_ar: '/finance/ar/ar-close', bank_rec: '/finance/ar/reconciliations', tb_freeze: '/finance/ar/trial-balance', financial_statements: '/finance/ar/financial-statements' };

const PeriodClose = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState(dayjs());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ticking, setTicking] = useState(null); // step being marked done
  const [note, setNote] = useState('');
  const period = month.format('YYYY-MM');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/r2r/close', { params: { period } });
      setData(r?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the period close'));
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (step, done, stepNote) => {
    setBusy(true);
    try {
      const r = await api.post(`/r2r/close/${period}/tasks/${step.key}`, { done, note: stepNote || null });
      message.success(r?.data?.message || 'Saved');
      setData(r?.data?.data || data);
      setTicking(null);
      setNote('');
    } catch (e) {
      message.error(errorOf(e, 'Could not update the step'));
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items || [];
  const doneCount = items.filter((i) => i.done).length;

  const columns = [
    { title: 'Step', dataIndex: 'n', width: 60 },
    {
      title: 'What', dataIndex: 'label',
      render: (v, r) => (
        <div>
          <Text strong>{v}</Text>
          {r.auto && <Tag style={{ marginLeft: 8 }}>Automatic</Tag>}
          <div><Text type="secondary" style={{ fontSize: 12 }}>Who: {r.who}</Text></div>
          {r.detail && <div style={{ fontSize: 13 }}>{r.detail}</div>}
        </div>
      ),
    },
    { title: 'Status', dataIndex: 'done', width: 120, render: (v) => (v ? <Tag color="success">Done</Tag> : <Tag>Open</Tag>) },
    {
      title: 'Done by', key: 'by', width: 200,
      render: (_, r) => (r.done && r.done_by_name ? <div style={{ fontSize: 12 }}>{r.done_by_name}<div><Text type="secondary">{fmt(r.done_at)}</Text></div></div> : <Text type="secondary">—</Text>),
    },
    {
      title: '', key: 'act', width: 260,
      render: (_, r) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            {r.can_toggle && !r.done && <Button size="small" type="primary" onClick={() => { setTicking(r); setNote(''); }}>Mark done</Button>}
            {r.can_toggle && r.done && <Button size="small" loading={busy} onClick={() => toggle(r, false)}>Undo</Button>}
            {LINKS[r.key] && <Button size="small" type="link" onClick={() => navigate(LINKS[r.key])}>Open page</Button>}
          </Space>
          {!r.can_toggle && r.block && <Text type="secondary" style={{ fontSize: 12 }}>{r.block}</Text>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<CalendarClock size={22} />}
        title="Period Close"
        subtitle="The month-end close, step by step: close AP and AR, reconcile, adjust, review, freeze the trial balance, produce the statements, close."
        actions={[<DatePicker key="m" picker="month" value={month} onChange={(v) => setMonth(v || dayjs())} allowClear={false} format="MMMM YYYY" />]}
      />

      {data && (
        <Alert
          style={{ marginBottom: 16 }}
          type={data.closed ? 'success' : 'info'}
          showIcon
          message={data.closed ? `${data.label} is closed` : `${data.label}: ${doneCount} of ${items.length} steps done`}
          description={(
            <div>
              <div>
                Trial balance at month end: {data.trial_balance.balanced ? 'balanced' : 'not balanced'} (debit {inr(data.trial_balance.total_dr)} · credit {inr(data.trial_balance.total_cr)}).
              </div>
              <div>
                Ticking “Period closed” locks manual journals dated in the month. Accounts Receivable postings are locked separately by the AR close (step 2).
              </div>
            </div>
          )}
        />
      )}

      <Card style={card} styles={{ body: { padding: 0 } }}>
        <Table rowKey="key" loading={loading} dataSource={items} columns={columns} pagination={false} scroll={{ x: 900 }} />
      </Card>

      <Modal
        open={!!ticking}
        title={ticking ? `Mark “${ticking.label}” done for ${data?.label || period}` : ''}
        onCancel={() => setTicking(null)}
        onOk={() => toggle(ticking, true, note)}
        okText="Mark done"
        confirmLoading={busy}
      >
        {ticking?.key === 'period_closed' && (
          <Alert style={{ marginBottom: 12 }} type="warning" showIcon message="No manual journal dated in this month can be posted once the period is closed." />
        )}
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): what was checked or posted" />
      </Modal>
    </div>
  );
};

export default PeriodClose;
