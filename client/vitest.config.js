import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dedicated Vitest config (kept separate from vite.config.js so the app build is untouched).
export default defineConfig({
  plugins: [react()],
  esbuild: { jsxInject: "import React from 'react'" },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // classic JSX runtime fallback so test files don't each need `import React`.

    include: ['src/**/*.{test,spec}.{js,jsx}'],
    clearMocks: true,
    restoreMocks: true,
  },
});
