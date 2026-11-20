import { defineConfig } from 'vitest/config';

// One-off acceptance check against real Sheet data (see README, "Known values").
export default defineConfig({
  test: { include: ['src/lib/known-values.test.ts'], environment: 'node' },
});
