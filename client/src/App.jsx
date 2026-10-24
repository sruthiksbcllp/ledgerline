import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './App.css';

const RoleBasedHome = () => <Navigate to="/dashboard" replace />;
import { ConfigProvider, Spin, Space } from 'antd';
import { themeConfig } from './theme/themeConfig';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
// Lazy Load Pages
const Login = lazy(() => import('./pages/Login'));
const SelectCompany = lazy(() => import('./pages/SelectCompany'));
const CompanyAccess = lazy(() => import('./pages/CompanyAccess'));
const ManageUsers = lazy(() => import('./pages/ManageUsers'));
const AddUser = lazy(() => import('./pages/AddUser'));
const ManageRoles = lazy(() => import('./pages/ManageRoles'));
const AdminAuditLog = lazy(() => import('./pages/AdminAuditLog'));
const AddRole = lazy(() => import('./pages/AddRole'));

const ManageRegions = lazy(() => import('./pages/ManageRegions'));
const AddRegion = lazy(() => import('./pages/AddRegion'));
const ManageDepartments = lazy(() => import('./pages/ManageDepartments'));
const AddDepartment = lazy(() => import('./pages/AddDepartment'));
const ManageSubDepartments = lazy(() => import('./pages/ManageSubDepartments'));
const AddSubDepartment = lazy(() => import('./pages/AddSubDepartment'));

const ManageLocations = lazy(() => import('./pages/ManageLocations'));
const AddLocation = lazy(() => import('./pages/AddLocation'));
const ProcurementReports = lazy(() => import('./pages/ProcurementReports'));
const GlobalSettings = lazy(() => import('./pages/GlobalSettings'));
const Logout = lazy(() => import('./pages/Logout'));

const ApprovalInbox = lazy(() => import('./pages/ApprovalInbox'));
const ManageProperties = lazy(() => import('./pages/ManageProperties'));
const AddProperty = lazy(() => import('./pages/AddProperty'));
const ManagePropertyTypes = lazy(() => import('./pages/ManagePropertyTypes'));
const AddPropertyType = lazy(() => import('./pages/AddPropertyType'));
const ManageServiceProviders = lazy(() => import('./pages/ManageServiceProviders'));
const AddServiceProvider = lazy(() => import('./pages/AddServiceProvider'));
const VendorManagement = lazy(() => import('./pages/VendorManagement'));
const PurchaseRequisition = lazy(() => import('./pages/PurchaseRequisition'));
const PurchaseOrder = lazy(() => import('./pages/PurchaseOrder'));
const GRNManagement = lazy(() => import('./pages/GRNManagement'));
const GateEntryManagement = lazy(() => import('./pages/GateEntryManagement'));
const InvoiceProcessing = lazy(() => import('./pages/InvoiceProcessing'));
const NumberingConfig = lazy(() => import('./pages/NumberingConfig'));
const EntityGstRegistrations = lazy(() => import('./pages/EntityGstRegistrations'));
const EmployeeMaster = lazy(() => import('./pages/EmployeeMaster'));
const PoPrintSettings = lazy(() => import('./pages/PoPrintSettings'));
const ThreeWayMatch = lazy(() => import('./pages/ThreeWayMatch'));
const ApAccountingEntry = lazy(() => import('./pages/ApAccountingEntry'));
const ApManagement = lazy(() => import('./pages/ApManagement'));
const PaymentProcessing = lazy(() => import('./pages/PaymentProcessing'));
const RecordToReport = lazy(() => import('./pages/ar/RecordToReport'));
const ChartOfAccounts = lazy(() => import('./pages/ar/ChartOfAccounts'));
const ArJournalEntry = lazy(() => import('./pages/ar/JournalEntry'));
const ApInvoiceAutomation = lazy(() => import('./pages/ApInvoiceAutomation'));
const ArCustomerInvoices = lazy(() => import('./pages/ArCustomerInvoices'));
const EmailAccountSettings = lazy(() => import('./pages/EmailAccountSettings'));
const ArGeneralLedger = lazy(() => import('./pages/ar/GeneralLedger'));
const ArReconciliations = lazy(() => import('./pages/ar/Reconciliations'));
const ArTrialBalance = lazy(() => import('./pages/ar/TrialBalance'));
const FinancialStatements = lazy(() => import('./pages/ar/FinancialStatements'));
const PeriodClose = lazy(() => import('./pages/ar/PeriodClose'));
const VendorRiskDashboard = lazy(() => import('./pages/VendorRiskDashboard'));
const ArApDashboard = lazy(() => import('./pages/ArApDashboard'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const ERPIntegration = lazy(() => import('./pages/ERPIntegration'));
const DoaMatrixConfig = lazy(() => import('./pages/DoaMatrixConfig'));

const ItemMaster = lazy(() => import('./pages/ItemMaster'));
const ManageMasters = lazy(() => import('./pages/ManageMasters'));
const FeatureToggles = lazy(() => import('./pages/FeatureToggles'));
const ApprovalMatrixPage = lazy(() => import('./pages/ApprovalMatrix'));
const QuotationManagement = lazy(() => import('./pages/QuotationManagement'));
const RfqManagement = lazy(() => import('./pages/RfqManagement'));
const CreateRfq = lazy(() => import('./pages/CreateRfq'));
const RfqDetail = lazy(() => import('./pages/RfqDetail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ClientOnboarding = lazy(() => import('./pages/ClientOnboarding'));
const CompanyManagement = lazy(() => import('./pages/CompanyManagement'));
const ApprovalRequests = lazy(() => import('./pages/ApprovalRequests'));
const SecurityDashboard = lazy(() => import('./pages/SecurityDashboard'));
const MyProfile = lazy(() => import('./pages/MyProfile'));
const VendorChangeApprovals = lazy(() => import('./pages/VendorChangeApprovals'));
const SecuritySettings = lazy(() => import('./pages/SecuritySettings'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const NotificationRecipients = lazy(() => import('./pages/NotificationRecipients'));


// Enterprise Gaps 3-21
const CostCenterManagement = lazy(() => import('./pages/CostCenterManagement'));
const SSOConfiguration = lazy(() => import('./pages/SSOConfiguration'));
const SessionManagement = lazy(() => import('./pages/SessionManagement'));







import ErrorBoundary from './components/ErrorBoundary';

const LoadingModule = () => (
  <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
    <Space orientation="vertical" align="center">
      <Spin size="large" />
      <div style={{ marginTop: 16, color: '#64748b', fontWeight: 500 }}>Opening LedgerLine...</div>
    </Space>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider theme={themeConfig}>
        <Router>
          <Suspense fallback={<LoadingModule />}>
            <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* DiagnosticLogin route removed — security risk (FT-008) */}
          <Route path="/logout" element={<Logout />} />

          {/* After sign-in: choose the company to work in (signed in, no company needed yet) */}
          <Route element={<ProtectedRoute requireWorkspace={false} />}>
            <Route path="/select-company" element={<SelectCompany />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout><Outlet /></MainLayout>}>
                <Route path="/" element={<RoleBasedHome />} />
                <Route path="/dashboard" element={<ArApDashboard />} />
                <Route path="/audit/executive-dashboard" element={<Navigate to="/dashboard" replace />} />
                <Route path="/audit/quick-scan" element={<Navigate to="/audit/smart-scan" replace />} />

              {/* Asset Management */}
              <Route path="/assets/scan" element={<Navigate to="/assets/inward" replace />} />
              {/* Legacy redirects */}
              <Route path="/assets/amc" element={<Navigate to="/maintenance/amc" replace />} />
              <Route path="/assets/issues" element={<Navigate to="/maintenance/issues" replace />} />

              {/* Inventory */}
              <Route path="/inventory/items" element={<ItemMaster />} />

              {/* Audit */}
              <Route path="/audit/scan" element={<Navigate to="/audit/smart-scan" replace />} />

              {/* Reports */}

              {/* Request Management */}
              <Route path="/requests/approvals" element={<ApprovalRequests />} />
              <Route path="/requests/approval-requests" element={<ApprovalRequests />} />

              {/* Procurement */}
              <Route path="/procurement/requisitions" element={<PurchaseRequisition />} />
              <Route path="/procurement/requisition" element={<PurchaseRequisition />} />
              <Route path="/procurement/requisitions/edit/:id" element={<PurchaseRequisition />} />
              <Route path="/procurement/quotations" element={<QuotationManagement />} />
              <Route path="/procurement/rfq" element={<RfqManagement />} />
              <Route path="/procurement/rfq/create" element={<CreateRfq />} />
              <Route path="/procurement/rfq/:id" element={<RfqDetail />} />
              <Route path="/procurement/orders" element={<PurchaseOrder />} />
              <Route path="/procurement/purchase-orders" element={<PurchaseOrder />} />

              <Route path="/procurement/grn" element={<GRNManagement />} />
              <Route path="/procurement/gate-entry" element={<GateEntryManagement />} />
              <Route path="/procurement/invoices" element={<InvoiceProcessing />} />
              <Route path="/finance/three-way-match" element={<ThreeWayMatch />} />
              <Route path="/finance/ap-accounting-entry" element={<ApAccountingEntry />} />
              <Route path="/finance/ap-management" element={<ApManagement />} />
              <Route path="/finance/payment-processing" element={<PaymentProcessing />} />
              <Route path="/finance/ar/record-to-report" element={<RecordToReport />} />
              <Route path="/finance/ar/chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="/finance/ar/journal-entry" element={<ArJournalEntry />} />
              <Route path="/finance/ar/customer-invoices" element={<ArCustomerInvoices />} />
              <Route path="/finance/ap/ai-invoices" element={<ApInvoiceAutomation />} />
              <Route path="/settings/email-account" element={<EmailAccountSettings />} />
              <Route path="/finance/ar/general-ledger" element={<ArGeneralLedger />} />
              <Route path="/finance/ar/reconciliations" element={<ArReconciliations />} />
              <Route path="/finance/ar/trial-balance" element={<ArTrialBalance />} />
              <Route path="/finance/ar/financial-statements" element={<FinancialStatements />} />
              <Route path="/finance/ar/period-close" element={<PeriodClose />} />
              <Route path="/procurement/vendor-risk" element={<VendorRiskDashboard />} />
              <Route path="/settings/numbering" element={<NumberingConfig />} />
              <Route path="/settings/notifications" element={<NotificationRecipients />} />
              <Route path="/masters/entity-gst" element={<EntityGstRegistrations />} />
              <Route path="/masters/employees" element={<EmployeeMaster />} />
              <Route path="/settings/po-print" element={<PoPrintSettings />} />
              <Route path="/security/sso" element={<SSOConfiguration />} />
              <Route path="/security/sessions" element={<SessionManagement />} />
              <Route path="/compliance/cost-centers" element={<CostCenterManagement />} />
              <Route path="/vendor-master" element={<VendorManagement />} />
              <Route path="/procurement/vendors" element={<VendorManagement />} />
              <Route path="/procurement/vendor-approvals" element={<VendorChangeApprovals />} />
              
              {/* Reports */}
              
              {/* My Assets */}
              <Route path="/my-profile" element={<MyProfile />} />
              <Route path="/security-settings" element={<SecuritySettings />} />

              {/* Property Management */}
              <Route path="/property/types" element={<ManagePropertyTypes />} />
              <Route path="/property/manage" element={<ManageProperties />} />
              <Route path="/property/manage/add" element={<AddProperty />} />
              <Route path="/property/manage/edit/:id" element={<AddProperty />} />
              <Route path="/property/locations" element={<ManageLocations />} />
              <Route path="/property/locations/add" element={<AddLocation />} />
              <Route path="/property/locations/edit/:id" element={<AddLocation />} />

              {/* Maintenance */}
              <Route path="/maintenance/service-providers" element={<ManageServiceProviders />} />
              <Route path="/maintenance/service-providers/add" element={<AddServiceProvider />} />
              <Route path="/maintenance/service-providers/edit/:id" element={<AddServiceProvider />} />

              {/* Manage Masters */}
              <Route path="/masters" element={<ManageMasters />} />
              <Route path="/masters/regions" element={<ManageRegions />} />

              <Route path="/masters/regions/add" element={<AddRegion />} />
              <Route path="/masters/regions/edit/:id" element={<AddRegion />} />
              <Route path="/masters/property-types" element={<ManagePropertyTypes />} />
              <Route path="/masters/property-types/add" element={<AddPropertyType />} />
              <Route path="/masters/property-types/edit/:id" element={<AddPropertyType />} />
              <Route path="/masters/departments" element={<ManageDepartments />} />
              <Route path="/masters/departments/add" element={<AddDepartment />} />
              <Route path="/masters/departments/edit/:id" element={<AddDepartment />} />
              <Route path="/masters/sub-departments" element={<ManageSubDepartments />} />
              <Route path="/masters/sub-departments/add" element={<AddSubDepartment />} />
              <Route path="/masters/sub-departments/edit/:id" element={<AddSubDepartment />} />
              <Route path="/masters/service-providers" element={<ManageServiceProviders />} />
              <Route path="/masters/service-providers/add" element={<AddServiceProvider />} />
              <Route path="/masters/service-providers/edit/:id" element={<AddServiceProvider />} />

              {/* System */}
              <Route path="/admin/users" element={<ManageUsers />} />
              <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN']} />}>
                <Route path="/admin/company-access" element={<CompanyAccess />} />
              </Route>
              <Route path="/admin/roles" element={<ManageRoles />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLog />} />
              <Route path="/add-user" element={<AddUser />} />
              <Route path="/add-role" element={<AddRole />} />
              <Route path="/system/settings" element={<GlobalSettings />} />
              {/* Activity log: all authenticated roles — backend scopes by tenant */}

              <Route element={<ProtectedRoute allowedRoles={['PROVIDER_ADMIN', 'DEV_ADMIN', 'ADMIN', 'CLIENT_ADMIN', 'SUPER_ADMIN']} />}>
                <Route path="/system/features" element={<FeatureToggles />} />
              </Route>
              <Route element={<ProtectedRoute allowedRoles={['PROVIDER_ADMIN', 'DEV_ADMIN']} />}>
                <Route path="/system/integration" element={<ERPIntegration />} />
                <Route path="/system/security-dashboard" element={<SecurityDashboard />} />
              </Route>
              <Route path="/system/configuration" element={<FeatureToggles />} />
              <Route path="/settings/doa-matrix" element={<DoaMatrixConfig />} />
              <Route path="/system/approval-matrix" element={<ApprovalMatrixPage />} />
              <Route path="/admin/notifications" element={<NotificationSettings />} />
              <Route path="/procurement/reports" element={<ProcurementReports />} />

              {/* Client Management */}
              <Route element={<ProtectedRoute allowedRoles={['PROVIDER_ADMIN', 'DEV_ADMIN']} />}>
                <Route path="/clients/onboarding" element={<ClientOnboarding />} />
                <Route path="/clients/companies" element={<CompanyManagement />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<RoleBasedHome />} />
        </Routes>
      </Suspense>
    </Router>
    </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
