import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Row, Col, Card, Space, Typography, Tag, Alert, Button, Progress, Empty, Divider, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, RefreshCcw, PlusCircle, FileText,
  ClipboardList, ShieldCheck, ArrowUpRight, ArrowDownRight,
  Activity, Package, CheckCircle, AlertTriangle, Clock,
  IndianRupee, TrendingDown, Building2, Wrench, Shield, BarChart3, Landmark
} from 'lucide-react';
import api from '../utils/api';
import dashboardService from '../services/dashboard.service';

const { Title, Text } = Typography;

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtCr = (n) => {
  const v = Number(n || 0);
  if (v >= 10000000) return `${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} K`;
  return fmt(v);
};

const useTheme = () => {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('fixtag_dark') === 'true'; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem('fixtag_dark', next); } catch {}
      return next;
    });
  }, []);
  return [dark, toggle];
};

// ─── Theme tokens ──────────────────────────────────────────────────────────
const buildTokens = (dark) => ({
  bg:          dark ? '#0F172A' : '#F8FAFC',
  surface:     dark ? '#1E293B' : '#ffffff',
  surfaceAlt:  dark ? '#334155' : '#f1f5f9',
  border:      dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
  borderMed:   dark ? 'rgba(255,255,255,0.12)' : '#cbd5e1',
  textPrimary: dark ? '#f8fafc' : '#0F172A',
  textMuted:   dark ? '#94a3b8' : '#64748B',
  textSub:     dark ? '#64748b' : '#94a3b8',
  shadow:      '0 4px 20px rgba(0, 0, 0, 0.04)',
  shadowSm:    '0 2px 8px rgba(0, 0, 0, 0.02)',
  orange:      '#FF7A1A',
  orangeLight: 'rgba(255, 122, 26, 0.1)',
  green:       '#10B981',
  greenLight:  'rgba(16, 185, 129, 0.1)',
  red:         '#EF4444',
  redLight:    'rgba(239, 68, 68, 0.1)',
  blue:        '#3B82F6',
  blueLight:   'rgba(59, 130, 246, 0.1)',
  purple:      '#8B5CF6',
  purpleLight: 'rgba(139, 92, 246, 0.1)',
  amber:       '#F59E0B',
  amberLight:  'rgba(245, 158, 11, 0.1)',
  teal:        '#14B8A6',
  tealLight:   'rgba(20, 184, 166, 0.1)',
});

// ─── Sub-components ────────────────────────────────────────────────────────
const KpiCard = ({ title, value, suffix, subLabel, trend, trendUp, icon: Icon, bg, valueCss, tk, onClick }) => (
  <Card
    hoverable={!!onClick}
    onClick={onClick}
    style={{
      borderRadius: 16,
      border: `1px solid ${tk.border}`,
      boxShadow: tk.shadow,
      background: tk.surface,
      height: '100%',
      cursor: onClick ? 'pointer' : 'default',
    }}
    styles={{ body: { padding: '20px 24px' } }}
  >
    <Row justify="space-between" align="middle" gutter={[16, 16]}>
      <Col>
        <Text style={{ fontSize: 12, color: tk.textMuted, fontWeight: 500, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </Text>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: valueCss || tk.textPrimary, lineHeight: 1 }}>{value}</span>
          {suffix && <span style={{ fontSize: 13, color: tk.textMuted, fontWeight: 600 }}>{suffix}</span>}
        </div>
        {subLabel && (
          <Text style={{ fontSize: 11, color: tk.textMuted, display: 'block', marginTop: 4 }}>{subLabel}</Text>
        )}
        {trend !== undefined && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: trendUp ? tk.green : tk.red,
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {trendUp ? '+' : ''}{trend}%
            </span>
            <Text style={{ fontSize: 11, color: tk.textMuted }}>vs last month</Text>
          </div>
        )}
      </Col>
      {Icon && (
        <Col>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: bg || tk.orangeLight, display: 'grid', placeItems: 'center',
          }}>
            <Icon size={22} color={valueCss || tk.orange} />
          </div>
        </Col>
      )}
    </Row>
  </Card>
);

const SectionCard = ({ title, extra, children, tk, style }) => (
  <Card
    title={<Text strong style={{ color: tk.textPrimary, fontSize: 15, fontWeight: 700 }}>{title}</Text>}
    extra={extra}
    style={{
      borderRadius: 16, border: `1px solid ${tk.border}`,
      boxShadow: tk.shadow, background: tk.surface,
      height: '100%', ...style,
    }}
    styles={{
      header: { borderBottom: `1px solid ${tk.border}`, padding: '14px 24px' },
      body: { padding: '20px 24px' },
    }}
  >
    {children}
  </Card>
);

const FinancialRow = ({ label, value, color, bold, tk, border = true }) => (
  <div style={{ padding: '10px 0', borderBottom: border ? `1px solid ${tk.border}` : 'none' }}>
    <Row justify="space-between" align="middle">
      <Text style={{ fontSize: 13, color: tk.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || tk.textPrimary, fontFamily: 'monospace' }}>
        {value}
      </Text>
    </Row>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────
const ExecutiveDashboard = () => {
  const [dark] = useTheme();
  const tk = buildTokens(dark);

  const [loading, setLoading] = useState(true);
  const [intelligence, setIntelligence] = useState({
    summary: {},
    monthOverMonth: {},
    alerts: [],
    recommendations: [],
  });
  const [issueStats, setIssueStats] = useState({ OPEN: 0, CRITICAL: 0 });
  const navigate = useNavigate();

  const initialLoadRef = React.useRef(true);
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, issueRes] = await Promise.all([
        dashboardService.getDashboardIntelligence(''),
        api.get('/asset-issues/stats').catch(() => ({ data: { data: { OPEN: 0, CRITICAL: 0 } } })),
      ]);
      if (data) setIntelligence(data);
      if (issueRes?.data) setIssueStats(issueRes.data?.data || issueRes.data);
      if (!initialLoadRef.current) message.success('Dashboard refreshed');
      initialLoadRef.current = false;
    } catch {
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);
  useEffect(() => {
    const handler = () => fetchDashboardData();
    window.addEventListener('fixtag:sync', handler);
    return () => window.removeEventListener('fixtag:sync', handler);
  }, [fetchDashboardData]);

  const summary = intelligence.summary || {};
  const mom = intelligence.monthOverMonth || {};
  const alerts = intelligence.alerts || [];
  const recommendations = intelligence.recommendations || [];

  const storedUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  }, []);
  const clientName = localStorage.getItem('client_name') || storedUser?.client_name || storedUser?.Client?.client_name || 'My Organisation';

  // ─── Derived metrics ─────────────────────────────────────────────────
  const totalAssets = Number(summary.totalAssets || 0);
  const verifiedAssets = Number(summary.verifiedAssets || 0);
  const missingAssets = Number(summary.missingAssets || 0);
  const criticalIssues = Number(issueStats.CRITICAL || issueStats.HIGH || 0);
  const complianceScore = Number(summary.auditReadinessScore || 0);
  const lastUpdated = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  // Financial (real data from backend)
  const grossBlock = Number(summary.totalAssetValue || 0);
  const coDepreciation = Number(summary.companies_act?.total_depreciation || 0);
  const itDepreciation = Number(summary.it_act?.total_depreciation || 0);
  const nbv = Number(summary.companies_act?.nbv || 0);
  const wdv = Number(summary.it_act?.wdv || 0);
  const disposedCount = Number(summary.disposed_count || 0);
  const gainLoss = Number(summary.total_gain_loss || 0);
  const cwipBalance = summary.cwip_balance?.balance || 0;
  const cwipCount = summary.cwip_balance?.count || 0;
  const capexAmount = summary.capex_this_quarter?.amount || 0;
  const capexCount = summary.capex_this_quarter?.count || 0;
  const amcExpiring = Number(summary.amc_expiring_soon || 0);
  const amcOverdue = Number(summary.amc_overdue_services || 0);
  const warrantyExpiring = Number(summary.warranty_expiring || 0);
  const maintenanceOverdue = Number(summary.maintenance_overdue || 0);

  const complianceColor = complianceScore >= 75 ? tk.green : complianceScore >= 50 ? tk.orange : tk.red;
  const complianceStatus = complianceScore >= 75 ? 'success' : complianceScore >= 50 ? 'normal' : 'exception';

  // Category distribution
  const categoryColors = [tk.blue, tk.green, tk.purple, tk.orange, tk.teal];
  const categoryRows = useMemo(() => {
    const dist = summary.categoryDistribution || [];
    if (dist.length === 0) return [];
    return dist
      .filter(r => Number(r.count) > 0)
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 5)
      .map((r, i) => ({
        label: r.category?.category_name || r['category.category_name'] || r.category_name || r.label || `Category ${i + 1}`,
        count: Number(r.count) || 0,
        color: categoryColors[i] || tk.textMuted,
      }));
  }, [summary.categoryDistribution, tk]);

  const alertSeverityMeta = (severity) => {
    if (severity === 'HIGH') return { color: tk.red, bg: tk.redLight, icon: AlertCircle };
    if (severity === 'MEDIUM') return { color: tk.amber, bg: tk.amberLight, icon: AlertTriangle };
    return { color: tk.blue, bg: tk.blueLight, icon: Activity };
  };

  const userRole = storedUser?.role || storedUser?.Role?.code || '';
  const isFinanceRole = ['PROVIDER_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN'].includes(userRole);

  const quickActions = isFinanceRole ? [
    { label: 'Depreciation Ledger', icon: TrendingDown, path: '/assets/depreciation', color: tk.orange, bgLight: 'rgba(255,122,26,0.08)', bgDark: 'rgba(255,122,26,0.15)' },
    { label: 'FAR Reports', icon: ClipboardList, path: '/reports/assets', color: tk.blue, bgLight: 'rgba(59,130,246,0.08)', bgDark: 'rgba(59,130,246,0.15)' },
    { label: 'CWIP Projects', icon: Building2, path: '/finance/cwip', color: tk.green, bgLight: 'rgba(16,185,129,0.08)', bgDark: 'rgba(16,185,129,0.15)' },
    { label: 'Capex Planning', icon: IndianRupee, path: '/finance/capex', color: tk.purple, bgLight: 'rgba(139,92,246,0.08)', bgDark: 'rgba(139,92,246,0.15)' },
  ] : [
    { label: 'My Assets', icon: Package, path: '/assets/manage', color: tk.orange, bgLight: 'rgba(255,122,26,0.08)', bgDark: 'rgba(255,122,26,0.15)' },
    { label: 'Raise Issue', icon: AlertCircle, path: '/assets/issues', color: tk.blue, bgLight: 'rgba(59,130,246,0.08)', bgDark: 'rgba(59,130,246,0.15)' },
    { label: 'My Requests', icon: ClipboardList, path: '/requests', color: tk.green, bgLight: 'rgba(16,185,129,0.08)', bgDark: 'rgba(16,185,129,0.15)' },
    { label: 'Scan Asset', icon: ShieldCheck, path: '/audit/smart-scan', color: tk.purple, bgLight: 'rgba(139,92,246,0.08)', bgDark: 'rgba(139,92,246,0.15)' },
  ];

  return (
    <div style={{ minHeight: '100%', margin: -24, padding: 24, background: tk.bg, transition: 'background 0.25s' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>

        {/* ── Toolbar ──────────────────────────────────────────────── */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
          <Col>
            <Space size={8} align="center">
              <Text style={{ color: tk.textMuted, fontSize: 13 }}>
                Client: <b style={{ color: tk.textPrimary }}>{clientName}</b>
              </Text>
              <Tag style={{ margin: 0, borderRadius: 6, fontSize: 11, background: tk.blueLight, color: tk.blue, border: 'none' }}>
                {lastUpdated}
              </Tag>
            </Space>
          </Col>
          <Col>
            <Button
              icon={<RefreshCcw size={14} />}
              loading={loading}
              onClick={() => fetchDashboardData()}
              style={{ borderRadius: 8, borderColor: tk.border, color: tk.textPrimary, background: tk.surface }}
            >
              Refresh
            </Button>
          </Col>
        </Row>

        {/* ── Financial Exposure Alert ────────────────────────────── */}
        {summary.missingAssetValue > 0 && (
          <Alert
            message={<Text strong style={{ color: tk.textPrimary }}>Financial Exposure: ₹{fmt(summary.missingAssetValue)}</Text>}
            description="Missing or unreconciled assets detected. Review the gap analysis report."
            type="warning" showIcon icon={<AlertCircle size={16} />}
            action={<Button size="small" onClick={() => navigate('/audit/gap-analysis')} style={{ borderRadius: 7 }}>Resolve Gap</Button>}
            style={{ borderRadius: 12, border: `1px solid ${tk.border}` }}
          />
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* FINANCIAL KPIs — CFO Row                                  */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div>
          <Text style={{ fontSize: 12, fontWeight: 700, color: tk.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'block' }}>
            Financial Overview
          </Text>
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={8} lg={4}>
              <KpiCard title="Gross Block" value={`₹${fmtCr(grossBlock)}`} icon={Landmark} bg={tk.blueLight} valueCss={tk.blue} tk={tk} />
            </Col>
            <Col xs={12} sm={8} lg={4}>
              <KpiCard title="Net Block (Co. Act)" value={`₹${fmtCr(nbv)}`} icon={IndianRupee} bg={tk.greenLight} valueCss={tk.green} tk={tk}
                subLabel={nbv > 0 && grossBlock > 0 ? `${((nbv / grossBlock) * 100).toFixed(0)}% of gross` : undefined} />
            </Col>
            <Col xs={12} sm={8} lg={4}>
              <KpiCard title="WDV (IT Act)" value={`₹${fmtCr(wdv)}`} icon={TrendingDown} bg={tk.purpleLight} valueCss={tk.purple} tk={tk} />
            </Col>
            <Col xs={12} sm={8} lg={4}>
              <KpiCard title="Acc. Dep (Co. Act)" value={`₹${fmtCr(coDepreciation)}`} icon={BarChart3} bg={tk.redLight} valueCss={tk.red} tk={tk} />
            </Col>
            <Col xs={12} sm={8} lg={4}>
              <KpiCard title="CWIP Balance" value={`₹${fmtCr(cwipBalance)}`} icon={Building2} bg={tk.amberLight} valueCss={tk.amber} tk={tk}
                subLabel={cwipCount > 0 ? `${cwipCount} active projects` : undefined} />
            </Col>
            <Col xs={12} sm={8} lg={4}>
              <KpiCard title="Capex (This Qtr)" value={`₹${fmtCr(capexAmount)}`} icon={PlusCircle} bg={tk.tealLight} valueCss={tk.teal} tk={tk}
                subLabel={capexCount > 0 ? `${capexCount} new assets` : undefined} />
            </Col>
          </Row>
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* OPERATIONAL KPIs                                          */}
        {/* ══════════════════════════════════════════════════════════ */}
        <div>
          <Text style={{ fontSize: 12, fontWeight: 700, color: tk.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'block' }}>
            Operational Overview
          </Text>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6} lg={4}>
              <KpiCard title="Total Assets" value={fmt(totalAssets)} icon={Package} bg={tk.blueLight} valueCss={tk.blue} tk={tk}
                trend={mom.totalAssets?.change ?? 0} trendUp={mom.totalAssets?.up ?? true} />
            </Col>
            <Col xs={12} md={6} lg={4}>
              <KpiCard title="Verified Assets" value={fmt(verifiedAssets)} icon={CheckCircle} bg={tk.greenLight} valueCss={tk.green} tk={tk}
                trend={mom.verifiedAssets?.change ?? 0} trendUp={mom.verifiedAssets?.up ?? true}
                subLabel={totalAssets > 0 ? `${((verifiedAssets / totalAssets) * 100).toFixed(0)}% verified` : undefined} />
            </Col>
            <Col xs={12} md={6} lg={4}>
              <KpiCard title="Missing Assets" value={fmt(missingAssets)} icon={AlertTriangle} bg={tk.amberLight} valueCss={tk.amber} tk={tk}
                subLabel={summary.missingAssetValue > 0 ? `₹${fmtCr(summary.missingAssetValue)} at risk` : undefined} />
            </Col>
            <Col xs={12} md={6} lg={4}>
              <KpiCard title="Critical Issues" value={fmt(criticalIssues)} icon={AlertCircle} bg={tk.redLight} valueCss={tk.red} tk={tk}
                trend={mom.criticalIssues?.change ?? 0} trendUp={mom.criticalIssues?.up ?? true} />
            </Col>
            <Col xs={12} md={6} lg={4}>
              <KpiCard title="Disposed Assets" value={fmt(disposedCount)} icon={TrendingDown} bg={tk.purpleLight} valueCss={tk.purple} tk={tk}
                subLabel={gainLoss !== 0 ? `${gainLoss > 0 ? 'Gain' : 'Loss'}: ₹${fmtCr(Math.abs(gainLoss))}` : undefined} />
            </Col>
            <Col xs={12} md={6} lg={4}>
              <KpiCard title="Audit Readiness" value={`${complianceScore.toFixed(0)}%`} icon={ShieldCheck}
                bg={complianceScore >= 75 ? tk.greenLight : complianceScore >= 50 ? tk.amberLight : tk.redLight}
                valueCss={complianceColor} tk={tk} />
            </Col>
          </Row>
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MIDDLE ROW — Details                                      */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Row gutter={[16, 16]} align="stretch">

          {/* ── Financial Breakdown ────────────────────────────────── */}
          <Col xs={24} lg={8}>
            <SectionCard title="Financial Breakdown" tk={tk}>
              <FinancialRow label="Gross Block (Original Cost)" value={`₹${fmt(grossBlock)}`} bold tk={tk} />
              <FinancialRow label="Dep — Companies Act" value={`₹${fmt(coDepreciation)}`} color={tk.red} tk={tk} />
              <FinancialRow label="Net Block (NBV)" value={`₹${fmt(nbv)}`} color={tk.green} bold tk={tk} />
              <Divider style={{ margin: '8px 0', borderColor: tk.borderMed, borderStyle: 'dashed' }} />
              <FinancialRow label="Dep — IT Act" value={`₹${fmt(itDepreciation)}`} color={tk.red} tk={tk} />
              <FinancialRow label="WDV (IT Act)" value={`₹${fmt(wdv)}`} color={tk.purple} bold tk={tk} />
              <Divider style={{ margin: '8px 0', borderColor: tk.borderMed, borderStyle: 'dashed' }} />
              <FinancialRow label="CWIP (Work in Progress)" value={`₹${fmt(cwipBalance)}`} color={tk.amber} tk={tk} />
              <FinancialRow label="Disposal Gain/Loss" value={`₹${fmt(Math.abs(gainLoss))}`} color={gainLoss >= 0 ? tk.green : tk.red} tk={tk} border={false} />
            </SectionCard>
          </Col>

          {/* ── Assets by Category ─────────────────────────────────── */}
          <Col xs={24} lg={8}>
            <SectionCard title="Assets by Category" tk={tk}>
              {totalAssets === 0 ? (
                <Empty description={<Text style={{ color: tk.textMuted }}>No asset data</Text>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={14}>
                  {categoryRows.map((row) => {
                    const pct = totalAssets > 0 ? Math.round((row.count / totalAssets) * 100) : 0;
                    return (
                      <div key={row.label}>
                        <Row justify="space-between" style={{ marginBottom: 5 }}>
                          <Text style={{ fontSize: 13, color: tk.textPrimary }}>{row.label}</Text>
                          <Space size={6}>
                            <Text strong style={{ fontSize: 13, color: tk.textPrimary }}>{row.count}</Text>
                            <Text style={{ fontSize: 12, color: tk.textMuted }}>{pct}%</Text>
                          </Space>
                        </Row>
                        <Progress percent={pct} showInfo={false} strokeColor={row.color}
                          railColor={dark ? 'rgba(255,255,255,0.08)' : 'var(--color-border-medium)'} size="small" />
                      </div>
                    );
                  })}
                </Space>
              )}
            </SectionCard>
          </Col>

          {/* ── Compliance & Maintenance ────────────────────────────── */}
          <Col xs={24} lg={8}>
            <SectionCard title="Compliance & Maintenance" tk={tk}>
              <div style={{ padding: '8px 0 12px' }}>
                <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: tk.textMuted }}>Audit Readiness</Text>
                  <Text style={{ fontSize: 18, fontWeight: 800, color: complianceColor }}>{complianceScore.toFixed(1)}%</Text>
                </Row>
                <Progress percent={complianceScore} status={complianceStatus} size="small"
                  strokeColor={complianceColor} railColor={dark ? 'rgba(255,255,255,0.08)' : 'var(--color-border-medium)'} format={() => null} />
                <Text style={{ fontSize: 11, color: tk.textSub, marginTop: 4, display: 'block' }}>
                  {complianceScore >= 75 ? 'Audit ready' : complianceScore >= 50 ? 'Moderate risk' : 'Needs attention'}
                </Text>
              </div>
              <Divider style={{ margin: '4px 0', borderColor: tk.border }} />
              <Space direction="vertical" style={{ width: '100%' }} size={0}>
                {[
                  { label: 'AMC Expiring (30 days)', value: amcExpiring, color: amcExpiring > 0 ? tk.red : tk.green, icon: Clock },
                  { label: 'Overdue Services', value: amcOverdue, color: amcOverdue > 0 ? tk.amber : tk.green, icon: Wrench },
                  { label: 'Warranty Expiring', value: warrantyExpiring, color: warrantyExpiring > 0 ? tk.amber : tk.green, icon: Shield },
                  { label: 'Maintenance Overdue', value: maintenanceOverdue, color: maintenanceOverdue > 0 ? tk.red : tk.green, icon: AlertTriangle },
                ].map((item, i) => {
                  const MIcon = item.icon;
                  return (
                    <div key={i} style={{ padding: '9px 0', borderBottom: i < 3 ? `1px solid ${tk.border}` : 'none' }}>
                      <Row justify="space-between" align="middle">
                        <Space size={8}>
                          <MIcon size={14} color={item.color} />
                          <Text style={{ fontSize: 13, color: tk.textMuted }}>{item.label}</Text>
                        </Space>
                        <Tag style={{
                          margin: 0, borderRadius: 6, fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'center',
                          background: item.value > 0 ? (item.color === tk.red ? tk.redLight : tk.amberLight) : tk.greenLight,
                          color: item.color, border: 'none',
                        }}>
                          {item.value}
                        </Tag>
                      </Row>
                    </div>
                  );
                })}
              </Space>
            </SectionCard>
          </Col>
        </Row>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* BOTTOM ROW — Alerts, Quick Actions, Approvals             */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Row gutter={[16, 16]} align="stretch">

          {/* ── Alerts & Notifications ────────────────────────────── */}
          <Col xs={24} lg={10}>
            <SectionCard
              title="Alerts & Notifications"
              extra={alerts.length > 4 && (
                <Button type="link" size="small" onClick={() => navigate('/admin/notifications')}
                  style={{ color: tk.orange, paddingRight: 0 }}>View all</Button>
              )}
              tk={tk}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {alerts.slice(0, 4).map((a, i) => {
                  const meta = alertSeverityMeta(a.severity);
                  const AIcon = meta.icon;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                      borderRadius: 10, background: meta.bg,
                      border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'var(--color-border-medium)'}`,
                    }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: dark ? 'rgba(255,255,255,0.06)' : 'var(--color-bg-card)', display: 'grid', placeItems: 'center' }}>
                        <AIcon size={15} color={meta.color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 13, color: tk.textPrimary, display: 'block' }}>{a.message}</Text>
                        <Text style={{ fontSize: 12, color: tk.textMuted }}>{a.category || 'System alert'}</Text>
                      </div>
                      <Tag style={{ fontSize: 10, borderRadius: 5, margin: 0, flexShrink: 0,
                        background: meta.bg, color: meta.color, border: `1px solid ${meta.color}40` }}>
                        {a.severity || 'INFO'}
                      </Tag>
                    </div>
                  );
                })}
                {alerts.length === 0 && (
                  <Empty description={<Text style={{ color: tk.textMuted }}>No active alerts</Text>}
                    image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '20px 0' }} />
                )}
              </Space>
            </SectionCard>
          </Col>

          {/* ── Quick Actions ─────────────────────────────────────── */}
          <Col xs={24} lg={6}>
            <SectionCard title="Quick Actions" tk={tk}>
              <Row gutter={[10, 10]}>
                {quickActions.map((qa) => {
                  const QIcon = qa.icon;
                  return (
                    <Col span={12} key={qa.label}>
                      <div
                        onClick={() => navigate(qa.path)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          justifyContent: 'center', gap: 8, padding: '16px 8px',
                          borderRadius: 12, background: dark ? qa.bgDark : qa.bgLight,
                          border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'var(--color-border-medium)'}`,
                          cursor: 'pointer', transition: 'all 0.15s', minHeight: 80,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = tk.shadow; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: 8,
                          background: dark ? 'rgba(255,255,255,0.06)' : 'var(--color-bg-card)',
                          display: 'grid', placeItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                          <QIcon size={15} color={qa.color} />
                        </div>
                        <Text style={{ fontSize: 11, fontWeight: 600, color: tk.textPrimary, textAlign: 'center', lineHeight: 1.3 }}>
                          {qa.label}
                        </Text>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </SectionCard>
          </Col>

          {/* ── Pending Approvals ─────────────────────────────────── */}
          <Col xs={24} lg={8}>
            <SectionCard
              title="Pending Approvals"
              extra={recommendations.length > 0 && (
                <Button type="link" size="small" onClick={() => navigate('/requests/approval-requests')}
                  style={{ color: tk.orange, paddingRight: 0 }}>View all</Button>
              )}
              tk={tk}
            >
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {recommendations.slice(0, 3).map((r, idx) => (
                  <div key={idx} style={{ borderRadius: 10, padding: '12px 14px', background: tk.surfaceAlt, border: `1px solid ${tk.border}` }}>
                    <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 13, color: tk.textPrimary, flex: 1, marginRight: 8 }}>
                        {r.title || (r.priority === 'HIGH' ? 'Vendor bank details change' : 'Compliance update')}
                      </Text>
                      {r.priority === 'HIGH' && (
                        <Tag style={{ margin: 0, fontSize: 10, borderRadius: 5, background: tk.redLight, color: tk.red, border: 'none' }}>High</Tag>
                      )}
                    </Row>
                    <Text style={{ fontSize: 12, color: tk.textMuted, display: 'block', marginBottom: 10 }}>
                      {r.message || 'Awaiting approval'}
                    </Text>
                    <Space size={8}>
                      <Button type="primary" size="small" onClick={() => navigate('/requests/approval-requests')}
                        style={{ borderRadius: 10, background: 'var(--primary-gradient)', border: 'none', fontSize: 12, fontWeight: 700, padding: '0 16px', height: 30 }}>
                        Approve
                      </Button>
                                       <Button size="small" onClick={() => navigate('/requests/approval-requests')}
                        style={{ borderRadius: 10, fontSize: 12, fontWeight: 600, padding: '0 16px', height: 30 }}>
                        Reject
                      </Button>
                    </Space>
                  </div>
                ))}
                {recommendations.length === 0 && (
                  <Empty description={<Text style={{ color: tk.textMuted }}>No pending approvals</Text>}
                    image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '20px 0' }} />
                )}
              </Space>
            </SectionCard>
          </Col>
        </Row>

      </Space>
    </div>
  );
};

export default ExecutiveDashboard;
