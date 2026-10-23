import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';

const ProtectedRoute = ({ allowedRoles = [] }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const roleCode = String(user?.role || user?.Role?.code || '').toUpperCase();
  const normalizedAllowedRoles = allowedRoles.map((role) => String(role || '').toUpperCase());
  const isDevAdmin = roleCode === 'DEV_ADMIN';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(roleCode) && !isDevAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
