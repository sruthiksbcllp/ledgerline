import React from 'react';
import ArApDashboard from './ArApDashboard';
import WorkspaceHome from './WorkspaceHome';
import { canSee, getStoredUser } from '../utils/session';

/** Finance roles get the AR / AP dashboard (only their sides); everyone else gets their own workspace. */
const Dashboard = () => {
  const user = getStoredUser();
  return canSee(user, 'INVOICE') || canSee(user, 'AR') ? <ArApDashboard /> : <WorkspaceHome />;
};

export default Dashboard;
