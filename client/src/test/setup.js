import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom lacks these APIs that Ant Design v6 touches at render time.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver || ResizeObserver;
global.ResizeObserver = global.ResizeObserver || ResizeObserver;

if (!window.scrollTo) window.scrollTo = vi.fn();

// Silence antd's "not wrapped in act" style noise from async popups if it appears.
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
