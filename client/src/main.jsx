import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import './index.css'
import App from './App.jsx'

// Global number formatting normalization:
// Any Number.toLocaleString() call without an explicit locale will default to en-IN.
const originalNumberToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function patchedToLocaleString(locales, options) {
  if (locales === undefined || locales === null || locales === 'default') {
    return originalNumberToLocaleString.call(this, 'en-IN', options);
  }
  return originalNumberToLocaleString.call(this, locales, options);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
