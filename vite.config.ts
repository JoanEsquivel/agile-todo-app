/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/agile-todo-app/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // CSS is stubbed by default (test.css.include defaults to []) so that
    // *.module.css imports resolve to a cheap proxy instead of paying for a
    // real CSS transform. tokens.css is the one exception: tokens.test.ts
    // reads its actual custom-property values via `?raw` to enforce
    // contrast, so it alone opts into real processing.
    css: { include: [/tokens\.css/] },
  },
}));
