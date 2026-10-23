import React from 'react';
import { Card, Row, Col, Space } from 'antd';

const PageHeader = ({ title, subtitle, actions, icon }) => {
  let iconEl = null;
  if (icon) {
    if (React.isValidElement(icon)) {
      iconEl = icon;
    } else if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null)) {
      const Icon = icon;
      iconEl = <Icon size={24} />;
    }
  }

  return (
    <Card style={{ borderRadius: 16, marginBottom: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-premium)' }} styles={{ body: { padding: '20px' } }}>
      <Row justify="space-between" align="middle" gutter={[16, 16]}>
        <Col>
          <Space size={16} align="center">
            {iconEl && <div className="page-header-icon">{iconEl}</div>}
            <div>
              <h2 className="page-header-title">{title}</h2>
              {subtitle && <p className="page-header-sub">{subtitle}</p>}
            </div>
          </Space>
        </Col>
        {actions && <Col>{actions}</Col>}
      </Row>
    </Card>
  );
};

export default PageHeader;
