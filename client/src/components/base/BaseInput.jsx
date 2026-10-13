import React from 'react';
import { Input } from 'antd';
import styled from 'styled-components';

const StyledInput = styled(Input)`
  border-color: #e2e8f0;
  padding: 10px 16px;
  font-size: 14px;
  transition: all 0.2s ease;

  &:hover {
    border-color: #1E3A5F;
  }

  &:focus, &.ant-input-focused {
    border-color: #0B1F3A;
    box-shadow: 0 0 0 2px rgba(11, 31, 58, 0.1);
  }

  &.ant-input-status-error {
    border-color: #ef4444;
    &:focus { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1); }
  }

  .ant-input-prefix {
    margin-right: 12px;
    color: #94a3b8;
  }
`;

const BaseInput = (props) => {
  return <StyledInput {...props} />;
};

BaseInput.Password = (props) => {
  return <StyledInput.Password {...props} />;
};

export default BaseInput;
