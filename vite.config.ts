import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const alias = Object.fromEntries(
  ['app', 'layout', 'pages', 'components', 'permissions', 'navigation', 'shared', 'mock', 'lib', 'styles'].map((k) => [
    `@/${k}`,
    path.resolve(__dirname, `src/${k}`),
  ]),
)

// Set VITE_BASE_PATH (e.g. /admin/) at build time if the app is not served from the domain root.
export default defineConfig({ base: process.env.VITE_BASE_PATH ?? '/', plugins: [react()], resolve: { alias }, server: { port: 5180 }, build: { chunkSizeWarningLimit: 2000 } })
