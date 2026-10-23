import React from 'react';
import { Button } from 'antd';
import styled from 'styled-components';

const StyledButton = styled(Button)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);

  &.ant-btn-primary {
    background: #0B1F3A;
    border-color: #0B1F3A;
    
    &:hover {
      background: #1E3A5F !important;
      border-color: #1E3A5F !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    
    &:active {
      transform: translateY(0);
    }
  }

  &.ant-btn-default {
    border-color: #e2e8f0;
    color: #475569;
    
    &:hover {
      color: #0B1F3A !important;
      border-color: #0B1F3A !important;
    }
  }
`;

const BaseButton = ({ children, icon, ...props }) => {
  return (
    <StyledButton icon={icon} {...props}>
      {children}
    </StyledButton>
  );
};

export default BaseButton;
