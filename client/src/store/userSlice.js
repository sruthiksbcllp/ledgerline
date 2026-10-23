import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../utils/api';

export const fetchUsers = createAsyncThunk('users/fetchUsers', async (status, { rejectWithValue }) => {
  try {
    const response = await api.get('/users', { params: status ? { status } : {} });
    return response;
  } catch (error) {
    return rejectWithValue(error.response?.data || 'Failed to fetch users');
  }
});

export const addUser = createAsyncThunk('users/addUser', async (userData, { rejectWithValue }) => {
  try {
    const response = await api.post('/users', userData);
    return response;
  } catch (error) {
    return rejectWithValue(error.response?.data || 'Failed to add user');
  }
});

const userSlice = createSlice({
  name: 'users',
  initialState: { items: [], loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => { state.loading = true; })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        // The thunk returns the full axios response. The /users endpoint wraps
        // its result via responseHandler.success → { success: true, data: [...] }.
        // axios body lives on response.data, so the user array is at
        // action.payload.data.data. The previous code stored the wrapper
        // object, so <Table dataSource={users}> crashed in AntD's slice/length
        // calls and triggered the global ErrorBoundary on /admin/users.
        const body = action.payload?.data;
        state.items = Array.isArray(body?.data)
          ? body.data
          : (Array.isArray(body) ? body : []);
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export default userSlice.reducer;
