import React, { useState } from 'react';
import { Alert, Button, Collapse, Modal, Space, Spin, Statistic, Typography, message } from 'antd';
import { CloudDownload } from 'lucide-react';
import api from '../../utils/api';
import { getStoredUser } from '../../utils/session';

const { Text } = Typography;

// Same roles as the server's requireSeniorAdmin guard on the integrations routes.
const SENIOR = ['PROVIDER_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'ADMIN', 'DEV_ADMIN'];

const NameList = ({ names }) => (
  <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 13 }}>
    {names.map((n, i) => <div key={`${n}-${i}`}>{n}</div>)}
  </div>
);

/**
 * "Import from Zoho Books" on Vendor Master: shows what would come in, then brings the Zoho Books
 * vendors into Vendor Master so PRs, RFQs and POs can use them. Nothing is changed in Zoho.
 */
export default function ZohoVendorImport({ onDone }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState('');
  const role = String(getStoredUser()?.role || '').toUpperCase().replace(/\s+/g, '_');
  if (!SENIOR.includes(role)) return null;

  const start = async () => {
    setOpen(true);
    setPreview(null);
    setProblem('');
    setLoading(true);
    try {
      const res = await api.get('/integrations/zoho_books/vendors/preview', { timeout: 120000 });
      setPreview(res?.data?.data || null);
    } catch (e) {
      setProblem(e?.response?.data?.message || 'Could not read the vendors from Zoho Books');
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const res = await api.post('/integrations/zoho_books/vendors/import', {}, { timeout: 300000 });
      const failed = res?.data?.data?.failed || [];
      if (failed.length) message.warning(res?.data?.message); else message.success(res?.data?.message || 'Vendors imported');
      setOpen(false);
      onDone?.();
    } catch (e) {
      message.error(e?.response?.data?.message || 'Import from Zoho Books failed');
    } finally {
      setImporting(false);
    }
  };

  const toCreate = preview?.to_create || [];
  const toLink = preview?.to_link || [];
  const nothing = preview && !toCreate.length && !toLink.length;

  return (
    <>
      <Button icon={<CloudDownload size={16} />} onClick={start}>Import from Zoho Books</Button>
      <Modal
        title="Import vendors from Zoho Books"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={runImport}
        okText={toCreate.length ? `Import ${toCreate.length} vendor${toCreate.length === 1 ? '' : 's'}` : 'Link vendors'}
        okButtonProps={{ disabled: loading || !!problem || !preview || nothing, loading: importing }}
        width={560}
      >
        {loading && <div style={{ textAlign: 'center', padding: 32 }}><Spin /><div style={{ marginTop: 8 }}><Text type="secondary">Reading vendors from Zoho Books…</Text></div></div>}
        {problem && <Alert type="error" showIcon message={problem} description="Zoho Books must be connected, with its organisation chosen, in Settings → Integrations." />}
        {preview && (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <Space size={32} wrap>
              <Statistic title="Vendors in Zoho Books" value={preview.total} />
              <Statistic title="New to add" value={toCreate.length} valueStyle={{ color: 'var(--color-success, #16a34a)' }} />
              <Statistic title="Already in LedgerLine" value={preview.already_linked + toLink.length} />
            </Space>
            {nothing
              ? <Alert type="success" showIcon message="Every Zoho Books vendor is already in LedgerLine." />
              : (
                <Collapse
                  size="small"
                  items={[
                    toCreate.length && { key: 'new', label: `New vendors to add (${toCreate.length})`, children: <NameList names={toCreate} /> },
                    toLink.length && { key: 'link', label: `Same vendor already in LedgerLine, will be linked (${toLink.length})`, children: <NameList names={toLink} /> }
                  ].filter(Boolean)}
                />
              )}
            <Alert
              type="info"
              showIcon
              message="What happens"
              description={(
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>New vendors come in with name, contact, email, phone, GSTIN and PAN, and can be used in PRs, RFQs and POs straight away.</li>
                  <li>They are marked not verified: Compliance checks them (and adds bank details) before any payment.</li>
                  <li>Vendors already in LedgerLine are linked, not changed. Nothing is changed in Zoho Books.</li>
                </ul>
              )}
            />
          </Space>
        )}
      </Modal>
    </>
  );
}
