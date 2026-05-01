import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so built assets resolve under whatever path the
  // concord instance serves the extension at (e.g. /ext/<id>/).
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
