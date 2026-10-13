import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../store/authSlice';

// Fresh store per test so state never leaks between cases.
// Only the auth slice is needed by the guard + login flow; add more here if a
// component under test reads another slice.
export function makeStore(preloadedState) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState,
  });
}

export function renderWithProviders(
  ui,
  { store = makeStore(), route = '/', routerProps = {} } = {}
) {
  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]} {...routerProps}>
          {children}
        </MemoryRouter>
      </Provider>
    );
  }
  return { store, ...render(ui, { wrapper: Wrapper }) };
}
