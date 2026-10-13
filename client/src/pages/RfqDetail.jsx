import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Tag, Space, message, Modal, Input, InputNumber, Descriptions } from 'antd';
import { Send, RefreshCcw } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';

const INVITE_COLOR = { PENDING: 'default', SENT: 'blue', RESPONDED: 'green', DECLINED: 'red' };

export default function RfqDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(false);
  const [respVendor, setRespVendor] = useState(null);
  const [respItems, setRespItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/rfqs/${id}`);
      setRfq(res?.data?.data || res?.data || null);
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to load RFQ'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const send = async () => {
    try { const r = await api.post(`/rfqs/${id}/send`); message.success(r?.data?.message || 'RFQ sent'); load(); }
    catch (e) { message.error(e?.response?.data?.message || 'Send failed'); }
  };

  const openResponse = (rv) => {
    setRespVendor(rv);
    setRespItems((rfq.items || []).map((it) => ({ item_name: it.item_name, quantity: it.quantity, unit_price: 0 })));
  };
  const submitResponse = async () => {
    try {
      await api.post(`/rfqs/${id}/vendors/${respVendor.vendor_id}/response`, { items: respItems });
      message.success('Response recorded as quotation');
      setRespVendor(null); load();
    } catch (e) { message.error(e?.response?.data?.message || 'Failed to record response'); }
  };

  // CR-P02: dense L1/L2/L3 ranking by response net_amount (lowest = L1)
  const _responded = (rfq?.vendors || []).filter(v => v.response && v.response.net_amount != null);
  const _sorted = [..._responded].sort((a, b) => Number(a.response.net_amount) - Number(b.response.net_amount));
  const rankMap = {}; let _rk = 0, _prev = null;
  _sorted.forEach(v => { const n = Number(v.response.net_amount); if (_prev === null || n !== _prev) { _rk += 1; _prev = n; } rankMap[v.id] = _rk; });

  const vendorCols = [
    { title: 'Vendor', key: 'v', render: (_, r) => r.vendor?.vendor_name || r.vendor_id },
    { title: 'Invite', dataIndex: 'invite_status', render: (s) => <Tag color={INVITE_COLOR[s] || 'default'}>{s}</Tag> },
    { title: 'Quotation', key: 'q', render: (_, r) => (r.response ? r.response.quotation_number : '—') },
    { title: 'Net Amount', key: 'amt', render: (_, r) => (r.response ? Number(r.response.net_amount).toLocaleString('en-IN') : '—') },
    { title: 'Rank', key: 'rank', render: (_, r) => (rankMap[r.id] ? <Tag color={rankMap[r.id] === 1 ? 'green' : 'default'}>{'L' + rankMap[r.id]}</Tag> : '—') },
    { title: 'Action', key: 'a', render: (_, r) => (r.invite_status !== 'RESPONDED'
        ? <Button size="small" onClick={() => openResponse(r)}>Record response</Button> : null) }
  ];
  const respCols = [
    { title: 'Item', dataIndex: 'item_name' },
    { title: 'Qty', dataIndex: 'quantity', width: 90 },
    { title: 'Unit Price', dataIndex: 'unit_price', width: 140, render: (_, r, i) => <InputNumber min={0} value={r.unit_price} onChange={(v) => { const n = [...respItems]; n[i].unit_price = v; setRespItems(n); }} /> }
  ];

  return (
    <div style={{ padding: 'var(--space-4, 16px)' }}>
      <PageHeader title={rfq ? `RFQ ${rfq.rfq_number}` : 'RFQ'} subtitle={rfq?.title} />
      <Card loading={loading} style={{ borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-medium)', marginBottom: 16 }}>
        {rfq && (
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Status"><Tag>{rfq.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Due">{rfq.due_date ? new Date(rfq.due_date).toDateString() : '—'}</Descriptions.Item>
          </Descriptions>
        )}
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<Send size={14} />} style={{ background: 'var(--gradient-orange)', border: 'none' }} onClick={send}>Send RFQ</Button>
          <Button icon={<RefreshCcw size={14} />} onClick={load}>Refresh</Button>
          <Button onClick={() => navigate('/procurement/rfq')}>Back</Button>
        </Space>
        <Table rowKey="id" title={() => 'Vendors & Responses'} columns={vendorCols} dataSource={rfq?.vendors || []} pagination={false} size="small" />
      </Card>

      <Modal open={!!respVendor} title={`Record response — ${respVendor?.vendor?.vendor_name || ''}`} onCancel={() => setRespVendor(null)} onOk={submitResponse} okText="Save as Quotation">
        <Table rowKey={(_, i) => i} columns={respCols} dataSource={respItems} pagination={false} size="small" />
      </Modal>
    </div>
  );
}
