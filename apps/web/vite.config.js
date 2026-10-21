import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The desktop (Electron) build loads the bundle over file://, so assets must
// be referenced relatively and the router switches to hash history.
const isDesktop = process.env.VITE_DESKTOP === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: isDesktop ? './' : '/',
  plugins: [
    react({
      fastRefresh: true,
    }),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: true,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
})
