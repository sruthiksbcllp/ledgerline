import React, { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Descriptions, Input, Modal, Radio, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { ClipboardCheck, Download } from 'lucide-react';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../utils/api';
import { addPdfBranding } from '../../utils/exportBranding';
import { getStoredUser } from '../../utils/session';
import { GIR_RESULT } from '../../constants/gir';

const { Text } = Typography;

// Roles that record inspections (the server enforces the same list; admins always may).
const INSPECT_ROLES = ['WAREHOUSE', 'PROCUREMENT', 'COMPLIANCE', 'ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN', 'PROVIDER_ADMIN', 'DEV_ADMIN'];
const ANSWER_LABEL = { YES: 'Yes', NO: 'No', NA: 'N/A' };
const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '-');

/**
 * Goods Inspection Report for one GRN: what arrived (from the GRN), an inspection checklist, a remark
 * per line, the overall result and the inspection note. Saving again updates the same report.
 */
const GoodsInspectionModal = ({ grn, open, onClose, onSaved }) => {
  const canInspect = INSPECT_ROLES.includes(String(getStoredUser()?.role || '').toUpperCase());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ checklist: {}, remarks: {}, result: null, note: '', date: dayjs() });

  useEffect(() => {
    if (!open || !grn?.id) return undefined;
    let live = true;
    setLoading(true); setData(null);
    api.get(`/goods-inspections/grn/${grn.id}`)
      .then((r) => {
        if (!live) return;
        const d = r?.data?.data;
        const gir = d?.gir;
        setData(d);
        setEditing(!gir);
        setForm({
          checklist: gir?.checklist || {},
          remarks: Object.fromEntries((gir?.line_findings || []).map((l) => [l.grn_item_id, l.remark || ''])),
          result: gir?.result || d?.suggested_result || null,
          note: gir?.inspection_note || '',
          date: gir?.inspection_date ? dayjs(gir.inspection_date) : dayjs()
        });
      })
      .catch((err) => { if (live) message.error(err?.response?.data?.message || 'Could not load the GRN for inspection'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, grn?.id]);

  const gir = data?.gir;
  const readOnly = !editing || !canInspect;
  const lines = readOnly && gir?.line_findings?.length ? gir.line_findings : (data?.lines || []);

  const save = async () => {
    if (form.note.trim().length < 5) { message.warning('Write the inspection note before saving'); return; }
    if (!form.result) { message.warning('Choose the inspection result'); return; }
    setSaving(true);
    try {
      const res = await api.post('/goods-inspections', {
        grn_id: grn.id,
        inspection_date: form.date ? form.date.format('YYYY-MM-DD') : undefined,
        result: form.result,
        checklist: form.checklist,
        inspection_note: form.note,
        line_findings: (data?.lines || []).map((l) => ({ grn_item_id: l.grn_item_id, remark: form.remarks[l.grn_item_id] || '' }))
      });
      message.success(res?.data?.message || 'Inspection report saved');
      setData((d) => ({ ...d, gir: res?.data?.data }));
      setEditing(false);
      onSaved?.();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not save the inspection report');
    } finally { setSaving(false); }
  };

  const downloadPdf = async () => {
    const doc = new jsPDF();
    let y = await addPdfBranding(doc, `Goods Inspection Report ${gir.gir_number}`);
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 },
      body: [
        ['GRN', data.grn.grn_number, 'PO', data.po?.po_number || '-'],
        ['Vendor', data.vendor?.vendor_name || '-', 'Received on', fmtDate(data.grn.received_date)],
        ['Inspected on', fmtDate(gir.inspection_date), 'Inspected by', gir.inspected_by_name || '-'],
        ['Result', GIR_RESULT[gir.result]?.[0] || gir.result, 'Invoice / challan', data.grn.invoice_number || '-']
      ],
      columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } }
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Item', 'Ordered', 'Received', 'Accepted', 'Rejected', 'Remark']],
      body: (gir.line_findings || []).map((l) => [l.item_name, l.ordered_quantity, l.received_quantity, l.accepted_quantity, l.rejected_quantity, l.remark || '']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] }
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Checklist', 'Answer']],
      body: (data.checklist || []).map((c) => [c.label, ANSWER_LABEL[gir.checklist?.[c.key]] || '-']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] }
    });
    y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text('Inspection note', 14, y);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(doc.splitTextToSize(gir.inspection_note || '', 180), 14, y + 6);
    doc.save(`${gir.gir_number}.pdf`);
  };

  const columns = [
    { title: 'Item', dataIndex: 'item_name', key: 'item' },
    { title: 'Ordered', dataIndex: 'ordered_quantity', key: 'ord', align: 'right' },
    { title: 'Received', dataIndex: 'received_quantity', key: 'rec', align: 'right' },
    { title: 'Accepted', dataIndex: 'accepted_quantity', key: 'acc', align: 'right', render: (v) => <Text type="success">{v}</Text> },
    { title: 'Rejected', dataIndex: 'rejected_quantity', key: 'rej', align: 'right', render: (v) => <Text type={Number(v) > 0 ? 'danger' : 'secondary'}>{v}</Text> },
    {
      title: 'Inspection remark', key: 'remark', width: 240,
      render: (_, l) => (readOnly
        ? <Text>{l.remark || <Text type="secondary">-</Text>}</Text>
        : <Input size="small" maxLength={500} placeholder="e.g. 2 units dented" value={form.remarks[l.grn_item_id] || ''}
            onChange={(e) => setForm((f) => ({ ...f, remarks: { ...f.remarks, [l.grn_item_id]: e.target.value } }))} />)
    }
  ];

  const footer = [
    <Button key="close" onClick={onClose}>Close</Button>,
    gir && !editing && <Button key="pdf" icon={<Download size={14} />} onClick={downloadPdf}>Download PDF</Button>,
    gir && !editing && canInspect && <Button key="edit" onClick={() => setEditing(true)}>Edit</Button>,
    !readOnly && <Button key="save" type="primary" loading={saving} onClick={save}>{gir ? 'Save changes' : 'Save inspection report'}</Button>
  ].filter(Boolean);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={880}
      footer={footer}
      title={<Space size={8}><ClipboardCheck size={18} />Goods Inspection Report{gir ? ` ${gir.gir_number}` : ''}</Space>}
    >
      <Spin spinning={loading}>
        {data && (
          <>
            {!gir && !canInspect && <Alert type="info" showIcon style={{ marginBottom: 12 }} message="These goods have not been inspected yet. Warehouse, Procurement or Compliance records the inspection." />}
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="GRN">{data.grn.grn_number}</Descriptions.Item>
              <Descriptions.Item label="PO">{data.po?.po_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{data.vendor?.vendor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="Received on">{fmtDate(data.grn.received_date)}</Descriptions.Item>
              {gir && <Descriptions.Item label="Inspected by">{gir.inspected_by_name || '-'}</Descriptions.Item>}
              {gir && <Descriptions.Item label="Result"><Tag color={GIR_RESULT[gir.result]?.[1]}>{GIR_RESULT[gir.result]?.[0] || gir.result}</Tag></Descriptions.Item>}
            </Descriptions>

            <Text strong>Goods received</Text>
            <Table rowKey="grn_item_id" size="small" pagination={false} columns={columns} dataSource={lines} style={{ margin: '8px 0 16px' }} />

            <Text strong>Inspection checklist</Text>
            <div style={{ margin: '8px 0 16px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
              {(data.checklist || []).map((c, i) => (
                <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 12px', borderTop: i ? '1px solid var(--color-border)' : 'none', flexWrap: 'wrap' }}>
                  <Text>{c.label}</Text>
                  {readOnly
                    ? <Tag color={form.checklist[c.key] === 'YES' ? 'success' : form.checklist[c.key] === 'NO' ? 'error' : 'default'}>{ANSWER_LABEL[form.checklist[c.key]] || 'Not answered'}</Tag>
                    : (
                      <Radio.Group size="small" optionType="button" value={form.checklist[c.key]}
                        onChange={(e) => setForm((f) => ({ ...f, checklist: { ...f.checklist, [c.key]: e.target.value } }))}
                        options={[{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }, { label: 'N/A', value: 'NA' }]} />
                    )}
                </div>
              ))}
            </div>

            <Space wrap size={16} style={{ marginBottom: 12 }}>
              <div>
                <Text strong>Inspection date</Text><br />
                {readOnly
                  ? <Text>{fmtDate(gir?.inspection_date)}</Text>
                  : <DatePicker value={form.date} onChange={(d) => setForm((f) => ({ ...f, date: d }))} format="DD MMM YYYY" allowClear={false}
                      disabledDate={(d) => d && d.isAfter(dayjs(), 'day')} style={{ marginTop: 4 }} />}
              </div>
              <div>
                <Text strong>Result</Text><br />
                {readOnly
                  ? (gir ? <Tag color={GIR_RESULT[gir.result]?.[1]}>{GIR_RESULT[gir.result]?.[0]}</Tag> : <Text type="secondary">-</Text>)
                  : <Select value={form.result} onChange={(v) => setForm((f) => ({ ...f, result: v }))} style={{ width: 200, marginTop: 4 }}
                      options={Object.entries(GIR_RESULT).map(([value, [label]]) => ({ value, label }))} />}
              </div>
            </Space>

            <div>
              <Text strong>Inspection note</Text>{!readOnly && <Text type="danger"> *</Text>}
              {readOnly
                ? <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--color-bg-page)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{gir?.inspection_note || <Text type="secondary">Not inspected yet</Text>}</div>
                : <Input.TextArea rows={4} maxLength={5000} showCount style={{ marginTop: 4 }} value={form.note}
                    placeholder="What was checked, what was found, and what happens to rejected goods (e.g. returned to vendor, replacement requested)"
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />}
            </div>
          </>
        )}
      </Spin>
    </Modal>
  );
};

export default GoodsInspectionModal;
