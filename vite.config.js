import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    // The remaining ~880 kB chunk is the shared, dynamically loaded Three.js runtime.
    // The initial entry is kept below 250 kB raw after route-level splitting.
    chunkSizeWarningLimit: 900,
  },
})
