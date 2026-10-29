import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, Row, Space, Table, Tag, Typography, message, Modal, Descriptions } from 'antd';
import { RefreshCcw, PackageCheck, Eye, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';
import GRNDrawer from '../components/procurement/GRNDrawer';
import PageHeader from '../components/PageHeader';
import { ActivityTrail, lastActionColumn, useLastActions } from '../components/procurement/ActivityTrail';
import ReturnToVendorModal from '../components/procurement/ReturnToVendorModal';
import { getStoredUser } from '../utils/session';

const { Title, Text } = Typography;

// Roles that record returns to the vendor (the server enforces the same list; admins always may).
const RETURN_ROLES = ['WAREHOUSE', 'PROCUREMENT', 'ACCOUNTS_PAYABLE', 'FINANCE', 'ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];
const RETURN_STATUS = { RETURNED: ['Returned', 'blue'], AWAITING_CREDIT_NOTE: ['Awaiting credit note', 'orange'], CREDIT_NOTE_RECEIVED: ['Credit note received', 'green'] };

const contentCard = { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' };

const GRNManagement = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [approvedPOs, setApprovedPOs] = useState([]);
  const [grns, setGrns] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [viewGrn, setViewGrn] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewJournals, setViewJournals] = useState([]); // AP journal entries posted for the GRN
  const [viewReturns, setViewReturns] = useState([]); // returns to vendor recorded on the GRN
  const [returnOpen, setReturnOpen] = useState(false);
  const canReturn = RETURN_ROLES.includes(String(getStoredUser()?.role || '').toUpperCase());

  const loadReturns = (grnId) => api.get('/purchase-returns', { params: { grn_id: grnId } })
    .then((r) => setViewReturns(normalizeResponse(r?.data)))
    .catch(() => setViewReturns([]));

  const openView = async (grn) => {
    setViewGrn({ ...grn }); setViewLoading(true); setViewJournals([]); setViewReturns([]);
    loadReturns(grn.id);
    // Roles without AP journal access (e.g. Warehouse) just do not see this section.
    api.get(`/ap-journals/source/GRN/${grn.id}`).then((r) => setViewJournals(normalizeResponse(r?.data))).catch(() => setViewJournals([]));
    try {
      const res = await api.get(`/grn/${grn.id}`);
      const full = res?.data?.data || res?.data || grn;
      setViewGrn(full);
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to load GRN details');
    } finally { setViewLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [poRes, grnRes] = await Promise.all([
        api.get('/procurement/grn/purchase-orders'),
        api.get('/procurement/grn')
      ]);
      setApprovedPOs(normalizeResponse(poRes?.data));
      setGrns(normalizeResponse(grnRes?.data));
    } catch (err) {
      message.error(err?.response?.data?.message || 'Failed to load GRN data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateGRN = (po) => {
    setSelectedPO(po);
    setDrawerOpen(true);
  };

  const lastPo = useLastActions('PO', approvedPOs, approvedPOs);
  const lastGrn = useLastActions('GRN', grns, grns);

  const poColumns = [
    { title: 'PO Number', dataIndex: 'po_number', key: 'po_number' },
    { title: 'Vendor', key: 'vendor', render: (_, r) => r?.Vendor?.vendor_name || '-' },
    { title: 'Amount', dataIndex: 'total_amount', key: 'total_amount', align: 'right', render: (v) => `₹${Number(v || 0).toLocaleString('en-IN')}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color="processing">{v || 'APPROVED'}</Tag> },
    lastActionColumn('PO', lastPo, { numberOf: (r) => r.po_number }),
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Button type="primary" onClick={() => openCreateGRN(r)} style={{ borderRadius: 'var(--radius-md)' }}>
          Create GRN
        </Button>
      )
    }
  ];

  const grnColumns = [
    { title: 'GRN Number', dataIndex: 'grn_number', key: 'grn_number' },
    { title: 'PO Number', key: 'po_number', render: (_, r) => r?.PurchaseOrder?.po_number || '-' },
    { title: 'Received Date', dataIndex: 'received_date', key: 'received_date', render: (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '-') },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v) => <Tag color={String(v).toUpperCase() === 'RECEIVED' ? 'success' : 'default'}>{v || 'RECEIVED'}</Tag> },
    {
      title: 'Invoice Processing', key: 'invoice',
      render: (_, r) => {
        const inv = (r.Invoices || [])[0];
        if (!inv) return <Text type="secondary">Not invoiced</Text>;
        return (
          <Space size={6}>
            <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => navigate('/procurement/invoices')}>{inv.invoice_number}</Button>
            <Tag color={inv.matching_status === 'MISMATCHED' ? 'error' : inv.status === 'PAID' ? 'success' : 'processing'}>
              {inv.matching_status === 'MISMATCHED' ? 'Match exception' : inv.status}
            </Tag>
          </Space>
        );
      }
    },
    lastActionColumn('GRN', lastGrn, { numberOf: (r) => r.grn_number }),
    {
      title: 'Action', key: 'action', width: 90,
      render: (_, r) => (
        <Button type="text" size="small" icon={<Eye size={15} />} onClick={() => openView(r)}>View</Button>
      )
    }
  ];

  const viewItems = viewGrn?.GRNItems || viewGrn?.GRNItem || viewGrn?.items || [];
  const viewItemColumns = [
    { title: 'Item', dataIndex: 'item_name', key: 'item_name' },
    { title: 'Ordered', dataIndex: 'ordered_quantity', key: 'ordered', align: 'right', render: (v) => Number(v || 0) },
    { title: 'Received', dataIndex: 'received_quantity', key: 'received', align: 'right', render: (v) => Number(v || 0) },
    { title: 'Accepted', dataIndex: 'accepted_quantity', key: 'accepted', align: 'right', render: (v) => <Text type="success">{Number(v || 0)}</Text> },
    { title: 'Rejected', dataIndex: 'rejected_quantity', key: 'rejected', align: 'right', render: (v) => <Text type={Number(v) > 0 ? 'danger' : 'secondary'}>{Number(v || 0)}</Text> },
    { title: 'QC', dataIndex: 'qc_status', key: 'qc', render: (v) => <Tag color={v === 'PASS' ? 'success' : v === 'FAIL' ? 'error' : 'default'}>{v || '-'}</Tag> },
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader
        icon={<PackageCheck size={16} />}
        title="Goods Receipt (GRN)"
        subtitle="Create GRN from approved PO and track received entries"
        actions={<Button icon={<RefreshCcw size={16} />} onClick={load} loading={loading}>Refresh</Button>}
      />

      <Card title="Approved Purchase Orders" style={{ ...contentCard, marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
        <Table scroll={{ x: 'max-content' }}
          rowKey="id"
          loading={loading}
          dataSource={approvedPOs}
          columns={poColumns}
          size="middle"
          pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: ['10','25','50'], showTotal: (t) => `${t} records`, position: ['bottomRight'] }}
          locale={{ emptyText: <Empty description="No approved PO available for GRN" /> }}
        />
      </Card>

      <Card title="GRN Register" style={contentCard} styles={{ body: { padding: 0 } }}>
        <Table scroll={{ x: 'max-content' }}
          rowKey="id"
          loading={loading}
          dataSource={grns}
          columns={grnColumns}
          size="middle"
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10','25','50'], showTotal: (t) => `${t} records`, position: ['bottomRight'] }}
          locale={{ emptyText: <Empty description="No GRN records found" /> }}
        />
      </Card>

      <GRNDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        po={selectedPO}
        onRefresh={load}
      />

      <Modal
        open={!!viewGrn}
        onCancel={() => setViewGrn(null)}
        footer={null}
        width={760}
        title={`GRN ${viewGrn?.grn_number || ''}`}
      >
        {viewGrn && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="PO Number">{viewGrn?.PurchaseOrder?.po_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="PR Number">{viewGrn?.PurchaseOrder?.PurchaseRequisition?.pr_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Received Date">{viewGrn?.received_date ? new Date(viewGrn.received_date).toLocaleDateString('en-IN') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={String(viewGrn?.status).toUpperCase() === 'RECEIVED' ? 'success' : 'default'}>{viewGrn?.status || '-'}</Tag></Descriptions.Item>
            </Descriptions>
            <Table
              rowKey={(r) => r.id}
              loading={viewLoading}
              dataSource={viewItems}
              columns={viewItemColumns}
              size="small"
              pagination={false}
              locale={{ emptyText: 'No line items' }}
            />
            <div style={{ marginTop: 20 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong>Returns to vendor{viewReturns.length ? ` (${viewReturns.length})` : ''}</Text>
                {canReturn && <Button icon={<Undo2 size={14} />} onClick={() => setReturnOpen(true)}>Return to vendor</Button>}
              </Space>
              {viewReturns.length === 0
                ? <Text type="secondary">No goods returned on this GRN.</Text>
                : (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={viewReturns}
                    columns={[
                      { title: 'Return', dataIndex: 'return_number', key: 'no' },
                      { title: 'Date', dataIndex: 'return_date', key: 'date', render: (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '-') },
                      { title: 'Items', key: 'items', render: (_, r) => (r.items || []).map((i) => `${Number(i.quantity)} × ${i.item_name}`).join(', ') },
                      { title: 'Amount', dataIndex: 'total_amount', key: 'amt', align: 'right', render: (v) => `₹${Number(v || 0).toLocaleString('en-IN')}` },
                      { title: 'Status', dataIndex: 'status', key: 'st', render: (v) => <Tag color={RETURN_STATUS[v]?.[1]}>{RETURN_STATUS[v]?.[0] || v}</Tag> }
                    ]}
                  />
                )}
            </div>
            {viewJournals.map((je) => (
              <div key={je.id} style={{ marginTop: 20 }}>
                <Space size={8} style={{ marginBottom: 8 }}>
                  <Text strong>Journal entry {je.je_number}</Text>
                  <Text type="secondary">{je.entry_date ? new Date(je.entry_date).toLocaleDateString('en-IN') : ''}</Text>
                  <Tag color={je.status === 'REVERSED' ? 'default' : 'success'}>{je.status}</Tag>
                </Space>
                <Table
                  rowKey="id"
                  dataSource={je.lines || []}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: 'Account', key: 'account', render: (_, l) => <Text style={{ paddingLeft: Number(l.credit) > 0 ? 24 : 0 }}>{Number(l.credit) > 0 ? 'Cr' : 'Dr'} {l.account_code} · {l.account_name}</Text> },
                    { title: 'Debit', dataIndex: 'debit', key: 'debit', align: 'right', render: (v) => (Number(v) > 0 ? `₹${Number(v).toLocaleString('en-IN')}` : '') },
                    { title: 'Credit', dataIndex: 'credit', key: 'credit', align: 'right', render: (v) => (Number(v) > 0 ? `₹${Number(v).toLocaleString('en-IN')}` : '') }
                  ]}
                />
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <ActivityTrail module="GRN" id={viewGrn.id} refreshKey={grns} />
            </div>
          </>
        )}
      </Modal>

      <ReturnToVendorModal
        grn={viewGrn}
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        onSaved={() => { if (viewGrn) loadReturns(viewGrn.id); load(); }}
      />
    </div>
  );
};

export default GRNManagement;
