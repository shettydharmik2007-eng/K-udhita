import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ['k-udhita.onrender.com', '.k-udhita.onrender.com'],
  },
  server: {
    allowedHosts: ['k-udhita.onrender.com', '.k-udhita.onrender.com'],
  },
})
