import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { makeStore } from '../../test/utils';

function renderGuard({ authed, allowedRoles = [], userRole, entry = '/secret' }) {
  if (userRole) localStorage.setItem('user', JSON.stringify({ role: userRole }));
  const store = makeStore({ auth: { isAuthenticated: authed } });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/" element={<div>HOME</div>} />
          <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
            <Route path="/secret" element={<div>SECRET CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => localStorage.clear());

  it('redirects an unauthenticated user to /login', () => {
    renderGuard({ authed: false });
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
  });
  it('renders the protected outlet when authenticated and no role restriction', () => {
    renderGuard({ authed: true });
    expect(screen.getByText('SECRET CONTENT')).toBeInTheDocument();
  });
  it('grants access when the user role is in allowedRoles', () => {
    renderGuard({ authed: true, allowedRoles: ['FINANCE'], userRole: 'FINANCE' });
    expect(screen.getByText('SECRET CONTENT')).toBeInTheDocument();
  });
  it('redirects to / when the role is not allowed', () => {
    renderGuard({ authed: true, allowedRoles: ['FINANCE'], userRole: 'PROCUREMENT' });
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument();
  });
  it('DEV_ADMIN bypasses role restrictions', () => {
    renderGuard({ authed: true, allowedRoles: ['FINANCE'], userRole: 'DEV_ADMIN' });
    expect(screen.getByText('SECRET CONTENT')).toBeInTheDocument();
  });
});
