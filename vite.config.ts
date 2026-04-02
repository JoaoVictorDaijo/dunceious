import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        environment: 'node',
        // Exclude *.bench.ts files from the default `npm test` run so that
        // benchmarks don't make CI non-deterministic.  Run them with
        // `npm run perf` instead (see package.json).
        // Also exclude benchmark/ directory (*.bench.test.ts) – run those
        // with `npm run bench` instead.
        exclude: ['**/*.bench.ts', 'benchmark/**', '**/node_modules/**'],
      },
    };
});