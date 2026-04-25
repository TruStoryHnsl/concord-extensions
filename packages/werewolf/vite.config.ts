import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so built assets resolve under whatever path the
  // concord instance serves the extension at (e.g. /ext/<id>/). Without
  // this, index.html references /assets/foo.js which collides with the
  // concord app's own assets.
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
