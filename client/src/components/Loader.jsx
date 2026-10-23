import React from 'react';
import { Spin, Space, Typography } from "antd";

const { Text } = Typography;

export default function Loader({ message = "Loading data...", size = "large" }) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: '60px 20px',
      minHeight: '200px',
      width: '100%',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <Spin size={size} />
      {message && <Text type="secondary" style={{ fontSize: '14px', fontWeight: 500 }}>{message}</Text>}
    </div>
  );
}
