import React from 'react';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

const AccessDenied = () => {
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="Access denied"
      subTitle="Your role does not include this page. Ask an administrator if you need access."
      extra={<Button type="primary" onClick={() => navigate('/dashboard')}>Back to dashboard</Button>}
    />
  );
};

export default AccessDenied;
