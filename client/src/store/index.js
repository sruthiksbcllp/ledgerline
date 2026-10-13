import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import assetReducer from './assetSlice';
import masterReducer from './masterSlice';
import userReducer from './userSlice';
import roleReducer from './roleSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    assets: assetReducer,
    masters: masterReducer,
    users: userReducer,
    roles: roleReducer
  }
});

export default store;
