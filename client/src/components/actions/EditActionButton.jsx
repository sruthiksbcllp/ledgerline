import React from 'react';
import { Button } from 'antd';
import { Edit2 } from 'lucide-react';

const EditActionButton = ({ onClick, size = 'small' }) => (
  <Button
    type="primary"
    size={size}
    icon={<Edit2 size={14} />}
    onClick={onClick}
    style={{ backgroundColor: '#1d3557' }}
  >
    Edit
  </Button>
);

export default EditActionButton;
