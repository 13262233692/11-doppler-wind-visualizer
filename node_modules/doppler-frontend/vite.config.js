import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/workers/marchingCubesWorker.js',
          dest: 'workers',
        },
      ],
    }),
  ],
  worker: {
    format: 'es',
  },
});
