import React from 'react';
import { Button } from 'antd';
import { Trash2 } from 'lucide-react';

const DeleteActionButton = ({ onClick, size = 'small' }) => (
  <Button
    type="primary"
    danger
    size={size}
    icon={<Trash2 size={14} />}
    onClick={onClick}
  >
    Delete
  </Button>
);

export default DeleteActionButton;
