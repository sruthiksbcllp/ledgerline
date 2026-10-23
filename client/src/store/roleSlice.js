import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../utils/api';

export const fetchRoles = createAsyncThunk('roles/fetchRoles', async (_, { rejectWithValue }) => {
  try {
    const response = await api.get('/roles');
    return response;
  } catch (error) {
    return rejectWithValue(error.response?.data || 'Failed to fetch roles');
  }
});

export const addRole = createAsyncThunk('roles/addRole', async (roleData, { rejectWithValue }) => {
  try {
    const response = await api.post('/roles', roleData);
    return response;
  } catch (error) {
    return rejectWithValue(error.response?.data || 'Failed to add role');
  }
});

const roleSlice = createSlice({
  name: 'roles',
  initialState: { items: [], loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoles.pending, (state) => { state.loading = true; })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.loading = false;
        // /roles wraps the array as { success, data: [...] } via responseHandler.
        // axios body lives on response.data, so the user array is at
        // action.payload.data.data. Storing the wrapper object would crash any
        // <Table dataSource={items}> via AntD slice/length calls.
        const body = action.payload?.data;
        state.items = Array.isArray(body?.data)
          ? body.data
          : (Array.isArray(body) ? body : []);
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export default roleSlice.reducer;
