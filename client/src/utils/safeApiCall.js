/**
 * Global Safe API Wrapper
 * Catches all network/application errors and returns safe fallbacks.
 */
import { handleResponse } from './apiClient';

export const safeApiCall = async (apiCall) => {
  try {
    const res = await apiCall();
    return handleResponse(res);
  } catch (error) {
    // Error surfaced via message.error in each call site; no console leak
    return [];
  }
};
