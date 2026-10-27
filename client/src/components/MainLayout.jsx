import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import { TIER_STYLE } from '../utils/session';
import { Layout, Menu, Button, Avatar, Space, Badge, Dropdown, Typography, Modal, Tooltip, message, ConfigProvider, Divider, Input } from 'antd';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRightLeft, ArrowUpDown,
  BadgePercent, BarChart3, Bell, BookOpen, Boxes, Briefcase, Building, Building2,
  Calculator, Calendar, CalendarClock, CalendarDays, CheckSquare, ChevronRight,
  ClipboardCheck, ClipboardList, ClipboardSignature, ClipboardX,
  Database, FileBarChart2, FileText, FolderKanban,
  Gavel, GitBranch, GitMerge, Globe, Hash,
  HeartPulse, IndianRupee, Key, Landmark, Layers,
  LayoutDashboard as DashboardIcon, LifeBuoy, ListChecks, Lock, LogOut,
  Map, Maximize2, Minimize2, Moon,
  Package, PackageCheck, PackagePlus, PenTool, PieChart, PlusCircle, PlusSquare, Printer,
  QrCode, ReceiptIndianRupee, RefreshCcw, Scale, ScanSearch, ScrollText, Search,
  SendHorizontal, Settings, Settings2, Shield, ShieldAlert, ShieldCheck, ShoppingCart,
  Star, Sun, Tag, Ticket, ToggleLeft, Trash2, TrendingDown, TrendingUp,
  User, UserCheck, Users, Users2, WalletCards, Wrench, Menu as LucideMenu,
  HandCoins, Sparkles, Mail,
} from 'lucide-react';



import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout } from '../store/authSlice';

import styled from 'styled-components';
import Logo from './base/Logo';
import { usePermissions } from '../hooks/usePermissions';
import { canSeePath, isLedgerRole } from '../config/rbac';
import AccessDenied from './AccessDenied';
import CompanySwitcher from './CompanySwitcher';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const SiderLogo = styled.div`
  height: 80px;
  display: flex;
  align-items: center;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  margin-bottom: 4px;
  overflow: hidden;
`;

const SiderLogoText = styled.span`
  color: #ffffff;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.5px;
  white-space: nowrap;
  
  span {
    color: #2563EB;
  }
`;

const normalizeNotifications = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.notifications)) return payload.notifications;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
};

const MainLayout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('fixtag_dark') === 'true'; } catch { return false; }
  });

  // Sync dark state when localStorage changes (e.g. toggled inside a page)
  useEffect(() => {
    const sync = () => {
      try { setDarkMode(localStorage.getItem('fixtag_dark') === 'true'); } catch { /* silenced */ }
    };
    window.addEventListener('storage', sync);
    // Also poll every 500ms for same-tab changes (localStorage events don't fire in same tab)
    const t = setInterval(sync, 500);
    return () => { window.removeEventListener('storage', sync); clearInterval(t); };
  }, []);

  const navBg      = darkMode ? 'rgba(11,16,32,0.88)' : 'rgba(255,255,255,0.82)';
  const navBorder  = darkMode ? 'rgba(255,255,255,0.08)' : '#E6EAF2';
  const navText    = darkMode ? '#94A3B8' : '#64748b';
  const navTextBold= darkMode ? '#F8FAFC' : '#0B1020';
  const pageBg     = darkMode ? '#070B14' : '#F4F6FB';
  const dividerCol = darkMode ? 'rgba(255,255,255,0.1)' : '#e2e8f0';

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const user = useMemo(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return null;
      const parsedUser = JSON.parse(storedUser);
      return { ...parsedUser, role: parsedUser.role || parsedUser.Role?.code };
    } catch {
      return null;
    }
  }, []);
  const [features, setFeatures] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { hasPermission } = usePermissions();

  const normalizedRole = String(user?.role || '').toUpperCase();
  const isCompanyAdmin = ['ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN'].includes(normalizedRole) && Boolean(user?.client_id);
  const tierStyle = TIER_STYLE[user?.tier] || null;
  const isAdmin = normalizedRole === 'SUPER_ADMIN' || normalizedRole === 'CLIENT_ADMIN' || normalizedRole === 'PROVIDER_ADMIN' || normalizedRole === 'ADMIN' || normalizedRole === 'DEV_ADMIN';

  // ─── Role-based sidebar visibility ───
  // PROVIDER_ADMIN/DEV_ADMIN: all menus
  // SUPER_ADMIN/CLIENT_ADMIN: all client features (no Platform Admin)
  // ADMIN: finance + operations + procurement + maintenance + audit + inventory
  // AUDITOR: audit & compliance only
  // PROCUREMENT: procurement only
  // REQUESTER: view assets + raise issues/requests
  // MAINTENANCE: maintenance & support only
  const canSeeProcurement = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN','PROCUREMENT'].includes(normalizedRole);
  const canSeeAssetOps = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN','REQUESTER','MAINTENANCE'].includes(normalizedRole);
  const canSeeFinance = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN'].includes(normalizedRole);
  // AI invoice pages follow the API's role rules (see procurement.routes ap-invoices and ar.routes).
  const canSeeApAutomation = canSeeFinance || ['ACCOUNTS_PAYABLE','FINANCE','DIRECTOR_CFO','MANAGER','COMPLIANCE','MANAGEMENT','PROCUREMENT','AUDITOR'].includes(normalizedRole);
  const canSeeArInvoices = canSeeFinance || ['ACCOUNTS_RECEIVABLE','FINANCE','MANAGEMENT'].includes(normalizedRole);
  const canSeeMaintenance = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN','MAINTENANCE'].includes(normalizedRole);
  const canSeeAudit = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN','AUDITOR'].includes(normalizedRole);
  const canSeeInventory = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN'].includes(normalizedRole);
  const canSeeMasters = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN'].includes(normalizedRole);
  // Senior-admin governance actions (user/role mgmt, approval config, period lock) — the plain
  // 'ADMIN' role is intentionally EXCLUDED (mirrors the backend requireSeniorAdmin guard).
  const canManageGovernance = ['PROVIDER_ADMIN','DEV_ADMIN','SUPER_ADMIN','CLIENT_ADMIN','ADMIN'].includes(normalizedRole);
  // Vendor is a SHARED ENTERPRISE MASTER (used by procurement, asset inward, AMC, warranty, insurance,
  // and future modules). Visible whenever any vendor-consuming module is enabled AND the role deals with
  // vendors — NOT gated on the Procurement feature flag.
  const usesVendors = !features || ['PROCUREMENT_MODULE','MAINTENANCE_MODULE','INSURANCE_MODULE','AMC_MODULE','ASSET_MODULE'].some((k) => features[k] !== false);
  // Compliance onboards vendors and verifies their details.
  const canManageVendors = usesVendors && (canSeeMasters || canSeeProcurement || canSeeMaintenance || normalizedRole === 'COMPLIANCE');
  const _canManageUsers = hasPermission('USERS', 'VIEW') || hasPermission('ROLES', 'VIEW') || isAdmin;

  useEffect(() => {
    const fetchFeatures = async () => {
      try {
        const result = await api.get('/system/features', { 
          params: { client_id: user?.client_id || null } 
        });
        // Interceptor unwraps response.data â†’ result = { success, data:[] }
        const featureList = Array.isArray(result)
          ? result
          : (Array.isArray(result?.data?.data)
            ? result.data.data
            : (Array.isArray(result?.data) ? result.data : []));
        const featureMap = {};
        featureList.forEach(f => {
          featureMap[f.feature_key] = f.is_enabled !== false;
        });
        setFeatures(featureMap);
      } catch {
        /* feature flags API unavailable â€” defaulting all modules to enabled */
        // Fallback: Default all major modules to true if API fails
        setFeatures({
          PROCUREMENT_MODULE: true,
          ASSET_MODULE: true,
          INVENTORY_MODULE: true,
          AUDIT_MODULE: true,
          REPORTS_MODULE: true
        });
      }
    };
    const token = localStorage.getItem('token');
    if (token) {
      fetchFeatures();
    }
  }, []);

  // Global hard fix: remove Back/Next navigation buttons across all modules
  useEffect(() => {
    const hideBackNextButtons = () => {
      const buttons = document.querySelectorAll('button, a[role="button"], .ant-btn');
      buttons.forEach((el) => {
        const text = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const aria = String(el.getAttribute('aria-label') || '').toLowerCase();
        const title = String(el.getAttribute('title') || '').toLowerCase();
        const shouldHide = /\bback\b|\bnext\b/.test(text) || /\bback\b|\bnext\b/.test(aria) || /\bback\b|\bnext\b/.test(title);
        if (shouldHide) {
          const target = el.closest('.ant-space-item, button, a[role="button"], .ant-btn') || el;
          target.style.display = 'none';
        }
      });
    };

    hideBackNextButtons();
    const observer = new MutationObserver(() => hideBackNextButtons());
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setInterval(hideBackNextButtons, 500);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, []);

  // Global UI standardization: remove filled background from header icon badges
  useEffect(() => {
    const normalizeHeaderIcons = () => {
      const nodes = document.querySelectorAll('div, span');
      nodes.forEach((el) => {
        const style = window.getComputedStyle(el);
        const w = Math.round(parseFloat(style.width || '0'));
        const h = Math.round(parseFloat(style.height || '0'));
        const isBadgeSize = w >= 34 && w <= 42 && h >= 34 && h <= 42;
        const hasBg = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        const hasIconChild = !!el.querySelector('svg');
        if (isBadgeSize && hasBg && hasIconChild) {
          el.style.background = 'transparent';
          el.style.boxShadow = 'none';
        }
      });
    };

    normalizeHeaderIcons();
    const observer = new MutationObserver(() => normalizeHeaderIcons());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('/audit-sessions/notifications');
      setNotifications(normalizeNotifications(response?.data ?? response));
    } catch {
      setNotifications([]);
      /* non-critical â€” bell badge stays at last known count */
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) setTimeout(() => fetchNotifications(), 0);
    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('token');
      if (currentToken) fetchNotifications();
    }, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = async (id) => {
    try {
      await api.post(`/audit-sessions/notifications/${id}/read`);
      fetchNotifications();
    } catch {
      /* non-critical â€” item will disappear on next poll */
    }
  };

  const safeNotifications = Array.isArray(notifications)
    ? notifications.filter((n) => n && typeof n === 'object')
    : [];

  const notificationItems = safeNotifications.length > 0 ? safeNotifications.map((n, idx) => ({
    key: String(n?.id || `n-${idx}`),
    label: (
      <div style={{ maxWidth: 250, padding: '4px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          {n?.type === 'CRITICAL' ? <AlertCircle size={14} color="#f5222d" /> : <AlertTriangle size={14} color="#faad14" />}
          <Text strong style={{ fontSize: 12 }}>{String(n?.type || 'INFO')}</Text>
        </div>
        <Text style={{ fontSize: 12, display: 'block' }}>{String(n?.message || n?.title || 'Notification')}</Text>
        <Button
          type="link"
          size="small"
          onClick={() => n?.id && markRead(n.id)}
          disabled={!n?.id}
          style={{ padding: 0, height: 'auto', fontSize: 11 }}
        >
          Mark as read
        </Button>
      </div>
    )
  })) : [{ key: 'none', label: <Text type="secondary">No new alerts</Text> }];

  const notificationMenuItems = [
    ...notificationItems,
    { type: 'divider' },
    {
      key: 'view-all-alerts',
      label: <Text strong style={{ color: '#1d4ed8' }}>View All Alerts</Text>
    }
  ];


  const menuItems = [
    // ─── 1. DASHBOARD ───
    { key: '/dashboard', icon: <DashboardIcon size={18} color="#A5B4FC" />, label: 'Dashboard' },

    // ─── 2. ADMIN PANEL (admin-only) ───
    {
      key: 'admin-panel',
      icon: <ShieldCheck size={18} color="#A5B4FC" />,
      label: 'Admin Panel',
      hidden: !isAdmin,
      children: [
        { key: '/admin/company-access', label: 'Company Access', icon: <Building2 size={14} />, hidden: !isCompanyAdmin },
        { key: '/admin/users', label: 'User Management', icon: <User size={14} />, hidden: !canManageGovernance },
        { key: '/admin/roles', label: 'Role & Permissions', icon: <ShieldCheck size={14} />, hidden: !canManageGovernance },
        { key: '/admin/audit-logs', label: 'Audit Logs', icon: <FileText size={14} />, hidden: !canManageGovernance },
        { key: '/system/settings', label: 'Application Settings', icon: <Settings2 size={14} />, hidden: !canManageGovernance },
        { key: '/system/features', label: 'Module Access', icon: <Settings2 size={14} />, hidden: !canManageGovernance },
        // 'Global Settings' retired from nav — its fields are vestigial (legacy pre-Approval-Matrix
        // level approvers are never persisted; export toggles + company name are read by nothing).
        // Approval now lives entirely in Approval Matrix + Approval Matrix (DOA). Route/page kept for rollback.
        // { key: '/system/settings', label: 'Global Settings', icon: <Settings2 size={14} /> },
        { key: '/system/approval-matrix', label: 'Approval Matrix', icon: <TrendingDown size={14} />, hidden: !canManageGovernance },
        { key: '/settings/doa-matrix', label: 'Approval Matrix (DOA)', icon: <TrendingDown size={14} />, hidden: !canManageGovernance },
      ]
    },

    // ─── 3. PROCUREMENT ───
    {
      key: 'procurement-mgmt',
      icon: <ShoppingCart size={18} color="#A5B4FC" />,
      label: 'Accounts Payable',
      hidden: (!canSeeProcurement && !canSeeApAutomation) || (features && features.PROCUREMENT_MODULE === false),
      children: [
        { key: '/procurement/requisition', icon: <FileText size={16} />, label: 'Requisition (PR)', hidden: !canSeeProcurement },
        { key: '/procurement/rfq', icon: <FileText size={16} />, label: 'RFQ (Sourcing)', hidden: !canSeeProcurement },
        { key: '/procurement/quotations', icon: <IndianRupee size={16} />, label: 'Quotations', hidden: !canSeeProcurement },
        { key: '/procurement/purchase-orders', icon: <ShoppingCart size={16} />, label: 'Purchase Orders (PO)', hidden: !canSeeProcurement },
        { key: '/procurement/gate-entry', icon: <ShieldCheck size={16} />, label: 'Gate Entry & QC', hidden: !canSeeProcurement },
        { key: '/procurement/grn', icon: <PackageCheck size={16} />, label: 'Goods Receipt (GRN)', hidden: !canSeeProcurement },
        { key: '/procurement/ses', icon: <ClipboardCheck size={16} />, label: 'Service Entry Sheet (SES)', hidden: !canSeeProcurement },
        { key: '/finance/ap/ai-invoices', icon: <Sparkles size={16} />, label: 'AI Invoice Processing', hidden: !canSeeApAutomation },
        { key: '/procurement/invoices', icon: <ReceiptIndianRupee size={16} />, label: 'Invoice Processing', hidden: !canSeeProcurement || features?.ENABLE_INVOICE_MODULE === false },
        { key: '/finance/three-way-match', icon: <GitMerge size={16} />, label: '3-Way Match', hidden: !canSeeFinance },
        { key: '/finance/ap-accounting-entry', icon: <BookOpen size={16} />, label: 'AP Accounting Entry', hidden: !canSeeFinance },
        { key: '/finance/ap-management', icon: <Scale size={16} />, label: 'Accounts Payable Management', hidden: !canSeeFinance },
        { key: '/finance/payment-processing', icon: <WalletCards size={16} />, label: 'Payment Processing', hidden: !canSeeFinance },
        { key: '/procurement/vendor-risk', icon: <ShieldCheck size={16} />, label: 'Vendor Risk', hidden: !canSeeProcurement },
        { key: '/procurement/reports', icon: <BarChart3 size={16} />, label: 'Reports', hidden: !canSeeProcurement },
        { key: '/settings/po-print', icon: <Printer size={16} />, label: 'PO Print Settings', hidden: !canSeeFinance },
      ]
    },

    {
      key: 'accounts-receivable',
      icon: <Landmark size={18} color="#A5B4FC" />,
      label: 'Accounts Receivable',
      hidden: (!canSeeProcurement && !canSeeArInvoices) || (features && features.PROCUREMENT_MODULE === false),
      children: [
        { key: '/finance/ar/customer-invoices', icon: <HandCoins size={16} />, label: 'Customer Invoices', hidden: !canSeeArInvoices },
        { key: '/finance/ar/record-to-report', icon: <ScrollText size={16} />, label: 'Record to Report', hidden: !canSeeFinance },
        { key: '/finance/ar/chart-of-accounts', icon: <ListChecks size={16} />, label: 'Chart of Accounts', hidden: !canSeeFinance },
        { key: '/finance/ar/journal-entry', icon: <BookOpen size={16} />, label: 'Journal Entry', hidden: !canSeeFinance },
        { key: '/finance/ar/general-ledger', icon: <Layers size={16} />, label: 'General Ledger', hidden: !canSeeFinance },
        { key: '/finance/ar/reconciliations', icon: <Scale size={16} />, label: 'Reconciliations', hidden: !canSeeFinance },
        { key: '/finance/ar/trial-balance', icon: <FileBarChart2 size={16} />, label: 'Trial Balance', hidden: !canSeeFinance },
        { key: '/finance/ar/financial-statements', icon: <BarChart3 size={16} />, label: 'Financial Statements', hidden: !canSeeFinance },
        { key: '/finance/ar/period-close', icon: <CalendarClock size={16} />, label: 'Period Close', hidden: !canSeeFinance },
      ]
    },







    // ─── 10. REQUESTS ───
    {
      key: '/requests',
      icon: <ClipboardList size={18} color="#A5B4FC" />,
      label: 'Requests',
      hidden: !user,
      children: [
        { key: '/requests/my', icon: <ListChecks size={16} />, label: 'My Requests' },
        { key: '/requests/approvals', icon: <CheckSquare size={16} />, label: 'Approval Requests' },
        { key: '/requests/new', icon: <PlusCircle size={16} />, label: 'New Request' },
      ]
    },

    // ─── VENDOR MASTER (own section; not under Master Data or Business Partners) ───
    {
      key: 'vendor-master-module',
      icon: <Briefcase size={18} color="#A5B4FC" />,
      label: 'Vendor Master',
      hidden: !canManageVendors,
      children: [
        { key: '/vendor-master', icon: <Building2 size={16} />, label: 'Vendors', hidden: !canManageVendors },
      ]
    },

    // ─── 11. PLATFORM ADMIN (PROVIDER_ADMIN only) ───
    {
      key: 'client-management',
      icon: <Building2 size={18} color="#A5B4FC" />,
      label: 'Platform Admin',
      hidden: normalizedRole !== 'PROVIDER_ADMIN' && normalizedRole !== 'DEV_ADMIN',
      children: [
        { key: '/clients/onboarding', icon: <Users size={14} />, label: 'Client Onboarding' },
        { key: '/clients/companies', icon: <Building2 size={14} />, label: 'Company Management' },
        { key: '/clients/licenses', icon: <Key size={14} />, label: 'License Management' },
        { key: '/clients/support', icon: <LifeBuoy size={14} />, label: 'Global Support' },
        { key: '/system/integration', label: 'External Integrations', icon: <Database size={14} /> },
        { key: '/settings/numbering', label: 'Document Numbering', icon: <Hash size={14} /> },
        { key: '/settings/notifications', label: 'Notification Recipients', icon: <Bell size={14} /> },
        { key: '/admin/notifications', label: 'Notification Settings', icon: <Bell size={14} /> },
        { key: '/system/security-dashboard', label: 'Security Dashboard', icon: <ShieldCheck size={14} /> },
        { key: '/security/audit-trail', label: 'Immutable Audit Trail', icon: <FileText size={14} /> },
        { key: '/security/sod', icon: <Shield size={16} />, label: 'Segregation of Duties' },
        { key: '/security/sso', icon: <Globe size={16} />, label: 'SSO Configuration' },
        { key: '/security/sessions', icon: <Users2 size={16} />, label: 'Session Management' },
      ]
    },

    // ─── Master Data (business reference data ONLY; Finance & Administration stay separate) ───
    {
      key: 'master-data',
      icon: <Database size={18} color="#A5B4FC" />,
      label: 'Master Data',
      hidden: !canSeeMasters,
      children: [
        {
          key: 'md-organization',
          icon: <Building2 size={16} />,
          label: 'Organization',
          hidden: !canSeeMasters,
          children: [
            { key: '/masters/entities', icon: <Building2 size={16} />, label: 'Entities', hidden: !canSeeMasters },
            { key: '/masters?tab=departments', icon: <Building2 size={16} />, label: 'Departments', hidden: !canSeeMasters },
            { key: '/masters/sub-departments', icon: <Building2 size={16} />, label: 'Sub-Departments', hidden: !canSeeMasters },
            { key: '/masters?tab=locations', icon: <Building2 size={16} />, label: 'Locations', hidden: !canSeeMasters },
            { key: '/property/manage', icon: <Building2 size={16} />, label: 'Properties', hidden: !canSeeMasters },
            { key: '/masters?tab=propertyTypes', icon: <Building2 size={16} />, label: 'Property Types', hidden: !canSeeMasters },
            { key: '/masters/regions', icon: <Building2 size={16} />, label: 'Regions', hidden: !canSeeMasters },
            { key: '/masters/entity-gst', icon: <Building2 size={16} />, label: 'Entity GST', hidden: !canSeeFinance || (features && features.FINANCE_MODULE === false) },
            { key: '/masters/employees', icon: <Users size={16} />, label: 'Employees', hidden: !canSeeMasters },
          ]
        },
        {
          key: 'md-financial-masters', icon: <FileText size={16} />, label: 'Financial Masters', hidden: !canSeeMasters,
          children: [
            { key: '/finance/gl-mapping', icon: <FileText size={16} />, label: 'GL Account Mapping', hidden: !canSeeFinance || (features && features.FINANCE_MODULE === false) },
            { key: '/compliance/cost-centers', icon: <Boxes size={16} />, label: 'Cost Centers', hidden: !canSeeFinance || (features && features.FINANCE_MODULE === false) },
          ]
        },
      ]
    },
  ].filter(Boolean);


  // Filter out hidden items
  // Render leaf nav items as real <a href> links so the browser offers "Open in new tab"
  // (right-click / Ctrl-click / middle-click). Plain left-click still uses SPA navigation
  // via the Menu onClick; modified clicks fall through to the native href (new tab).
  const linkifyLabel = (item) => {
    if (!item) return item;
    if (item.children) {
      // Recurse so nested subgroups filter hidden items + linkify leaves at any depth.
      return { ...item, children: item.children.filter(child => !child.hidden).map(linkifyLabel) };
    }
    if (typeof item.key === 'string' && item.key.startsWith('/')) {
      return {
        ...item,
        label: (
          <a
            href={item.key}
            style={{ color: 'inherit' }}
            onClick={(e) => { if (!(e.ctrlKey || e.metaKey || e.button === 1)) e.preventDefault(); }}
          >
            {item.label}
          </a>
        )
      };
    }
    return item;
  };

  const scopeMenuForRole = (items) => {
    if (!isLedgerRole(normalizedRole)) return items;
    return items.map((item) => {
      if (!item.children) {
        const path = typeof item.key === 'string' ? item.key : '';
        return path.startsWith('/') && !canSeePath(normalizedRole, path) ? { ...item, hidden: true } : item;
      }
      const children = item.children.map((child) => {
        if (child.children) {
          const nested = child.children.map((leaf) => (
            typeof leaf.key === 'string' && leaf.key.startsWith('/') && !canSeePath(normalizedRole, leaf.key)
              ? { ...leaf, hidden: true }
              : leaf
          ));
          return { ...child, children: nested, hidden: nested.every((leaf) => leaf.hidden) };
        }
        if (typeof child.key === 'string' && child.key.startsWith('/')) {
          return { ...child, hidden: !canSeePath(normalizedRole, child.key) };
        }
        return child;
      });
      return { ...item, hidden: children.every((child) => child.hidden), children };
    });
  };

  const filteredMenuItems = scopeMenuForRole(menuItems).filter(item => !item.hidden).map(linkifyLabel);


  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const onProfileAction = async (action) => {
    setUserMenuOpen(false);
    if (action === 'profile') {
      navigate('/my-profile');
      return;
    }
    if (action === 'switch-company') {
      navigate('/select-company');
      return;
    }
    if (action === 'settings') {
      navigate('/security-settings');
      return;
    }
    if (action === 'email-account') {
      navigate('/settings/email-account');
      return;
    }
    if (action === 'sync') {
      navigate(`/dashboard?sync=${Date.now()}`);
      setTimeout(() => {
        window.dispatchEvent(new Event('fixtag:sync'));
      }, 80);
      return;
    }
    if (action === 'logout') {
      await handleLogout();
    }
  };

  const userMenuItems = [
    { key: 'switch-company', icon: <ArrowRightLeft size={14} />, label: 'Switch company' },
    { type: 'divider' },
    { key: 'profile', icon: <User size={14} />, label: 'My Profile' },
    { key: 'settings', icon: <Settings size={14} />, label: 'Security Settings' },
    ...(isAdmin ? [{ key: 'email-account', icon: <Mail size={14} />, label: 'Email account' }] : []),
    { key: 'sync', icon: <RefreshCcw size={14} />, label: 'Sync Dashboard' },
    { type: 'divider' },
    { key: 'logout', icon: <LogOut size={14} />, label: <span style={{ color: '#ef4444' }}>Logout</span> }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={260}
        theme="dark"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          background: 'linear-gradient(180deg, #0B1020 0%, #12182B 55%, #0E1424 100%)',
          boxShadow: '8px 0 32px rgba(11, 16, 32, 0.18)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <SiderLogo style={{ justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0 22px' : '0 16px' }}>
          {collapsed
            ? <Logo size="36px" iconOnly />
            : <Logo size="40px" fontSize="17px" subFontSize="9.5px" />
          }
        </SiderLogo>
        
        <ConfigProvider
          theme={{
            components: {
              Menu: {
                darkItemSelectedBg: 'rgba(99, 102, 241, 0.28)',
                darkItemHoverBg: 'rgba(129, 140, 248, 0.14)',
                darkSubMenuItemBg: 'rgba(0,0,0,0.18)',
                darkItemColor: 'rgba(255, 255, 255, 0.72)',
                darkItemSelectedColor: '#ffffff',
                darkItemHoverColor: '#ffffff',
                darkPopupBg: '#12182B',
                itemBorderRadius: 12,
                itemSelectedBg: 'rgba(99, 102, 241, 0.28)',
                itemHoverBg: 'rgba(129, 140, 248, 0.1)',
                colorPrimary: '#6366F1',
                fontSize: 14,
              },
            },
          }}
        >
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={filteredMenuItems}
            onClick={({ key, domEvent }) => {
              if (typeof key !== 'string' || !key.startsWith('/')) return;
              if (domEvent && (domEvent.ctrlKey || domEvent.metaKey || domEvent.button === 1)) return; // let the browser open a new tab
              navigate(key);
            }}
            style={{
              borderRight: 0,
              background: 'transparent',
              fontSize: '13.5px',
              padding: '6px 8px',
              letterSpacing: '0.01em',
            }}
          />
        </ConfigProvider>
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'margin-left 0.2s ease, background 0.25s', background: pageBg }}>
        <Header style={{
          padding: '0 32px',
          background: navBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${navBorder}`,
          position: 'sticky',
          top: 0,
          zIndex: 9,
          height: 64,
          boxShadow: '0 1px 0 rgba(15, 23, 42, 0.04)',
          backdropFilter: 'blur(16px)',
          transition: 'background 0.25s, border-color 0.25s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <ChevronRight size={20} /> : <LucideMenu size={20} />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ width: 40, height: 40, marginRight: 24, color: navText }}
            />
            <div style={{ fontSize: 14, lineHeight: 1.2, color: navText, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                role="button"
                tabIndex={0}
                onClick={() => navigate('/dashboard')}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/dashboard')}
                style={{ cursor: 'pointer', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}
              >
                Home
              </span>
              <ChevronRight size={14} />
              <span style={{ color: navTextBold, fontWeight: 700, textTransform: location.pathname === '/' || location.pathname === '/dashboard' ? 'none' : 'capitalize', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {location.pathname === '/' || location.pathname === '/dashboard' ? 'AR & AP' : location.pathname.split('/').pop().replace(/-/g, ' ')}
              </span>
            </div>
          </div>
          
          <Space size={20}>
            {/* The company this session is in; click to switch (data is fully separate per company). */}
            <Tooltip title="Switch company">
              <button
                type="button"
                onClick={() => navigate('/select-company')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: 340, lineHeight: '18px', height: 38,
                  padding: '6px 12px 6px 8px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${dividerCol}`, background: 'transparent', color: navTextBold, font: 'inherit'
                }}
              >
                <span style={{ width: 26, height: 26, lineHeight: '26px', borderRadius: 8, background: user?.platform_view ? '#7c3aed' : '#4F46E5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Building2 size={14} />
                </span>
                <span style={{ display: 'inline-block', lineHeight: '18px', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.platform_view ? 'Platform view' : (user?.client_name || 'Company')}
                </span>
                {tierStyle && (
                  <span style={{ display: 'inline-block', lineHeight: '16px', fontSize: 11, fontWeight: 700, color: tierStyle.color, background: tierStyle.bg, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{tierStyle.label}</span>
                )}
                <ArrowRightLeft size={13} color={navText} style={{ flex: 'none' }} />
              </button>
            </Tooltip>
            <CompanySwitcher />



              <Tooltip title={darkMode ? 'Light Mode' : 'Dark Mode'}>
                <Button
                  type="text"
                  icon={darkMode ? <Sun size={20} color={navText} /> : <Moon size={20} color={navText} />}
                  onClick={() => {
                    setUserMenuOpen(false);
                    const next = !darkMode;
                    setDarkMode(next);
                    try { localStorage.setItem('fixtag_dark', String(next)); } catch { /* silenced */ }
                  }}
                  style={{ color: '#64748B' }}
                />
              </Tooltip>
            <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
              <Button
                type="text"
                icon={isFullscreen ? <Minimize2 size={20} color={navText} /> : <Maximize2 size={20} color={navText} />}
                onClick={toggleFullscreen}
                style={{ color: '#64748B' }}
              />
            </Tooltip>
            <Tooltip title="Search Assets">
              <Button
                type="text"
                icon={<Search size={20} color={navText} />}
                onClick={() => { setSearchOpen(true); setSearchQuery(''); setSearchResults([]); }}
                style={{ color: '#64748B' }}
              />
            </Tooltip>
            <Dropdown
              menu={{
                items: notificationMenuItems,
                onClick: ({ key }) => {
                  if (key === 'view-all-alerts') {
                    navigate('/assets/alerts');
                  }
                }
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Badge count={notifications.length} offset={[-2, 4]} color="#4F46E5">
                <Tooltip title="Alerts">
                  <Button
                    type="text"
                    icon={<Bell size={20} color={navText} />}
                    style={{ color: '#64748B' }}
                  />
                </Tooltip>
              </Badge>
            </Dropdown>
            <div style={{ width: 1, height: 20, background: dividerCol, margin: '0 8px' }} />
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: async ({ key }) => {
                  await onProfileAction(key);
                }
              }}
              placement="bottomRight"
              arrow
              trigger={['click']}
              open={userMenuOpen}
              onOpenChange={setUserMenuOpen}
            >
              <Button
                type="text"
                aria-label="User menu"
                icon={<User size={20} color={navText} />}
                style={{ color: '#64748B' }}
              />
            </Dropdown>
          </Space>
        </Header>
        
        <Content style={{
          padding: '32px',
          minHeight: 'calc(100vh - 72px)',
          background: pageBg,
          transition: 'background 0.25s',
        }}>
          {isLedgerRole(normalizedRole) && !canSeePath(normalizedRole, location.pathname) ? <AccessDenied /> : children}
        </Content>
      </Layout>

      {/* SBC Service Request Modal */}

      {/* â”€â”€ Global Search Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        open={searchOpen}
        onCancel={() => setSearchOpen(false)}
        footer={null}
        title={null}
        width={600}
        styles={{ body: { padding: '16px 20px 20px' } }}
        style={{ top: 80 }}
      >
        <div style={{ marginBottom: 12 }}>
          <Input
            autoFocus
            size="large"
            prefix={<Search size={16} color="var(--color-text-muted)" />}
            placeholder="Search assets by name, code, or serial..."
            value={searchQuery}
            allowClear
            onChange={async (e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (!q.trim()) { setSearchResults([]); return; }
              setSearchLoading(true);
              try {
                const res = await api.get(`/assets?search=${encodeURIComponent(q)}&limit=8`);
                const payload = res?.data;
                const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.assets) ? payload.assets : (Array.isArray(payload?.data) ? payload.data : []));
                setSearchResults(list.slice(0, 8));
              } catch { setSearchResults([]); }
              finally { setSearchLoading(false); }
            }}
            style={{ borderRadius: 'var(--radius-md)' }}
          />
        </div>
        {searchLoading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>Searching...</div>
        )}
        {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>No assets found for "{searchQuery}"</div>
        )}
        {!searchLoading && !searchQuery.trim() && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>Type to search assets...</div>
        )}
        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {searchResults.map(asset => (
              <div
                key={asset.id}
                onClick={() => { navigate(`/assets/view/${asset.id}`); setSearchOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-page)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-card)'}
              >
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Search size={16} color="var(--color-navy)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.asset_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {asset.asset_code}{asset.serial_number ? ` · ${asset.serial_number}` : ''}{asset.location_name ? ` · ${asset.location_name}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>{asset.status || 'Active'}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>

    </Layout>
  );
};

export default MainLayout;

