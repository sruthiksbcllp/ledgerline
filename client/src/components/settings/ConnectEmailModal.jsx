import React from 'react';
import { Modal } from 'antd';
import EmailAccountPanel from './EmailAccountPanel';

/** "Connect your mailbox" prompt shown when someone tries to send without one. */
const ConnectEmailModal = ({ open, onClose, onConnected, withRead = false }) => (
  <Modal open={open} onCancel={onClose} footer={null} title="Connect your email account" width={760} destroyOnClose>
    <EmailAccountPanel
      returnTo={window.location.pathname}
      withRead={withRead}
      onChange={(account) => { if (account) { onConnected?.(account); onClose(); } }}
    />
  </Modal>
);

export default ConnectEmailModal;
