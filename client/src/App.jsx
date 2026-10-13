import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import './App.css';

// Role-based home redirect — sends each role to their most relevant dashboard
const RoleBasedHome = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = String(user?.role || user?.Role?.code || '').toUpperCase();
  if (role === 'PROVIDER_ADMIN' || role === 'DEV_ADMIN') return <Navigate to="/audit/executive-dashboard" replace />;
  if (role === 'AUDITOR') return <Navigate to="/audit/executive-dashboard" replace />;
  if (role === 'FINANCE' || role === 'PROCUREMENT') return <Navigate to="/audit/executive-dashboard" replace />;
  // CLIENT_ADMIN, SUPER_ADMIN, ADMIN and everyone else → Executive Dashboard
  return <Navigate to="/audit/executive-dashboard" replace />;
};
import { ConfigProvider, Spin, Space } from 'antd';
import { themeConfig } from './theme/themeConfig';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
// Lazy Load Pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const ManageUsers = lazy(() => import('./pages/ManageUsers'));
const AddUser = lazy(() => import('./pages/AddUser'));
const ManageRoles = lazy(() => import('./pages/ManageRoles'));
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
const VendorRiskDashboard = lazy(() => import('./pages/VendorRiskDashboard'));
import ExecutiveDashboard from './pages/ExecutiveDashboard';
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
      <div style={{ marginTop: 16, color: '#64748b', fontWeight: 500 }}>Initializing SBC FIXTAG Module...</div>
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

          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout><Outlet /></MainLayout>}>
                <Route path="/" element={<RoleBasedHome />} />
                <Route path="/audit/executive-dashboard" element={<ExecutiveDashboard />} />
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
              <Route path="/procurement/vendor-risk" element={<VendorRiskDashboard />} />
              <Route path="/settings/numbering" element={<NumberingConfig />} />
              <Route path="/settings/notifications" element={<NotificationRecipients />} />
              <Route path="/masters/entity-gst" element={<EntityGstRegistrations />} />
              <Route path="/masters/employees" element={<EmployeeMaster />} />
              <Route path="/settings/po-print" element={<PoPrintSettings />} />
              <Route path="/security/sso" element={<SSOConfiguration />} />
              <Route path="/security/sessions" element={<SessionManagement />} />
              <Route path="/compliance/cost-centers" element={<CostCenterManagement />} />
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
              <Route path="/admin/roles" element={<ManageRoles />} />
              <Route path="/add-user" element={<AddUser />} />
              <Route path="/add-role" element={<AddRole />} />
              <Route path="/system/settings" element={<GlobalSettings />} />
              {/* Activity log: all authenticated roles — backend scopes by tenant */}

              <Route element={<ProtectedRoute allowedRoles={['PROVIDER_ADMIN', 'DEV_ADMIN']} />}>
                <Route path="/system/features" element={<FeatureToggles />} />
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
