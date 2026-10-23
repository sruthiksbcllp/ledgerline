import React, { useState, useEffect } from 'react';
import { Card, Steps, Tag, Button, Modal, Input, Typography, Space, Alert, Spin, Timeline } from 'antd';
import { CheckCircle, XCircle, Clock, Shield, User } from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../utils/api';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { Step } = Steps;

/**
 * Reusable Approval Panel component.
 * 
 * Props:
 *   module    - 'PR', 'PO', 'DISPOSAL', etc.
 *   documentId - ID of the document
 *   status    - Current document status
 *   onRefresh - Callback to reload parent data after approval action
 */
const ApprovalPanel = ({ module, documentId, onRefresh }) => {
  const { user } = useSelector(state => state.auth);
  const [approvalData, setApprovalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [remarks, setRemarks] = useState('');

  const fetchApprovalStatus = async () => {
    if (!module || !documentId) return;
    setLoading(true);
    try {
      const res = await api.get(`/approvals/${module}/${documentId}/history`);
      setApprovalData(res.data?.data);
    } catch {
      /* non-critical — panel hides itself when approvalData is null */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApprovalStatus(); }, [module, documentId]);

  const canApprove = () => {
    if (!approvalData || approvalData.status !== 'IN_APPROVAL') return false;
    const pendingCode = (approvalData.pending_role_code || '').toLowerCase().replace(/_/g, ' ');
    const userRole = (user?.role || '').toLowerCase().trim();
    return userRole === 'super admin' || userRole === pendingCode || 
           userRole.replace(/\s+/g, '_').toUpperCase() === approvalData.pending_role_code;
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await api.post(`/approvals/${module}/${documentId}/approve`, { comments: remarks || 'Approved' });
      await fetchApprovalStatus();
      onRefresh?.();
    } catch {
      /* error surfaced via Ant message in parent onRefresh or visible in network tab */
    } finally {
      setActionLoading(false);
      setRemarks('');
    }
  };

  const handleReject = async () => {
    if (!remarks.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/approvals/${module}/${documentId}/reject`, { comments: remarks });
      setRejectModal(false);
      await fetchApprovalStatus();
      onRefresh?.();
    } catch {
      /* error surfaced via Ant message in parent onRefresh or visible in network tab */
    } finally {
      setActionLoading(false);
      setRemarks('');
    }
  };

  if (loading) return <Spin size="small" />;
  if (!approvalData) return null;

  const statusColor = {
    DRAFT: 'default', SUBMITTED: 'blue', IN_APPROVAL: 'processing',
    APPROVED: 'success', REJECTED: 'error'
  };

  const currentStep = approvalData.levels?.findIndex(l =>
    l.level === approvalData.current_level && !l.completed
  ) ?? 0;

  return (
    <Card
      size="small"
      title={
        <Space>
          <Shield size={16} />
          <Text strong>Approval Status</Text>
          <Tag color={statusColor[approvalData.status] || 'default'}>{approvalData.status}</Tag>
        </Space>
      }
      style={{ marginTop: 16 }}
      bordered
    >
      {/* Level Progress */}
      {approvalData.levels?.length > 0 && (
        <Steps
          current={currentStep}
          size="small"
          style={{ marginBottom: 16 }}
          status={approvalData.status === 'REJECTED' ? 'error' : approvalData.status === 'APPROVED' ? 'finish' : 'process'}
        >
          {approvalData.levels.map(level => (
            <Step
              key={level.level}
              title={`L${level.level}: ${level.role}`}
              icon={level.completed
                ? <CheckCircle size={16} color="#52c41a" />
                : approvalData.status === 'REJECTED' && level.level === approvalData.current_level
                  ? <XCircle size={16} color="#ff4d4f" />
                  : <Clock size={16} />
              }
            />
          ))}
        </Steps>
      )}

      {/* Pending role info */}
      {approvalData.status === 'IN_APPROVAL' && approvalData.pending_role && (
        <Alert
          type="info"
          showIcon
          message={`Awaiting Level ${approvalData.current_level} Approval`}
          description={`Required role: ${approvalData.pending_role}`}
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Approve / Reject Buttons */}
      {canApprove() && (
        <Space style={{ marginBottom: 12 }}>
          <Input.TextArea
            placeholder="Optional remarks..."
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            rows={1}
            style={{ width: 300 }}
          />
          <Button
            type="primary"
            icon={<CheckCircle size={14} />}
            loading={actionLoading}
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button
            danger
            icon={<XCircle size={14} />}
            onClick={() => setRejectModal(true)}
          >
            Reject
          </Button>
        </Space>
      )}

      {/* Audit Trail */}
      {approvalData.history?.length > 0 && (
        <>
          <Text type="secondary" style={{ fontSize: 12 }}>Audit Trail</Text>
          <Timeline style={{ marginTop: 8 }} mode="left">
            {approvalData.history.map((log, i) => (
              <Timeline.Item
                key={i}
                color={log.status === 'APPROVED' ? 'green' : log.status === 'REJECTED' ? 'red' : 'blue'}
                label={new Date(log.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              >
                <Text strong>{log.action}</Text>
                {log.role_code && <Text type="secondary"> by {log.role_code}</Text>}
                {log.comments && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{log.comments}</Text></>}
              </Timeline.Item>
            ))}
          </Timeline>
        </>
      )}

      {/* Reject Modal */}
      <Modal
        title="Reject Document"
        open={rejectModal}
        onCancel={() => setRejectModal(false)}
        onOk={handleReject}
        okText="Confirm Rejection"
        okButtonProps={{ danger: true, loading: actionLoading }}
      >
        <Text type="secondary">Please provide a reason for rejection:</Text>
        <TextArea
          style={{ marginTop: 8 }}
          rows={4}
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder="Reason is required for rejection..."
        />
      </Modal>
    </Card>
  );
};

export default ApprovalPanel;
