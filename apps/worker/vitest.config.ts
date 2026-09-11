import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globals: false,
    root: './',
  },
  // Nest's DI relies on emitDecoratorMetadata, which esbuild (Vitest's default
  // transformer) does not emit. SWC does.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
