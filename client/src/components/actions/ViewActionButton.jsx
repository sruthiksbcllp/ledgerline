import React from 'react';
import { Button } from 'antd';
import { Eye } from 'lucide-react';

const ViewActionButton = ({ onClick, size = 'small' }) => (
  <Button
    type="primary"
    size={size}
    icon={<Eye size={14} />}
    onClick={onClick}
    style={{ backgroundColor: '#1d3557' }}
  >
    View
  </Button>
);

export default ViewActionButton;
