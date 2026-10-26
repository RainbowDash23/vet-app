import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'forks',
    globals: true,
    testTimeout: 15000,
    include: ['test/ui/**/*.{spec,test}.{ts,tsx}'],
    setupFiles: ['./test/ui/setup.ts'],
  },
});
