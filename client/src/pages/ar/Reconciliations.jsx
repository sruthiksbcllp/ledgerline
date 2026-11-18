import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, DatePicker, Input, InputNumber, Row, Space, Tag, Typography, message } from 'antd';
import { Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { PageHeader } from '../../components/ar/ArShared';
import { getStoredUser, hasPerm } from '../../utils/session';
import { card, errorOf, fmt, inr } from '../../utils/arFlow';

const { Text } = Typography;

/** Bank or GST reconciliation: the book figure against the outside figure entered here. */
const BookRec = ({ item, period, canPrepare, onSaved }) => {
  const [amount, setAmount] = useState(item.statement_amount);
  const [note, setNote] = useState(item.note || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAmount(item.statement_amount); setNote(item.note || ''); }, [item]);
  const diff = amount === null || amount === undefined ? null : Math.round((item.book_amount - Number(amount)) * 100) / 100;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post('/r2r/reconciliations', { period, rec_type: item.rec_type, statement_amount: amount, note: note || null });
      message.success(r?.data?.message || 'Saved');
      onSaved();
    } catch (e) {
      message.error(errorOf(e, 'Could not save the reconciliation'));
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/r2r/reconciliations/${item.id}/review`, {});
      message.success(r?.data?.message || 'Reviewed');
      onSaved();
    } catch (e) {
      message.error(errorOf(e, 'Could not review the reconciliation'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      style={{ ...card, height: '100%' }}
      title={item.name}
      extra={item.statement_amount === null ? <Tag>Not prepared</Tag> : item.reconciled ? <Tag color="success">Reconciled</Tag> : <Tag color="warning">Difference explained</Tag>}
    >
      <Text type="secondary">{item.compare} against {item.against.toLowerCase()}</Text>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <Text>{item.compare}</Text>
        <Text strong>{inr(item.book_amount)}</Text>
      </div>
      <div style={{ marginTop: 12 }}>
        <Text>{item.against}</Text>
        <InputNumber style={{ width: '100%', marginTop: 4 }} value={amount} onChange={setAmount} disabled={!canPrepare} placeholder="Enter the figure" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <Text>Difference</Text>
        <Text strong type={diff && Math.abs(diff) >= 0.01 ? 'danger' : undefined}>{diff === null ? '—' : inr(diff)}</Text>
      </div>
      <Input.TextArea
        style={{ marginTop: 12 }} rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!canPrepare}
        placeholder="Explain any difference (timing items, charges not yet booked, etc.)"
      />
      <div style={{ marginTop: 12, fontSize: 12 }}>
        {item.prepared_by_name && <div>Prepared by {item.prepared_by_name} on {fmt(item.prepared_at)}</div>}
        {item.reviewed_by_name && <div>Reviewed by {item.reviewed_by_name} on {fmt(item.reviewed_at)}</div>}
        {item.review_block && <Text type="secondary">{item.review_block}</Text>}
      </div>
      <Space style={{ marginTop: 12 }}>
        {canPrepare && <Button type="primary" loading={busy} disabled={amount === null || amount === undefined} onClick={save}>Save</Button>}
        {item.can_review && <Button loading={busy} onClick={review}>Review and sign</Button>}
      </Space>
    </Card>
  );
};

const Reconciliations = () => {
  const navigate = useNavigate();
  const canPrepare = hasPerm(getStoredUser(), 'R2R', 'ADD');
  const [month, setMonth] = useState(dayjs());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const period = month.format('YYYY-MM');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/r2r/reconciliations', { params: { period } });
      setData(r?.data?.data || null);
    } catch (e) {
      message.error(errorOf(e, 'Could not load the reconciliations'));
    } finally {
      setLoading(false);
    }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const byType = (t) => items.find((i) => i.rec_type === t);
  const customer = byType('CUSTOMER');
  const vendor = byType('VENDOR');

  return (
    <div>
      <PageHeader
        icon={<Scale size={22} />}
        title="Reconciliations"
        subtitle="Reconciliations check the books against outside records. Prepared by one person, reviewed by another."
        actions={[<DatePicker key="m" picker="month" value={month} onChange={(v) => setMonth(v || dayjs())} allowClear={false} format="MMMM YYYY" />]}
      />
      {data && <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>Book figures as of {fmt(data.as_of)}. A difference must be explained in the note before it can be saved.</Text>}
      {loading && !data && <Card loading style={card} />}
      <Row gutter={[16, 16]}>
        {['BANK', 'GST'].map((t) => byType(t) && (
          <Col xs={24} lg={12} key={t}>
            <BookRec item={byType(t)} period={period} canPrepare={canPrepare} onSaved={load} />
          </Col>
        ))}
        {customer && (
          <Col xs={24} lg={12}>
            <Card
              style={{ ...card, height: '100%' }}
              title={customer.name}
              extra={customer.sent === 0 ? <Tag>No statements yet</Tag> : customer.reconciled ? <Tag color="success">All confirmed</Tag> : <Tag color="warning">Open items</Tag>}
            >
              <Text type="secondary">{customer.compare} against {customer.against.toLowerCase()}</Text>
              <Row gutter={16} style={{ marginTop: 12 }}>
                {[['Sent', customer.sent], ['Agreed', customer.agreed], ['Disputed', customer.disputed], ['Waiting for reply', customer.pending]].map(([label, value]) => (
                  <Col span={6} key={label}><Text type="secondary" style={{ fontSize: 12 }}>{label}</Text><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div></Col>
                ))}
              </Row>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <Text>Difference on disputed statements</Text>
                <Text strong type={customer.difference ? 'danger' : undefined}>{inr(customer.difference)}</Text>
              </div>
              <Button style={{ marginTop: 12 }} onClick={() => navigate('/finance/ar/ar-close?tab=statements')}>Open customer statements</Button>
            </Card>
          </Col>
        )}
        {vendor && (
          <Col xs={24} lg={12}>
            <Card style={{ ...card, height: '100%' }} title={vendor.name}>
              <Text type="secondary">{vendor.compare} against {vendor.against.toLowerCase()}</Text>
              <Alert style={{ marginTop: 12 }} type="info" showIcon message="Managed in Accounts Payable" />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default Reconciliations;
