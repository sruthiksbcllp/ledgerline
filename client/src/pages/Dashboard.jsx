import React, { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Card, Space, Typography, Tag,
  Statistic, Empty, Progress, Tooltip, Button, message, Divider
} from 'antd';
import {
  Package, ShieldCheck, Trash2, TrendingUp, Layers, Clock,
  FileText, AlertCircle, Zap, RefreshCcw, ArrowUpRight, Info,
  LayoutDashboard, BarChart2, ChevronRight, ArrowRight, ClipboardCheck
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { safeApiCall } from '../utils/safeApiCall';
import Loader from '../components/Loader';

const { Title, Text } = Typography;

// ─── Style constants ──────────────────────────────────────────────────────────
const pageHeaderCard = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-sm)',
  marginBottom: 20,
  background: 'var(--color-bg-card)',
};

const contentCard = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-card)',
  background: 'var(--color-bg-card)',
};

const primaryBtn = { background: 'var(--gradient-orange)', border: 'none' };

// eslint-disable-next-line no-unused-vars
const iconBadge = (bg = 'var(--gradient-orange)') => ({
  width: 38,
  height: 38,
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
});

const KPI_THEMES = [
  { bg: '#EFF6FF', color: 'var(--color-info)', iconBg: 'var(--gradient-info)' },
  { bg: '#F0FDF4', color: 'var(--color-success)', iconBg: 'var(--gradient-success)' },
  { bg: '#FFFBEB', color: 'var(--color-warning)', iconBg: 'var(--gradient-brand)' },
  { bg: '#FAF5FF', color: 'var(--color-info)', iconBg: 'var(--gradient-navy)' },
];

const BAR_COLORS = ['#1E2A6E', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', 'var(--color-border-medium)'];

// ─── Custom Tooltip for chart ─────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        boxShadow: 'var(--shadow-md)',
        fontSize: 12,
      }}>
        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'var(--color-navy)' }}>{payload[0].value} assets</div>
      </div>
    );
  }
  return null;
};

// ─── Component ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({});
  const [approvals, setApprovals] = useState({ pending_pr: 0, pending_po: 0, total_pending: 0 });
  const [assetsByCategory, setAssetsByCategory] = useState([]);
  const [alerts, setAlerts] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [summ, appr, cats, alrt] = await Promise.all([
      safeApiCall(() => api.get('/dashboard/summary')),
      safeApiCall(() => api.get('/dashboard/approvals')),
      safeApiCall(() => api.get('/dashboard/assets')),
      safeApiCall(() => api.get('/dashboard/alerts')),
    ]);
    setSummary(summ || {});
    setApprovals(appr || { pending_pr: 0, pending_po: 0, total_pending: 0 });
    setAssetsByCategory(cats || []);
    setAlerts(alrt || []);
    setLoading(false);
  }, []);

  const totalAssets  = Number(summary.totalAssets   ?? summary.total_assets   ?? 0);
  const activeAssets = Number(summary.activeAssets  ?? summary.active_assets  ?? 0);
  const totalGainLoss = Number(summary.totalGainLoss ?? summary.total_gain_loss ?? 0);
  const pendingPr    = Number(approvals.pending_pr  ?? approvals.pendingPr    ?? 0);
  const pendingPo    = Number(approvals.pending_po  ?? approvals.pendingPo    ?? 0);
  const totalPending = Number(
    approvals.total_pending ??
    approvals.totalPending ??
    (Array.isArray(approvals.pendingRequests) ? approvals.pendingRequests.length : 0)
  );

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    await fetchData();
    message.success('Dashboard refreshed');
  };

  const formatCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`;

  const kpis = [
    { title: 'Total Assets',     value: totalAssets,                  icon: <Package size={16} />,    theme: KPI_THEMES[0] },
    { title: 'Active Assets',    value: activeAssets,                 icon: <ShieldCheck size={16} />, theme: KPI_THEMES[1] },
    { title: 'Disposed Assets',  value: summary.disposed_count || 0,  icon: <Trash2 size={16} />,      theme: KPI_THEMES[2] },
    {
      title: 'Total Gain / Loss',
      value: formatCurrency(totalGainLoss),
      icon: <TrendingUp size={16} />,
      theme: totalGainLoss >= 0 ? KPI_THEMES[3] : { bg: '#FEF2F2', color: 'var(--color-danger)', iconBg: 'var(--gradient-orange)' },
      isFormatted: true,
    },
  ];

  const actionItems = [
    { label: 'Pending Requisitions', value: pendingPr,                    icon: <Clock size={13} />,       severity: 'warning', route: '/procurement/requisition' },
    { label: 'Purchase Orders',      value: pendingPo,                    icon: <FileText size={13} />,    severity: 'info',    route: '/procurement/purchase-orders' },
    { label: 'Asset Alerts',         value: alerts.length,                icon: <AlertCircle size={13} />, severity: 'danger',  route: '/assets/alerts' },
    { label: 'AMC Expiring Soon',    value: summary.amc_expiring_soon||0, icon: <Clock size={13} />,       severity: 'danger',  route: '/maintenance/amc' },
    { label: 'Service Due Assets',   value: summary.amc_overdue_services||0, icon: <Zap size={13} />,     severity: 'warning', route: '/maintenance/plans' },
  ];

  const SEVERITY_STYLE = {
    danger:  { bg: '#FEF2F2', border: 'var(--color-danger)', color: 'var(--color-danger)',  labelColor: 'var(--color-danger)' },
    warning: { bg: '#FFFBEB', border: 'var(--color-border-medium)', color: 'var(--color-warning)', labelColor: 'var(--color-warning)' },
    info:    { bg: '#EFF6FF', border: 'var(--color-border-medium)', color: 'var(--color-info)',    labelColor: 'var(--color-info)' },
  };

  if (loading) return <Loader message="Loading dashboard…" />;

  return (
    <div style={{ background: 'var(--color-bg-page)', minHeight: '100%', margin: -24, padding: 24 }}>

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space align="center" size={12}>
              <div className="page-header-icon"><LayoutDashboard size={24}  /></div>
              <div>
                <Title level={2} className="page-header-title" style={{ margin: 0, color: 'var(--color-navy-deep)' }}>
                  Dashboard
                </Title>
                <p className="page-header-sub">
                  Asset intelligence &amp; financial compliance overview
                </p>
              </div>
            </Space>
          </Col>
          <Col>
            <Space size={8}>
              <Tooltip title="Refresh dashboard">
                <Button
                  icon={<RefreshCcw size={16} />}
                  onClick={handleRefresh}
                  style={{ borderRadius: 'var(--radius-md)', height: 40 }}
                />
              </Tooltip>
              <Button
                type="primary"
                icon={<FileText size={14} />}
                style={{ ...primaryBtn, height: 40 }}
                onClick={() => navigate('/reports/advanced')}
              >
                Generate Report
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <Row gutter={[14, 14]} style={{ marginBottom: 16 }}>
        {kpis.map((kpi) => (
          <Col xs={24} sm={12} xl={6} key={kpi.title}>
            <Card
              style={{ ...contentCard, background: kpi.theme.bg, border: `1px solid ${kpi.theme.bg}` }}
              styles={{ body: { padding: '16px 18px' } }}
            >
              <Row align="middle" justify="space-between" wrap={false}>
                <Col flex="auto">
                  <Text style={{ fontSize: 11, color: kpi.theme.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.75 }}>
                    {kpi.title}
                  </Text>
                  <div style={{
                    fontSize: kpi.isFormatted ? 20 : 28,
                    fontWeight: 700,
                    color: kpi.theme.color,
                    marginTop: 6,
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                  }}>
                    {kpi.isFormatted ? kpi.value : kpi.value.toLocaleString('en-IN')}
                  </div>
                </Col>
                <Col>
                  <div className="page-header-icon" style={{ background: 'rgba(255,255,255,0.7)', color: kpi.theme.color, borderRadius: 12 }}>
                    {React.cloneElement(kpi.icon, { size: 24, color: kpi.theme.color })}
                  </div>
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── Financial Compliance + Audit Readiness ────────────────────────── */}
      <Row gutter={[14, 14]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space size={8}>
                <div style={{ ...iconBadge('var(--gradient-navy)'), width: 28, height: 28, borderRadius: 8 }}>
                  <Layers size={13} color="var(--color-text-primary)" />
                </div>
                <Text style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  Financial Compliance
                </Text>
              </Space>
            }
            extra={
              <Button
                type="text"
                size="small"
                onClick={() => navigate('/reports/advanced')}
                style={{ color: 'var(--color-navy)', padding: '0 4px', fontWeight: 500, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                icon={<ArrowUpRight size={12} />}
              >
                Full Schedule
              </Button>
            }
            style={contentCard}
            styles={{ body: { padding: '16px 18px' } }}
          >
            <Row gutter={[12, 12]}>
              {/* Companies Act */}
              <Col xs={24} sm={12}>
                <div style={{
                  padding: '14px 16px',
                  background: '#FAF5FF',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-medium)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-info)' }} />
                    <Text style={{ fontWeight: 700, color: 'var(--color-info)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Companies Act
                    </Text>
                  </div>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Text style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Annual Dep.</Text>
                      <Text style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-info)', display: 'block', letterSpacing: '-0.02em' }}>
                        ₹{Number(summary.companies_act?.total_depreciation || 0).toLocaleString('en-IN')}
                      </Text>
                    </Col>
                    <Col span={12}>
                      <Text style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Current NBV</Text>
                      <Text style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-info)', display: 'block', letterSpacing: '-0.02em' }}>
                        ₹{Number(summary.companies_act?.nbv || 0).toLocaleString('en-IN')}
                      </Text>
                    </Col>
                  </Row>
                </div>
              </Col>

              {/* Income Tax Act */}
              <Col xs={24} sm={12}>
                <div style={{
                  padding: '14px 16px',
                  background: '#F0FDF4',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-success)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
                    <Text style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Income Tax Act
                    </Text>
                  </div>
                  <Row gutter={12}>
                    <Col span={12}>
                      <Text style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Annual Dep.</Text>
                      <Text style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-success)', display: 'block', letterSpacing: '-0.02em' }}>
                        ₹{Number(summary.it_act?.total_depreciation || 0).toLocaleString('en-IN')}
                      </Text>
                    </Col>
                    <Col span={12}>
                      <Text style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 2 }}>Current WDV</Text>
                      <Text style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-success)', display: 'block', letterSpacing: '-0.02em' }}>
                        ₹{Number(summary.it_act?.wdv || 0).toLocaleString('en-IN')}
                      </Text>
                    </Col>
                  </Row>
                </div>
              </Col>
            </Row>

            <div style={{
              marginTop: 12,
              padding: '9px 14px',
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <Info size={13} color="var(--color-text-muted)" />
              <Text style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Deferred Tax Liability Base:</Text>
              <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {formatCurrency(summary.deferred_tax_base)}
              </Text>
            </div>
          </Card>
        </Col>

        {/* Audit Readiness */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space size={8}>
                <div className="page-header-icon">
                  <ClipboardCheck size={24} />
                </div>
                <Text style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  Audit Readiness
                </Text>
              </Space>
            }
            style={{ ...contentCard, height: '100%' }}
            styles={{ body: { padding: '16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }}
          >
            <Progress
              type="dashboard"
              percent={summary.auditReadinessScore || 0}
              strokeColor={{ '0%': '#1E2A6E', '100%': '#2563EB' }}
              railColor="var(--color-bg-subtle)"
              size={150}
              strokeWidth={10}
              format={(pct) => (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-navy-deep)', letterSpacing: '-0.03em' }}>{pct}%</span>
                </div>
              )}
            />
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-navy-deep)', display: 'block', letterSpacing: '-0.02em' }}>
                {summary.verifiedAssets || 0} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)' }}>/ {summary.totalAssets || 0}</span>
              </Text>
              <Text style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, display: 'block' }}>Assets Verified &amp; Tagged</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Chart + Action Required ───────────────────────────────────────── */}
      <Row gutter={[14, 14]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space size={8}>
                <div className="page-header-icon">
                  <BarChart2 size={24} color="var(--color-text-primary)" />
                </div>
                <Text style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  Asset Distribution by Category
                </Text>
              </Space>
            }
            style={contentCard}
            styles={{ body: { padding: '8px 16px 16px' } }}
          >
            {assetsByCategory.length === 0 ? (
              <Empty
                description={<Text type="secondary">No category data available</Text>}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: '40px 0' }}
              />
            ) : (
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={assetsByCategory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                    <XAxis
                      dataKey="category.category_name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Inter' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Inter' }}
                    />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(30,42,110,0.04)' }} />
                    <Bar dataKey="count" radius={[5, 5, 0, 0]} barSize={32}>
                      {assetsByCategory.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>

        {/* Action Required */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space size={8}>
                <div style={{ ...iconBadge('var(--gradient-orange)'), width: 28, height: 28, borderRadius: 8 }}>
                  <AlertCircle size={13} color="var(--color-text-primary)" />
                </div>
                <Text style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                  Action Required
                </Text>
              </Space>
            }
            extra={
              totalPending > 0 && (
                <div style={{
                  background: '#FEF2F2',
                  color: 'var(--color-danger)',
                  border: '1px solid var(--color-danger)',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 9px',
                }}>
                  {totalPending} pending
                </div>
              )
            }
            style={contentCard}
            styles={{ body: { padding: '12px 16px 16px' } }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              {actionItems.map((item) => {
                const style = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.info;
                return (
                  <div
                    key={item.label}
                    onClick={() => navigate(item.route)}
                    style={{
                      padding: '10px 14px',
                      background: style.bg,
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${style.border}`,
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <Space size={8}>
                      <span style={{ color: style.color, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                      <Text style={{ fontSize: 12.5, color: style.labelColor, fontWeight: 500 }}>{item.label}</Text>
                    </Space>
                    <Space size={6}>
                      <Text style={{ fontWeight: 700, color: style.color, fontSize: 15, letterSpacing: '-0.02em' }}>
                        {item.value}
                      </Text>
                      <ChevronRight size={13} color={style.color} />
                    </Space>
                  </div>
                );
              })}

              <Divider style={{ margin: '4px 0' }} />

              <Button
                type="primary"
                block
                onClick={() => navigate('/requests/approval-requests')}
                style={{ ...primaryBtn, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}
                icon={<ArrowRight size={14} />}
              >
                View Approval Inbox
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};



export default Dashboard;
