import { message } from 'antd';

/**
 * Standard wrapper for API calls to ensure consistent error handling and loading states.
 * @param {Function} fn - The async function to execute (usually an api.get/post/put/delete call)
 * @param {Object} options - Optional callbacks for loading and success
 */
export const safeApiCall = async (fn, options = {}) => {
  const { setLoading, onSuccess, onError, successMsg } = options;
  
  if (setLoading) setLoading(true);
  try {
    const response = await fn();

    // Support both axios response shape ({ data, status }) and direct payload shape.
    const payload = response?.data ?? response;
    const isSuccess =
      !!payload &&
      (
        payload.success === true ||
        payload.status === 'success' ||
        !Object.prototype.hasOwnProperty.call(payload, 'success')
      );

    if (isSuccess) {
      if (successMsg) message.success(successMsg);
      if (onSuccess) onSuccess(payload?.data ?? payload);
      return payload?.data ?? payload;
    } else {
      const errorMsg = payload?.message || 'Action failed';
      message.error(errorMsg);
      if (onError) onError(errorMsg);
      return null;
    }
  } catch (err) {
    // Error surfaced via message.error below; no console leak
    const errorMsg = err?.response?.data?.message || err?.message || 'Something went wrong';
    message.error(errorMsg);
    if (onError) onError(errorMsg);
    return null;
  } finally {
    if (setLoading) setLoading(false);
  }
};
