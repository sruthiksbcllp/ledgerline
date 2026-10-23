import React, { useState, useEffect } from "react";
import {
  Drawer,
  Table,
  InputNumber,
  Button,
  Form,
  Input,
  message,
  Space,
  Typography,
  Tag,
  Divider,
  Select,
  Collapse,
  Alert,
} from "antd";
import { 
  ShieldCheck, 
  AlertTriangle, 
  Settings, 
  Barcode, 
  CheckCircle2, 
  XCircle,
  PackageCheck
} from "lucide-react";
import api from "../../utils/api";

const { Text, Title } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

const GRNDrawer = ({ open, onClose, po, onRefresh }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (po && open) loadPOItems();
  }, [po, open]);

  const loadPOItems = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/procurement/po/${po.id}`);
      const data = res.data?.data || res.data;

      const mapped = (data.items || []).map((item) => ({
        ...item,
        key: item.id,
        received_qty: 0,
        accepted_qty: 0,
        rejected_qty: 0,
        qc_status: 'PASS',
        condition: 'GOOD',
        serials: [],
        qc_remarks: '',
      }));

      setItems(mapped);
    } catch {
      message.error("Failed to load PO items");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;

    // Logic: If QC Status is FAIL, Accepted Qty becomes 0 and Rejected becomes Received
    if (field === "qc_status" && value === "FAIL") {
      updated[index].accepted_qty = 0;
      updated[index].rejected_qty = updated[index].received_qty;
    } else if (field === "received_qty") {
      if (updated[index].qc_status === "PASS") {
        updated[index].accepted_qty = value;
        updated[index].rejected_qty = 0;
      } else {
        updated[index].accepted_qty = 0;
        updated[index].rejected_qty = value;
      }
    }

    setItems(updated);
  };

  const handleSerialChange = (itemIndex, serialIndex, value) => {
    const updated = [...items];
    if (!updated[itemIndex].serials) updated[itemIndex].serials = [];
    updated[itemIndex].serials[serialIndex] = value;
    setItems(updated);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const totalReceived = items.reduce((sum, item) => sum + (item.received_qty || 0), 0);
      if (totalReceived <= 0) {
        return message.warning("Please enter received quantity for at least one item");
      }

      // FIX: Serial validation was empty — mismatched serials silently hit backend and returned confusing 400
      for (const item of items) {
        if (item.accepted_qty > 0 && item.serials && item.serials.length > 0) {
          const filledSerials = item.serials.filter(s => s && s.trim() !== "");
          if (filledSerials.length > 0 && filledSerials.length !== item.accepted_qty) {
            return message.error(
              `"${item.item_name}": entered ${filledSerials.length} serial(s) but accepted qty is ${item.accepted_qty}. Match exactly or leave serials blank.`
            );
          }
        }
      }

      setLoading(true);

      const payload = {
        po_id: po.id,
        invoice_number: values.invoice_number,
        remarks: values.remarks,
        items: items.map(item => ({
          ...item,
          serials: (item.serials || []).filter(s => s && s.trim() !== "")
        })),
      };

      const res = await api.post("/grn/create", payload);
      const resData = res.data?.data || res.data;

      if (resData.warnings && resData.warnings.length > 0) {
        setWarnings(resData.warnings);
        message.warning("GRN Created with 3-Way Match warnings");
      } else {
        message.success("Enterprise GRN Created Successfully");
        onRefresh && onRefresh();
        onClose();
      }
    } catch (err) {
      message.error(err?.response?.data?.message || err.message || "GRN creation failed");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { 
      title: "Item Details", 
      width: 250,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.item_name}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>Ordered: {r.quantity} | Prev: {r.received_quantity || 0}</Text>
          {Number(r.unit_price) > 0 && <Tag icon={<Barcode size={12} />}>₹{r.unit_price}/unit</Tag>}
        </Space>
      )
    },
    {
      title: "Quantities",
      width: 300,
      render: (_, r, i) => (
        <Space direction="vertical">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Text style={{ width: 60 }}>Recv:</Text>
            <InputNumber
              min={0}
              max={Number(r.quantity) - Number(r.received_quantity || 0)}
              value={r.received_qty}
              onChange={(v) => handleChange(i, "received_qty", v)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Text style={{ width: 60, color: '#52c41a' }}>Accp:</Text>
            <InputNumber
              min={0}
              value={r.accepted_qty}
              disabled={r.qc_status === 'FAIL'}
              onChange={(v) => handleChange(i, "accepted_qty", v)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Text style={{ width: 60, color: '#ff4d4f' }}>Rej:</Text>
            <InputNumber
              min={0}
              value={r.rejected_qty}
              onChange={(v) => handleChange(i, "rejected_qty", v)}
            />
          </div>
        </Space>
      ),
    },
    {
      title: "Quality Control (QC)",
      width: 250,
      render: (_, r, i) => (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select 
            value={r.qc_status} 
            style={{ width: '100%' }}
            onChange={(v) => handleChange(i, "qc_status", v)}
          >
            <Option value="PASS"><CheckCircle2 size={14} color="#52c41a" style={{ marginRight: 8 }} /> PASS</Option>
            <Option value="FAIL"><XCircle size={14} color="#ff4d4f" style={{ marginRight: 8 }} /> FAIL</Option>
          </Select>
          <Select 
            value={r.condition} 
            style={{ width: '100%' }}
            onChange={(v) => handleChange(i, "condition", v)}
          >
            <Option value="GOOD">Condition: Good</Option>
            <Option value="DAMAGED">Condition: Damaged</Option>
            <Option value="WRONG_ITEM">Wrong Item</Option>
          </Select>
          <Input 
            placeholder="QC Remarks" 
            value={r.qc_remarks}
            onChange={(e) => handleChange(i, "qc_remarks", e.target.value)}
          />
        </Space>
      ),
    },
    {
      title: "Traceability",
      render: (_, r, i) => (
        r.accepted_qty > 0 ? (
          <Collapse ghost size="small">
            <Panel header={<Space><Settings size={14} /> Serial Numbers ({r.serials?.filter(s => s).length || 0}/{r.accepted_qty})</Space>} key="1">
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {Array.from({ length: r.accepted_qty }).map((_, sIdx) => (
                  <Input 
                    key={sIdx}
                    placeholder={`Serial #${sIdx + 1}`}
                    style={{ marginBottom: 4 }}
                    value={r.serials?.[sIdx]}
                    onChange={(e) => handleSerialChange(i, sIdx, e.target.value)}
                  />
                ))}
              </div>
            </Panel>
          </Collapse>
        ) : <Text type="secondary">N/A</Text>
      )
    }
  ];

  return (
    <Drawer
      title={
        <Space>
          <PackageCheck size={20} color="#1d3557" />
          <Title level={2} style={{ margin: 0 }}>Enterprise GRN Module</Title>
          <Tag color="blue">PO Reference: {po?.po_number}</Tag>
        </Space>
      }
      width={1200}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button onClick={onClose}>Discard</Button>
          <Button
            type="primary"
            loading={loading}
            icon={<ShieldCheck size={16} />}
            onClick={handleSubmit}
            style={{ backgroundColor: '#1d3557' }}
          >
            Submit & Generate Assets
          </Button>
        </Space>
      }
    >
      {warnings.length > 0 && (
        <Alert
          message="3-Way Match Warnings"
          description={
            <ul>
              {warnings.map((w, idx) => <li key={idx}>{w}</li>)}
            </ul>
          }
          type="warning"
          showIcon
          icon={<AlertTriangle />}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setWarnings([])}
        />
      )}

      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
          <Form.Item
            name="invoice_number"
            label={<Text strong>Vendor Invoice #</Text>}
            rules={[{ required: true, message: 'Invoice number is mandatory for audit' }]}
          >
            <Input placeholder="Invoice reference" prefix={<Barcode size={14} />} />
          </Form.Item>

          <Form.Item name="delivery_challan" label={<Text strong>Delivery Challan #</Text>}>
            <Input placeholder="DC reference" />
          </Form.Item>

          <Form.Item name="remarks" label={<Text strong>General Remarks</Text>}>
            <Input placeholder="Overall delivery status" />
          </Form.Item>
        </div>
      </Form>

      <Table
        dataSource={items}
        columns={columns}
        rowKey="id"
        pagination={false}
        loading={loading}
        bordered
        footer={() => (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', padding: '8px' }}>
            <Space>
              <Text strong>Total Accepted:</Text>
              <Tag color="green" style={{ fontSize: '14px' }}>
                {items.reduce((sum, item) => sum + (item.accepted_qty || 0), 0)}
              </Tag>
            </Space>
            <Space>
              <Text strong>Total Rejected:</Text>
              <Tag color="red" style={{ fontSize: '14px' }}>
                {items.reduce((sum, item) => sum + (item.rejected_qty || 0), 0)}
              </Tag>
            </Space>
          </div>
        )}
      />

      <div style={{ marginTop: 24, padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: '#fdfcfe' }}>
        <Title level={2}><ShieldCheck size={18} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} /> Enterprise Controls Active</Title>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <Text type="secondary" block>• 3-Way Match: Validating Invoice vs PO vs Physically Received.</Text>
            <Text type="secondary" block>• Traceability: Auto-linking assets to Serial Numbers and GRN IDs.</Text>
          </div>
          <div>
            <Text type="secondary" block>• Quality Gate: Items failing QC are excluded from asset capitalization.</Text>
            <Text type="secondary" block>• Audit Readiness: All timestamps and participants are logged.</Text>
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default GRNDrawer;
