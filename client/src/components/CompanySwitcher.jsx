import React, { useState, useEffect, useCallback } from 'react';
import { Dropdown, Button, Space, Tag, Typography, Divider, message } from 'antd';
import { Building2, ChevronDown, Check } from 'lucide-react';
import api from '../utils/api';

const { Text } = Typography;

const CompanySwitcher = () => {
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompany] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await api.get('/auth/my-companies');
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data) && data.length > 0) {
        setCompanies(data);
        // Set active from localStorage or use primary
        const savedId = localStorage.getItem('fixtag_company_id');
        const saved = savedId ? data.find(c => String(c.id) === savedId) : null;
        const primary = data.find(c => c.is_primary) || data[0];
        const active = saved || primary;
        setActiveCompany(active);
        localStorage.setItem('fixtag_company_id', String(active.id));
      }
    } catch {
      // Silently fail — user may not have multi-company enabled
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSwitch = async (companyId) => {
    if (activeCompany && String(activeCompany.id) === String(companyId)) return;
    setLoading(true);
    try {
      await api.post(`/auth/switch-company/${companyId}`);
      const switched = companies.find(c => String(c.id) === String(companyId));
      setActiveCompany(switched);
      localStorage.setItem('fixtag_company_id', String(companyId));
      message.success(`Switched to ${switched?.company_name || 'company'}`);
      // Reload page to refresh all data with new company context
      setTimeout(() => window.location.reload(), 500);
    } catch {
      message.error('Failed to switch company');
    } finally {
      setLoading(false);
    }
  };

  // Don't render if user has 0 or 1 company
  if (companies.length < 2) return null;

  const menuItems = companies.map(c => ({
    key: String(c.id),
    label: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 200 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.company_name}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{c.company_code}</Text>
        </div>
        <Space size={4}>
          {c.is_primary && <Tag color="blue" style={{ fontSize: 10, lineHeight: '18px', margin: 0 }}>Primary</Tag>}
          {activeCompany && String(activeCompany.id) === String(c.id) && <Check size={14} color="var(--color-success)" />}
        </Space>
      </div>
    ),
    onClick: () => handleSwitch(c.id)
  }));

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Button
        type="text"
        loading={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 36,
          borderRadius: 8,
          padding: '0 12px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)',
          fontWeight: 600,
          fontSize: 13
        }}
      >
        <Building2 size={15} />
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeCompany?.company_name || 'Select Company'}
        </span>
        <ChevronDown size={14} />
      </Button>
    </Dropdown>
  );
};

export default CompanySwitcher;
