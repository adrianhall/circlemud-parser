import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/cli.ts', '**/*.d.ts'],
      include: ['src/**/*.ts', 'src/cli/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
    },
    environment: 'node',
  },
});
