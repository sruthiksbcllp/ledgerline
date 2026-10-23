import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../utils/api';
import { normalizeResponse } from '../utils/apiNormalizer';

export const fetchCategories = createAsyncThunk('masters/fetchCategories', async () => {
  const res = await api.get('/masters/categories');
  return normalizeResponse(res);
});

export const fetchRegions = createAsyncThunk('masters/fetchRegions', async () => {
  const res = await api.get('/masters/regions');
  return normalizeResponse(res);
});

export const fetchDepartments = createAsyncThunk('masters/fetchDepartments', async () => {
  const res = await api.get('/masters/departments');
  return normalizeResponse(res);
});

export const fetchSubDepartments = createAsyncThunk('masters/fetchSubDepartments', async () => {
  const res = await api.get('/masters/sub-departments');
  return normalizeResponse(res);
});

export const fetchLocations = createAsyncThunk('masters/fetchLocations', async () => {
  const res = await api.get('/masters/locations');
  return normalizeResponse(res);
});

export const fetchStatuses = createAsyncThunk('masters/fetchStatuses', async () => {
  const res = await api.get('/masters/asset-statuses');
  return normalizeResponse(res);
});

const masterSlice = createSlice({
  name: 'masters',
  initialState: {
    categories: [],
    regions: [],
    departments: [],
    subDepartments: [],
    locations: [],
    statuses: [],
    loading: false,
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload || [];
      })
      .addCase(fetchRegions.fulfilled, (state, action) => {
        state.regions = action.payload || [];
      })
      .addCase(fetchDepartments.fulfilled, (state, action) => {
        state.departments = action.payload || [];
      })
      .addCase(fetchSubDepartments.fulfilled, (state, action) => {
        state.subDepartments = action.payload || [];
      })
      .addCase(fetchLocations.fulfilled, (state, action) => {
        state.locations = action.payload || [];
      })
      .addCase(fetchStatuses.fulfilled, (state, action) => {
        state.statuses = action.payload || [];
      });
  }
});

export default masterSlice.reducer;
