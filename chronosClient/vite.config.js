import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

// Load env file from project root
const rootEnvPath = resolve(__dirname, '../.env')
if (fs.existsSync(rootEnvPath)) {
  console.log('Loading env from project root:', rootEnvPath)
  dotenv.config({ path: rootEnvPath })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Specify that base path is the current directory
  base: './',
  // Configure server for Electron development
  server: {
    port: 5173,
    strictPort: true,
  },
  // Configure build options
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Ensure assets are referenced correctly
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  // Resolve paths
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
