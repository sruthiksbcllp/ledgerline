import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Space, Tag, Drawer, Select, Input, InputNumber, Switch, message, Popconfirm, Typography, Divider } from 'antd';
import { Plus, Trash2, Pencil, GitBranch } from 'lucide-react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;
const SPEC_LABELS = {
  NAMED: 'Named person (email link)',
  DYNAMIC_INITIATOR_HEAD: "Initiator's Sub-LoB Head (auto)",
  DYNAMIC_FACILITATOR_HEAD: 'Facilitator Head (auto)',
  ANY_ONE_OF_GROUP: 'Any one of a group',
  ROLE: 'Any user with role',
  MANUAL: 'Manual — initiator picks the approver at PO submit',
};
const blankApprover = (pos) => ({ position: pos || 1, spec_type: 'NAMED', approver_name: '', approver_email: '', role_code: '', _membersText: '' });
const blankSlab = () => ({ min_amount: 0, max_amount: null, label: '', approvers: [blankApprover(1)] });
const blankPolicy = () => ({ id: null, department_id: null, expense_type: 'OPEX', org_level: 'SUB_LOB', name: '', is_active: true, slabs: [blankSlab()] });

export default function DoaMatrixConfig() {
  const [meta, setMeta] = useState({ departments: [], expense_types: ['OPEX', 'CAPEX'], spec_types: [] });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState(blankPolicy());
  const [hdOpen, setHdOpen] = useState(false);
  const [hdRows, setHdRows] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [m, l] = await Promise.all([api.get('/doa-config/meta'), api.get('/doa-config/policies')]);
      setMeta(m?.data?.data || meta);
      setRows(l?.data?.data || []);
    } catch { message.error('Failed to load matrices'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setP(blankPolicy()); setOpen(true); };
  const openEdit = async (id) => {
    try {
      const r = await api.get(`/doa-config/policies/${id}`);
      const d = r?.data?.data;
      d.slabs = (d.slabs || []).map((s) => ({ ...s, approvers: (s.approvers || []).map((a) => ({ ...a, _membersText: (a.members || []).map((m) => `${m.approver_name || ''}, ${m.approver_email || ''}`).join('\n') })) }));
      setP(d); setOpen(true);
    } catch { message.error('Failed to load policy'); }
  };
  const del = async (id) => { try { await api.delete(`/doa-config/policies/${id}`); message.success('Deleted'); load(); } catch { message.error('Delete failed'); } };
  const openHeads = async () => { try { const r = await api.get('/doa-config/department-heads'); setHdRows(r?.data?.data || []); setHdOpen(true); } catch { message.error('Failed to load department heads'); } };
  const setHd = (i, patch) => setHdRows((x) => x.map((r, j) => j === i ? { ...r, ...patch } : r));
  const saveHead = async (row) => { try { await api.post('/doa-config/department-heads', row); message.success('Saved ' + row.department_name); } catch { message.error('Save failed'); } };

  // immutable nested updaters
  const setSlab = (si, patch) => setP((x) => ({ ...x, slabs: x.slabs.map((s, i) => i === si ? { ...s, ...patch } : s) }));
  const addSlab = () => setP((x) => ({ ...x, slabs: [...x.slabs, blankSlab()] }));
  const rmSlab = (si) => setP((x) => ({ ...x, slabs: x.slabs.filter((_, i) => i !== si) }));
  const setAppr = (si, ai, patch) => setP((x) => ({ ...x, slabs: x.slabs.map((s, i) => i !== si ? s : { ...s, approvers: s.approvers.map((a, j) => j === ai ? { ...a, ...patch } : a) }) }));
  const addAppr = (si) => setP((x) => ({ ...x, slabs: x.slabs.map((s, i) => i !== si ? s : { ...s, approvers: [...s.approvers, blankApprover((s.approvers.length ? Math.max(...s.approvers.map((a) => a.position)) : 0) + 1)] }) }));
  const rmAppr = (si, ai) => setP((x) => ({ ...x, slabs: x.slabs.map((s, i) => i !== si ? s : { ...s, approvers: s.approvers.filter((_, j) => j !== ai) }) }));

  const save = async () => {
    if (!p.expense_type) return message.error('Pick an expense type');
    setSaving(true);
    try {
      const payload = { ...p, slabs: p.slabs.map((s) => ({ min_amount: s.min_amount, max_amount: s.max_amount, label: s.label,
        approvers: s.approvers.map((a) => ({ position: a.position, spec_type: a.spec_type, approver_name: a.approver_name, approver_email: a.approver_email, role_code: a.role_code,
          members: a.spec_type === 'ANY_ONE_OF_GROUP' ? (a._membersText || '').split('\n').map((ln) => ln.trim()).filter(Boolean).map((ln) => { const [nm, em] = ln.split(',').map((z) => (z || '').trim()); return { approver_name: nm || null, approver_email: em || nm || null }; }) : [] })) })) };
      await api.post('/doa-config/policies', payload);
      message.success('Matrix saved'); setOpen(false); load();
    } catch (e) { message.error(e?.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (v) => <b>{v || '-'}</b> },
    { title: 'Department', dataIndex: 'department_name', render: (v) => <Tag>{v || 'Any'}</Tag> },
    { title: 'Expense', dataIndex: 'expense_type', render: (v) => <Tag color={v === 'CAPEX' ? 'purple' : 'blue'}>{v}</Tag> },
    { title: 'Slabs', dataIndex: 'slab_count' },
    { title: 'Active', dataIndex: 'is_active', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag> },
    { title: 'Actions', key: 'a', render: (_, r) => (
      <Space>
        <Button size="small" icon={<Pencil size={14} />} onClick={() => openEdit(r.id)}>Edit</Button>
        <Popconfirm title="Delete this matrix?" onConfirm={() => del(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<Trash2 size={14} />} />
        </Popconfirm>
      </Space>
    ) },
  ];

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>
      <PageHeader icon={<GitBranch size={16} />} title="Approval Matrix" subtitle="Delegation-of-Authority configuration"
        actions={<Space><Button icon={<GitBranch size={16} />} onClick={openHeads}>Department Heads</Button><Button type="primary" icon={<Plus size={16} />} onClick={openNew}>New Matrix</Button></Space>} />
      <Card style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }} styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={false} />
      </Card>

      <Drawer title={p.id ? 'Edit Matrix' : 'New Matrix'} open={open} onClose={() => setOpen(false)} width={620}
        extra={<Button type="primary" loading={saving} onClick={save}>Save</Button>}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div><Text type="secondary">Department</Text><br />
              <Select allowClear placeholder="Any department" style={{ width: 200 }} value={p.department_id}
                onChange={(v) => setP((x) => ({ ...x, department_id: v || null }))}
                options={(meta.departments || []).map((d) => ({ label: d.dept_name, value: d.id }))} /></div>
            <div><Text type="secondary">Expense</Text><br />
              <Select style={{ width: 120 }} value={p.expense_type} onChange={(v) => setP((x) => ({ ...x, expense_type: v }))}
                options={(meta.expense_types || ['OPEX', 'CAPEX']).map((e) => ({ label: e, value: e }))} /></div>
            <div><Text type="secondary">Active</Text><br /><Switch checked={p.is_active} onChange={(v) => setP((x) => ({ ...x, is_active: v }))} /></div>
          </div>
          <div><Text type="secondary">Matrix name</Text><Input value={p.name} placeholder="e.g. IT Opex" onChange={(e) => setP((x) => ({ ...x, name: e.target.value }))} /></div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 10px' }}>Approvers use <b>email-link</b> approval \u2014 pick <b>"Named person (email link)"</b> and give a name + email for anyone who must approve. Same <b>Level</b> = parallel (all must approve); higher levels run only after lower ones. The two "auto head" options resolve automatically to the mapped department heads — configure those under <b>Department Heads</b>.</div>

          {p.slabs.map((s, si) => (
            <Card key={si} size="small" title={`Cost slab ${si + 1}`} style={{ borderRadius: 8 }}
              extra={p.slabs.length > 1 ? <Button size="small" danger type="text" icon={<Trash2 size={14} />} onClick={() => rmSlab(si)} /> : null}>
              <Space wrap style={{ marginBottom: 10 }}>
                <InputNumber addonBefore="Min ₹" style={{ width: 170 }} value={s.min_amount} min={0} onChange={(v) => setSlab(si, { min_amount: v })} />
                <InputNumber addonBefore="Max ₹" style={{ width: 170 }} value={s.max_amount} min={0} placeholder="(no cap)" onChange={(v) => setSlab(si, { max_amount: v })} />
                <Input addonBefore="Label" style={{ width: 160 }} value={s.label} onChange={(e) => setSlab(si, { label: e.target.value })} />
              </Space>
              <Divider style={{ margin: '4px 0 10px' }} orientation="left" plain><Text type="secondary" style={{ fontSize: 12 }}>Approvers (level = position; same position = parallel)</Text></Divider>
              {s.approvers.map((a, ai) => (
                <div key={ai} style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                  <Space wrap style={{ marginBottom: 6 }}>
                    <InputNumber addonBefore="Level" style={{ width: 110 }} min={1} value={a.position} onChange={(v) => setAppr(si, ai, { position: v })} />
                    <Select style={{ width: 240 }} value={a.spec_type} onChange={(v) => setAppr(si, ai, { spec_type: v })}
                      options={Object.keys(SPEC_LABELS).map((k) => ({ label: SPEC_LABELS[k], value: k }))} />
                    <Button size="small" danger type="text" icon={<Trash2 size={14} />} onClick={() => rmAppr(si, ai)} />
                  </Space>
                  {a.spec_type === 'NAMED' && (
                    <Space wrap>
                      <Input placeholder="Name" style={{ width: 200 }} value={a.approver_name} onChange={(e) => setAppr(si, ai, { approver_name: e.target.value })} />
                      <Input placeholder="Email" style={{ width: 240 }} value={a.approver_email} onChange={(e) => setAppr(si, ai, { approver_email: e.target.value })} />
                    </Space>
                  )}
                  {a.spec_type === 'ROLE' && <Input placeholder="Role code (e.g. FINANCE)" style={{ width: 240 }} value={a.role_code} onChange={(e) => setAppr(si, ai, { role_code: e.target.value })} />}
                  {(a.spec_type === 'DYNAMIC_INITIATOR_HEAD' || a.spec_type === 'DYNAMIC_FACILITATOR_HEAD') && (
                    <div style={{ fontSize: 12, color: 'var(--color-warning, #d97706)', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 6, padding: '6px 8px' }}>
                      This level resolves automatically to the department's mapped head. Map it under <b>Department Heads</b> (name + email); until a head is mapped for the initiating department, this level will <b>not send an email</b> \u2014 use <b>"Named person (email link)"</b> as a fallback.
                    </div>
                  )}
                  {a.spec_type === 'ANY_ONE_OF_GROUP' && (
                    <div><Text type="secondary" style={{ fontSize: 12 }}>Group members — one per line as <i>Name, email</i>:</Text>
                      <Input.TextArea rows={3} value={a._membersText} placeholder={'Jane Doe, jane@example.com\nJohn Smith, john@example.com'} onChange={(e) => setAppr(si, ai, { _membersText: e.target.value })} /></div>
                  )}
                  {a.spec_type === 'MANUAL' && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'var(--color-bg-page)', border: '1px solid var(--color-border-medium)', borderRadius: 6, padding: '6px 8px' }}>
                      No approver is fixed here. When a PO reaches this level, the initiator picks the approver (name + email) at submit and that person gets the email link.
                    </div>
                  )}
                </div>
              ))}
              <Button size="small" icon={<Plus size={13} />} onClick={() => addAppr(si)}>Add approver / level</Button>
            </Card>
          ))}
          <Button icon={<Plus size={14} />} onClick={addSlab}>Add cost slab</Button>
        </Space>
      </Drawer>
      <Drawer title="Department Heads (dynamic approver resolution)" open={hdOpen} onClose={() => setHdOpen(false)} width={640}>
        <Text type="secondary" style={{ fontSize: 12 }}>Map each department's Sub-LoB Head and Facilitator Head. Matrix levels set to an &quot;auto head&quot; resolve to these people at approval time.</Text>
        <div style={{ marginTop: 12 }}>
          {hdRows.map((r, i) => (
            <Card key={r.department_id} size="small" title={r.department_name} style={{ marginBottom: 10, borderRadius: 8 }}
              extra={<Button size="small" type="primary" onClick={() => saveHead(r)}>Save</Button>}>
              <div style={{ marginBottom: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>Sub-LoB Head</Text><br />
                <Space wrap><Input placeholder="Name" style={{ width: 200 }} value={r.sublob_head_name} onChange={(e) => setHd(i, { sublob_head_name: e.target.value })} />
                <Input placeholder="Email" style={{ width: 280 }} value={r.sublob_head_email} onChange={(e) => setHd(i, { sublob_head_email: e.target.value })} /></Space></div>
              <div><Text type="secondary" style={{ fontSize: 12 }}>Facilitator Head</Text><br />
                <Space wrap><Input placeholder="Name" style={{ width: 200 }} value={r.facilitator_head_name} onChange={(e) => setHd(i, { facilitator_head_name: e.target.value })} />
                <Input placeholder="Email" style={{ width: 280 }} value={r.facilitator_head_email} onChange={(e) => setHd(i, { facilitator_head_email: e.target.value })} /></Space></div>
            </Card>
          ))}
          {!hdRows.length && <Text type="secondary">No departments found.</Text>}
        </div>
      </Drawer>
    </div>
  );
}
