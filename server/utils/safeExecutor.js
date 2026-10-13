/**
 * Enterprise Safe Execution Wrapper
 * Prevents non-critical background tasks from crashing the main request flow.
 */
const safeExecute = async (fn, fallback = null) => {
  try {
    return await fn();
  } catch (err) {
    console.error("SAFE_EXECUTION_ERROR:", err.message);
    // Log trace for debugging but don't rethrow
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }
    return fallback; 
  }
};

module.exports = safeExecute;
