import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, DatePicker, Divider, Empty, Form, InputNumber, Input, Modal, Popover, Progress, Space, Spin, Tooltip, Typography, message } from 'antd';
import { Wallet } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api';
import { getStoredUser } from '../../utils/session';

const { Text } = Typography;
const ADMIN_ROLES = ['SUPER_ADMIN', 'PROVIDER_ADMIN', 'ADMIN', 'CLIENT_ADMIN', 'DEV_ADMIN'];
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const monthName = (p) => dayjs(`${p}-01`).format('MMMM YYYY');

const Row2 = ({ label, value, strong, type }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '3px 0' }}>
    <Text type="secondary">{label}</Text>
    <Text strong={strong} type={type}>{value}</Text>
  </div>
);

/**
 * Wallet button for the Purchase Orders page: this month's purchase fund (limit, carried forward,
 * used by approved POs, awaiting approval, balance) in a pop-up. Admins set the monthly limit here.
 * Turns red when the month is over its limit.
 */
const PoFundButton = ({ refreshKey }) => {
  const isAdmin = ADMIN_ROLES.includes(String(getStoredUser()?.role || '').toUpperCase());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    api.get('/po-fund/summary')
      .then((r) => setData(r?.data?.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const saveLimit = async (values) => {
    setSaving(true);
    try {
      const res = await api.put('/po-fund/limit', { period: values.period.format('YYYY-MM'), limit_amount: values.limit_amount, remarks: values.remarks });
      message.success(res?.data?.message || 'Monthly fund limit saved');
      setData(res?.data?.data || null);
      setLimitOpen(false);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not save the limit');
    } finally { setSaving(false); }
  };

  const openLimit = () => {
    form.setFieldsValue({ period: dayjs().startOf('month'), limit_amount: data?.limit_row?.limit_amount || undefined, remarks: '' });
    setLimitOpen(true);
  };

  const over = data?.configured && data.balance < 0;
  const low = data?.configured && !over && data.available > 0 && data.balance / data.available < 0.1;
  const color = over ? 'var(--color-danger, #dc2626)' : low ? '#d97706' : 'var(--color-success, #16a34a)';
  const pct = data?.available > 0 ? Math.min(100, Math.round((data.used / data.available) * 100)) : (data?.used > 0 ? 100 : 0);

  let content;
  if (loading && !data) content = <div style={{ width: 300, textAlign: 'center', padding: 16 }}><Spin /></div>;
  else if (!data?.configured || data.before_first_limit) {
    content = (
      <div style={{ width: 300 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data?.before_first_limit ? `The fund limit starts from ${monthName(data.first_period)}` : 'No monthly fund limit set yet'} />
        {isAdmin && <Button type="primary" block onClick={openLimit}>Set monthly limit</Button>}
      </div>
    );
  } else {
    content = (
      <div style={{ width: 320 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Balance available</Text>
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.2 }}>{over ? `-${inr(-data.balance)}` : inr(data.balance)}</div>
        <Progress percent={pct} showInfo={false} strokeColor={color} size="small" style={{ margin: '6px 0 2px' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>{data.utilisation_pct != null ? `${data.utilisation_pct}% used` : ''}</Text>
        {over && <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>Limit exceeded by {inr(data.over_by)} this month</div>}
        {low && <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: '#fffbeb', color: '#b45309', fontSize: 12, fontWeight: 600 }}>Less than 10% of this month&apos;s fund is left</div>}
        <Divider style={{ margin: '10px 0' }} />
        <Row2 label="Monthly limit" value={inr(data.limit)} />
        <Row2 label="Carried forward" value={inr(data.carried_in)} />
        <Row2 label="Total available" value={inr(data.available)} strong />
        <Row2 label={`Used by approved POs (${data.approved_count})`} value={`- ${inr(data.used)}`} />
        <Row2 label="Balance" value={over ? `-${inr(-data.balance)}` : inr(data.balance)} strong type={over ? 'danger' : undefined} />
        {data.awaiting_count > 0 && (
          <>
            <Divider style={{ margin: '10px 0' }} />
            <Row2 label={`Awaiting approval (${data.awaiting_count})`} value={inr(data.awaiting_approval)} />
            <Row2 label="Balance if all approved" value={data.balance_after_awaiting < 0 ? `-${inr(-data.balance_after_awaiting)}` : inr(data.balance_after_awaiting)} type={data.balance_after_awaiting < 0 ? 'danger' : undefined} />
          </>
        )}
        {data.history?.length > 1 && (
          <>
            <Divider style={{ margin: '10px 0' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Previous months</Text>
            {data.history.slice(1, 4).map((h) => (
              <Row2 key={h.period} label={dayjs(`${h.period}-01`).format('MMM YYYY')} value={<span>{inr(h.used)} of {inr(h.available)}</span>} type={h.balance < 0 ? 'danger' : undefined} />
            ))}
          </>
        )}
        {isAdmin && <Button block style={{ marginTop: 12 }} onClick={openLimit}>Change monthly limit</Button>}
      </div>
    );
  }

  return (
    <>
      <Popover trigger="click" placement="bottomRight" onOpenChange={(o) => { if (o) load(); }}
        title={<Space size={8}><Wallet size={16} />Purchase fund · {monthName(data?.period || dayjs().format('YYYY-MM'))}</Space>}
        content={content}>
        <Tooltip title="Monthly purchase fund">
          <Badge dot={over || low} color={over ? 'red' : 'orange'} offset={[-4, 4]}>
            <Button icon={<Wallet size={16} style={{ color: data?.configured ? color : undefined }} />}>
              {data?.configured && !data.before_first_limit ? (over ? 'Over limit' : inr(data.balance)) : 'Fund'}
            </Button>
          </Badge>
        </Tooltip>
      </Popover>

      <Modal title="Monthly purchase fund limit" open={limitOpen} onCancel={() => setLimitOpen(false)} onOk={() => form.submit()} okText="Save limit" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={saveLimit}>
          <Form.Item name="period" label="Applies from month" rules={[{ required: true, message: 'Choose the month' }]}
            extra="The limit applies from this month until you change it. Unused balance carries forward to the next month.">
            <DatePicker picker="month" format="MMMM YYYY" style={{ width: '100%' }} allowClear={false} disabledDate={(d) => d && d.isBefore(dayjs().startOf('month'))} />
          </Form.Item>
          <Form.Item name="limit_amount" label="Limit per month (₹)" rules={[{ required: true, message: 'Enter the limit' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g. 500000"
              formatter={(v) => (v ? `₹ ${Number(v).toLocaleString('en-IN')}` : '')} parser={(v) => String(v || '').replace(/[^\d.]/g, '')} />
          </Form.Item>
          <Form.Item name="remarks" label="Note (optional)">
            <Input maxLength={500} placeholder="e.g. Approved by CFO for Q3" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default PoFundButton;
