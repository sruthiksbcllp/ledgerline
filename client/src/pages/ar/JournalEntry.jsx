import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Tag, Typography, message,
} from 'antd';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { ArStatus, ArTasks, JournalLines, PageHeader, useOpenParam } from '../../components/ar/ArShared';
import { getStoredUser, hasPerm } from '../../utils/session';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const blankLine = () => ({ key: Math.random().toString(36).slice(2), account_code: null, debit: null, credit: null, memo: '' });
const STATUS_TABS = [
  { key: 'PENDING_APPROVAL', label: 'Waiting for approval' },
  { key: 'POSTED', label: 'Posted' },
  { key: 'REJECTED,CANCELLED', label: 'Rejected / withdrawn' },
  { key: 'ALL', label: 'All' },
];

const JournalEntry = () => {
  const user = getStoredUser();
  const canPrepare = hasPerm(user, 'R2R', 'ADD');
  const [journals, setJournals] = useState([]);
  const [controls, setControls] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('PENDING_APPROVAL');
  const [creating, setCreating] = useState(false);
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState(null); // { journal, action: 'reject' }
  const [note, setNote] = useState('');
  const [form] = Form.useForm();
  // "Waiting for you" → Open: show the waiting journals, open the one named and pick it out.
  const [focusId, setFocusId] = useState(null);
  useOpenParam((id) => { setTab('PENDING_APPROVAL'); setFocusId(Number(id)); });
  const [tasksKey, setTasksKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, a] = await Promise.all([api.get('/r2r/journals'), api.get('/r2r/accounts')]);
      setJournals(j?.data?.data || []);
      setControls(j?.data?.meta?.control_accounts || {});
      setAccounts(a?.data?.data || []);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the journals'));
    } finally {
      setLoading(false);
      setTasksKey((k) => k + 1);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const accountOptions = useMemo(() => accounts
    .filter((a) => !controls[a.code] && !a.control && a.is_active !== false)
    .map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` })), [accounts, controls]);

  const totals = useMemo(() => {
    const dr = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const cr = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    return { dr, cr, balanced: dr > 0 && Math.abs(dr - cr) < 0.005 };
  }, [lines]);

  const shown = tab === 'ALL' ? journals : journals.filter((j) => tab.split(',').includes(j.status));
  const counts = Object.fromEntries(STATUS_TABS.map((t) => [t.key, t.key === 'ALL' ? journals.length : journals.filter((j) => t.key.split(',').includes(j.status)).length]));

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const openNew = () => {
    form.setFieldsValue({ entry_date: dayjs(), narration: '' });
    setLines([blankLine(), blankLine()]);
    setCreating(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (!totals.balanced) { message.error(`Debits (${inr(totals.dr)}) must equal credits (${inr(totals.cr)})`); return; }
    setBusy(true);
    try {
      const r = await api.post('/r2r/journals', {
        entry_date: values.entry_date.format('YYYY-MM-DD'), narration: values.narration,
        lines: lines.filter((l) => l.account_code && (l.debit || l.credit)).map((l) => ({ account_code: l.account_code, debit: l.debit || 0, credit: l.credit || 0, memo: l.memo || null })),
      });
      message.success(r?.data?.message || 'Journal prepared');
      setCreating(false);
      setTab('PENDING_APPROVAL');
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not prepare the journal'));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (journal) => {
    setBusy(true);
    try {
      const r = await api.post(`/r2r/journals/${journal.id}/approve`, {});
      message.success(r?.data?.message || 'Journal posted');
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not approve the journal'));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!note.trim()) { message.error('Say why'); return; }
    setBusy(true);
    try {
      const r = await api.post(`/r2r/journals/${deciding.journal.id}/reject`, { note });
      message.success(r?.data?.message || 'Done');
      setDeciding(null);
      setNote('');
      load();
    } catch (e) {
      message.error(errorOf(e, 'Could not reject the journal'));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: 'Date', dataIndex: 'entry_date', width: 110, render: fmt },
    { title: 'Number', dataIndex: 'mj_number', width: 150, render: (v, r) => v || <Text type="secondary">Request #{r.id}</Text> },
    { title: 'Narration', dataIndex: 'narration' },
    { title: 'Amount', dataIndex: 'total', align: 'right', width: 130, render: (v) => inr(v) },
    { title: 'Status', dataIndex: 'status', width: 170, render: (v) => (v === 'CANCELLED' ? <Tag style={{ marginInlineEnd: 0 }}>Withdrawn</Tag> : <ArStatus status={v} />) },
    {
      title: 'Prepared / decided', key: 'who', width: 220,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div>Prepared by {r.prepared_by_name || '—'}</div>
          {r.approved_by_name && <div>{r.status === 'POSTED' ? 'Approved' : 'Decided'} by {r.approved_by_name}</div>}
          {r.decision_note && <Text type="secondary">{r.decision_note}</Text>}
        </div>
      ),
    },
    {
      title: '', key: 'act', width: 210,
      render: (_, r) => {
        if (r.status !== 'PENDING_APPROVAL') return null;
        const own = Number(r.prepared_by) === Number(user?.id);
        return (
          <Space direction="vertical" size={4}>
            <Space>
              {r.can_approve && <Button size="small" type="primary" loading={busy} onClick={() => approve(r)}>Approve and post</Button>}
              {(r.can_approve || own) && <Button size="small" danger onClick={() => { setDeciding({ journal: r }); setNote(''); }}>{own ? 'Withdraw' : 'Reject'}</Button>}
            </Space>
            {!r.can_approve && r.approve_block && <Text type="secondary" style={{ fontSize: 12 }}>{r.approve_block}</Text>}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<BookOpen size={22} />}
        title="Journal Entry"
        subtitle="Manual journals: prepared by one person, approved by Finance or the Director / CFO, then posted to the ledger."
        actions={canPrepare ? [<Button key="n" type="primary" icon={<Plus size={16} />} onClick={openNew}>New journal</Button>] : []}
      />
      <ArTasks kinds={['MANUAL_JOURNAL']} refreshKey={tasksKey} />

      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="Every journal must balance, and control accounts are posted only by their sub-ledgers"
        description={`Customer invoices, receipts, payments and the other sub-ledger events post their own journals automatically. A manual journal cannot use a control account${Object.keys(controls).length ? ` (${Object.entries(controls).map(([c, n]) => `${c} ${n}`).join('; ')})` : ''}.`}
      />

      <Card style={card} styles={{ body: { padding: 0 } }}>
        <Tabs
          style={{ padding: '0 16px' }}
          activeKey={tab}
          onChange={setTab}
          items={STATUS_TABS.map((t) => ({ key: t.key, label: `${t.label} (${counts[t.key] || 0})` }))}
        />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={shown}
          columns={columns}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
          expandable={{
            expandedRowRender: (r) => <JournalLines lines={(r.lines || []).map((l) => ({ ...l, account: l.account_code, accountName: l.account_name }))} />,
            ...(focusId ? { expandedRowKeys: [focusId], onExpand: () => setFocusId(null) } : {}),
          }}
          onRow={(r) => (Number(r.id) === focusId ? { style: { background: 'var(--color-warning-bg, #fffbe6)' } } : {})}
          locale={{ emptyText: 'No journals here.' }}
        />
      </Card>

      <Modal
        open={creating}
        title="New manual journal"
        width={900}
        onCancel={() => setCreating(false)}
        onOk={submit}
        okText="Send for approval"
        okButtonProps={{ disabled: !totals.balanced }}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="entry_date" label="Journal date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d && d.isAfter(dayjs(), 'day')} />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item name="narration" label="Narration (what the journal is for)" rules={[{ required: true, message: 'Enter the narration' }]}>
                <Input placeholder="e.g. November bank charges per statement" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--color-text-secondary, #667)', fontSize: 13 }}>
              <th style={{ padding: 4 }}>Account</th><th style={{ padding: 4, width: 140 }}>Debit</th><th style={{ padding: 4, width: 140 }}>Credit</th><th style={{ padding: 4 }}>Memo</th><th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td style={{ padding: 4 }}>
                  <Select showSearch optionFilterProp="label" placeholder="Choose account" style={{ width: '100%' }} value={l.account_code} options={accountOptions} onChange={(v) => setLine(l.key, { account_code: v })} />
                </td>
                <td style={{ padding: 4 }}>
                  <InputNumber min={0} style={{ width: '100%' }} value={l.debit} onChange={(v) => setLine(l.key, { debit: v, credit: v ? null : l.credit })} />
                </td>
                <td style={{ padding: 4 }}>
                  <InputNumber min={0} style={{ width: '100%' }} value={l.credit} onChange={(v) => setLine(l.key, { credit: v, debit: v ? null : l.debit })} />
                </td>
                <td style={{ padding: 4 }}>
                  <Input value={l.memo} onChange={(e) => setLine(l.key, { memo: e.target.value })} />
                </td>
                <td style={{ padding: 4 }}>
                  <Button type="text" icon={<Trash2 size={15} />} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Space style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }} wrap>
          <Button icon={<Plus size={15} />} onClick={() => setLines((ls) => [...ls, blankLine()])}>Add line</Button>
          <Space>
            <Text>Debit <Text strong>{inr(totals.dr)}</Text></Text>
            <Text>Credit <Text strong>{inr(totals.cr)}</Text></Text>
            {totals.balanced ? <Text type="success">Balanced</Text> : <Text type="danger">Difference {inr(Math.abs(totals.dr - totals.cr))}</Text>}
          </Space>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          Control accounts are not offered here. The journal posts only after Finance or the Director / CFO (not you) approves it.
        </Text>
      </Modal>

      <Modal
        open={!!deciding}
        title={deciding && Number(deciding.journal.prepared_by) === Number(user?.id) ? 'Withdraw this journal' : 'Reject this journal'}
        onCancel={() => setDeciding(null)}
        onOk={reject}
        okText={deciding && Number(deciding.journal.prepared_by) === Number(user?.id) ? 'Withdraw' : 'Reject'}
        okButtonProps={{ danger: true }}
        confirmLoading={busy}
      >
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why?" />
      </Modal>
    </div>
  );
};

export default JournalEntry;
