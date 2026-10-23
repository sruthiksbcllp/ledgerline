import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the network at the axios-instance boundary (relative to THIS file).
const post = vi.fn();
const get = vi.fn();
vi.mock('../../utils/api', () => ({
  default: { post: (...a) => post(...a), get: (...a) => get(...a) },
  safeApiCall: vi.fn(),
}));

import Login from '../../pages/Login';
import ProtectedRoute from '../../components/ProtectedRoute';
import { makeStore } from '../utils';

function Dashboard() {
  return <div>DASHBOARD</div>;
}

function renderApp(store) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('Happy-path login flow: form -> auth thunk -> store -> guarded dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
    get.mockReset();
    // /auth/login returns a token + user (no MFA)
    post.mockImplementation((url) => {
      if (url === '/auth/login') {
        return Promise.resolve({ data: { token: 'jwt-123', user: { id: 1, username: 'neo_admin', role: 'CLIENT_ADMIN' } } });
      }
      return Promise.resolve({ data: {} });
    });
    // enrichment call inside persistSession
    get.mockResolvedValue({ data: { Client: { client_name: 'the client UAT' } } });
  });

  it('logs in and lands on the protected dashboard, persisting the token', async () => {
    const user = userEvent.setup();
    const store = makeStore({ auth: { isAuthenticated: false, user: null, token: null } });
    renderApp(store);

    // Login form is shown, dashboard is not
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Enter your username'), 'neo_admin');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'secret123');
    await user.click(screen.getByRole('button', { name: /continue to dashboard/i }));

    // Auth thunk called the login endpoint with the typed credentials
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login', { username: 'neo_admin', password: 'secret123' })
    );

    // Store flipped authenticated + token persisted + navigated to the guarded dashboard
    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(true));
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
    expect(localStorage.getItem('token')).toBe('jwt-123');
  });
});
