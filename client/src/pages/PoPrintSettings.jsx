import React, { useEffect, useState, useCallback } from 'react';
import { Card, Form, Input, Button, message, Row, Col, Switch, Divider, Upload } from 'antd';
import { Save, RefreshCcw, Image as ImageIcon } from 'lucide-react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';

const { TextArea } = Input;

export default function PoPrintSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/procurement/po-print-config');
      const rows = res?.data?.data || res?.data || [];
      const profile = (Array.isArray(rows) ? rows : []).find((r) => !r.entity_id) || {};
      form.setFieldsValue({
        company_name: profile.company_name,
        registered_address: profile.registered_address,
        gst_number: profile.gst_number,
        pan_number: profile.pan_number,
        isd_number: profile.isd_number,
        terms_conditions: profile.terms_conditions,
        default_warranty: profile.default_warranty,
        default_payment_terms: profile.default_payment_terms,
        requested_by_label: profile.requested_by_label || 'Requested by',
        approved_by_label: profile.approved_by_label || 'PO approved by',
        footer_note: profile.footer_note,
        show_pr_number: profile.show_pr_number !== false,
        show_quotation_number: profile.show_quotation_number !== false,
        procurement_cc_email: profile.procurement_cc_email,
        is_active: profile.is_active !== false,
      });
      if (profile.has_logo) {
        try {
          const img = await api.get('/procurement/po-print-config/logo', { responseType: 'blob' });
          setLogoPreview(URL.createObjectURL(img.data));
        } catch { setLogoPreview(null); }
      } else {
        setLogoPreview(null);
      }
    } catch {
      message.error('Failed to load PO print settings');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { load(); }, [load]);

  const uploadLogo = async ({ file, onSuccess, onError }) => {
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await api.post('/procurement/po-print-config/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLogoPreview(URL.createObjectURL(file));
      message.success('Logo saved');
      if (onSuccess) onSuccess({}, file);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Logo upload failed (use PNG/JPG)');
      if (onError) onError(e);
    }
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.put('/procurement/po-print-config', { ...values, entity_id: null });
      message.success('PO print settings saved');
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 'var(--space-page, 16px)' }}>
      <PageHeader title="PO Print Settings" subtitle="Configure how your Purchase Orders are printed - logo, letterhead, tax identifiers and terms. Applies to your organisation only." />
      <Card loading={loading} styles={{ body: { padding: 20 } }}>
        <Form form={form} layout="vertical">
          <Divider orientation="left" style={{ color: 'var(--color-navy)' }}>Letterhead</Divider>
          <Form.Item label="Company logo (PNG or JPG - printed top-right of every PO). Use a clear image about 400-600px wide.">
            <Upload customRequest={uploadLogo} showUploadList={false} accept="image/png,image/jpeg,image/jpg" maxCount={1}>
              <Button icon={<ImageIcon size={16} />}>{logoPreview ? 'Replace logo' : 'Upload logo'}</Button>
            </Upload>
            {logoPreview && (
              <div style={{ marginTop: 10 }}>
                <img src={logoPreview} alt="Company logo" style={{ maxHeight: 80, maxWidth: 280, border: '1px solid #e5e7eb', padding: 6, borderRadius: 6, background: '#fff' }} />
              </div>
            )}
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="company_name" label="Company name"><Input placeholder="Your registered company name" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="registered_address" label="Registered address"><TextArea rows={2} placeholder="Registered office address" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}><Form.Item name="gst_number" label="GST No"><Input placeholder="GSTIN" /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="pan_number" label="PAN No"><Input placeholder="PAN" /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="isd_number" label="ISD No"><Input placeholder="ISD registration no" /></Form.Item></Col>
          </Row>

          <Divider orientation="left" style={{ color: 'var(--color-navy)' }}>Default terms</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="default_warranty" label="Warranty"><Input placeholder="e.g. Standard OEM Warranty Applicable" /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="default_payment_terms" label="Payment terms"><Input placeholder="e.g. 30 Days Due Net" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item name="show_pr_number" label="Show PR No. on PO print" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="show_quotation_number" label="Show Quotation No. on PO print" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="terms_conditions" label="Terms and Conditions (printed on every PO)">
            <TextArea rows={5} placeholder="Standard terms and conditions text for your POs" />
          </Form.Item>

          <Divider orientation="left" style={{ color: 'var(--color-navy)' }}>Signatures and footer</Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}><Form.Item name="requested_by_label" label="Requested-by label"><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="approved_by_label" label="Approved-by label"><Input /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="is_active" label="Active" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="footer_note" label="Footer note (optional)"><Input placeholder="e.g. This is a system-generated document" /></Form.Item>
          <Form.Item name="procurement_cc_email" label="Procurement CC email (copied on every PO emailed to a vendor)"><Input placeholder="e.g. procurement@yourcompany.com" /></Form.Item>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" icon={<Save size={16} />} loading={saving} onClick={onSave}>Save settings</Button>
            <Button icon={<RefreshCcw size={16} />} onClick={load}>Reload</Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
