import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative base + hash routing: the site works under any repo name or a custom
// domain on GitHub Pages without server config.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { sourcemap: false },
  test: {
    include: ['src/**/*.test.ts', 'apps-script/**/*.test.ts'],
    exclude: ['src/lib/known-values.test.ts'],
    environment: 'node',
  },
});
