import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../utils/api';

const clearSessionContext = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('client_name');
  localStorage.removeItem('tenant_name');
};

const enrichUserWithClientName = async (token, user) => {
  if (!token || !user?.id || user.client_name || !user.client_id) return user;
  try {
    const response = await api.get(`/users/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const payload = response?.data?.data || response?.data || {};
    const clientName = payload?.Client?.client_name || payload?.client_name || '';
    if (!clientName) return user;
    return {
      ...user,
      client_name: clientName,
      tenant_name: clientName
    };
  } catch {
    return user;
  }
};

const persistSession = async (token, user) => {
  const enrichedUser = await enrichUserWithClientName(token, user);
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(enrichedUser));
  const clientName = enrichedUser?.client_name || enrichedUser?.tenant_name || enrichedUser?.Client?.client_name || '';
  if (clientName) {
    localStorage.setItem('client_name', clientName);
    localStorage.setItem('tenant_name', clientName);
  } else {
    localStorage.removeItem('client_name');
    localStorage.removeItem('tenant_name');
  }
  return enrichedUser;
};

const getAuthPayload = (response) => {
  const body = response?.data || {};
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') {
    return {
      ...body,
      ...body.data
    };
  }
  return body;
};

const getAuthToken = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  return payload.token || payload.accessToken || payload.access_token || null;
};

export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const payload = getAuthPayload(response);
      const mfaRequired =
        payload?.mfa_required === true ||
        payload?.mfa_required === 'true' ||
        payload?.mfaRequired === true ||
        payload?.mfaRequired === 'true';

      if (mfaRequired) {
        return {
          mfaRequired: true,
          pendingUsername: username,
          mfaSetupRequired: !!(payload?.mfa_setup_required ?? payload?.mfaSetupRequired),
          setupToken: payload?.setup_token || null,
          mfaMethod: payload?.mfa_method || payload?.mfaMethod || 'totp'
        };
      }

      const authToken = getAuthToken(payload);
      if (authToken && payload?.user) {
        const user = await persistSession(authToken, payload.user);
        return {
          mfaRequired: false,
          accessToken: authToken,
          user
        };
      } else {
        return rejectWithValue({
          message: payload?.message || 'Invalid response from server'
        });
      }

    } catch (error) {
      return rejectWithValue(error.response?.data || error);
    }
  }
);

export const verifyMfa = createAsyncThunk(
  'auth/verifyMfa',
  async ({ username, otp }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/mfa/verify', { username, otp });
      const payload = getAuthPayload(response);
      const token = payload?.token;
      const user = payload?.user;

      if (!token || !user) {
        return rejectWithValue({ message: 'Invalid MFA verification response' });
      }

      const enrichedUser = await persistSession(token, user);
      return { accessToken: token, user: enrichedUser };
    } catch (error) {
      return rejectWithValue(error.response?.data || error);
    }
  }
);

export const requestMfaChallenge = createAsyncThunk(
  'auth/requestMfaChallenge',
  async ({ username }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/mfa/challenge', { username });
      const data = getAuthPayload(response);
      return {
        resendCooldownSeconds: Number(data?.resend_cooldown_seconds || 30)
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || error);
    }
  }
);

export const startMfaEnrollment = createAsyncThunk(
  'auth/startMfaEnrollment',
  async ({ setupToken }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/mfa/enroll/start', { setup_token: setupToken });
      const data = getAuthPayload(response);
      return {
        qrCodeDataUrl: data?.qr_code_data_url,
        manualEntryKey: data?.manual_entry_key,
        setupToken: data?.setup_token || setupToken
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || error);
    }
  }
);

export const completeMfaEnrollment = createAsyncThunk(
  'auth/completeMfaEnrollment',
  async ({ setupToken, otp }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/mfa/enroll/complete', { setup_token: setupToken, otp });
      const data = getAuthPayload(response);
      const token = data?.token;
      const user = data?.user;
      if (!token || !user) return rejectWithValue({ message: 'Invalid enrollment response' });
      const enrichedUser = await persistSession(token, user);
      return { accessToken: token, user: enrichedUser };
    } catch (error) {
      return rejectWithValue(error.response?.data || error);
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async () => {
    try {
      await api.post('/auth/logout');
      clearSessionContext();
      return null;
    } catch {
      clearSessionContext();
      return null;
    }
  }
);

const initialState = {
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  mfaRequired: false,
  pendingUsername: null,
  mfaSetupRequired: false,
  setupToken: null,
  mfaMethod: 'totp',
  qrCodeDataUrl: null,
  manualEntryKey: null,
  resendCooldownSeconds: 30,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // A new session for another company (company picker) or a renewed one.
    sessionChanged: (state, action) => {
      state.token = action.payload?.token || state.token;
      state.user = action.payload?.user || state.user;
      state.isAuthenticated = Boolean(state.token);
    },
    clearMfaState: (state) => {
      state.mfaRequired = false;
      state.pendingUsername = null;
      state.mfaSetupRequired = false;
      state.setupToken = null;
      state.qrCodeDataUrl = null;
      state.manualEntryKey = null;
      state.resendCooldownSeconds = 30;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.mfaRequired = !!action.payload?.mfaRequired;
        state.pendingUsername = action.payload?.pendingUsername || null;
        state.mfaSetupRequired = !!action.payload?.mfaSetupRequired;
        state.setupToken = action.payload?.setupToken || null;
        state.mfaMethod = action.payload?.mfaMethod || 'totp';

        if (!action.payload?.mfaRequired) {
          state.isAuthenticated = true;
          state.user = action.payload.user;
          state.token = action.payload.accessToken;
        } else {
          state.isAuthenticated = false;
          state.user = null;
          state.token = null;
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Login failed';
      })
      .addCase(verifyMfa.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyMfa.fulfilled, (state, action) => {
        state.loading = false;
        state.mfaRequired = false;
        state.pendingUsername = null;
        state.mfaSetupRequired = false;
        state.setupToken = null;
        state.qrCodeDataUrl = null;
        state.manualEntryKey = null;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.accessToken;
      })
      .addCase(verifyMfa.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'MFA verification failed';
      })
      .addCase(requestMfaChallenge.fulfilled, (state, action) => {
        state.resendCooldownSeconds = action.payload?.resendCooldownSeconds || 30;
      })
      .addCase(startMfaEnrollment.fulfilled, (state, action) => {
        state.qrCodeDataUrl = action.payload?.qrCodeDataUrl || null;
        state.manualEntryKey = action.payload?.manualEntryKey || null;
        state.setupToken = action.payload?.setupToken || state.setupToken;
      })
      .addCase(completeMfaEnrollment.fulfilled, (state, action) => {
        state.loading = false;
        state.mfaRequired = false;
        state.pendingUsername = null;
        state.mfaSetupRequired = false;
        state.setupToken = null;
        state.qrCodeDataUrl = null;
        state.manualEntryKey = null;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = action.payload.accessToken;
      })
      .addCase(completeMfaEnrollment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'MFA enrollment failed';
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.mfaRequired = false;
        state.pendingUsername = null;
        state.mfaSetupRequired = false;
        state.setupToken = null;
        state.qrCodeDataUrl = null;
        state.manualEntryKey = null;
        state.resendCooldownSeconds = 30;
      });
  },
});

export const { clearError, clearMfaState, sessionChanged } = authSlice.actions;
export default authSlice.reducer;
