import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../utils/api';

import { normalizeResponse } from '../utils/apiNormalizer';

export const fetchAssets = createAsyncThunk('assets/fetchAll', async () => {
  const res = await api.get('/assets');
  return normalizeResponse(res);
});

const assetSlice = createSlice({
  name: 'assets',
  initialState: {
    items: [],
    loading: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAssets.pending, (state) => { state.loading = true; })
      .addCase(fetchAssets.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload || [];
      })
      .addCase(fetchAssets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  }
});

export default assetSlice.reducer;
