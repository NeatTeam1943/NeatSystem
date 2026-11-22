import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { scopeFeatures } from './scripts/scope-css'

// base './' keeps asset URLs relative, so the same build works on
// neatteam1943.github.io/<repo>/ and inside the preview artifact.
export default defineConfig({
  base: './',
  plugins: [react()],
  css: { postcss: { plugins: [scopeFeatures()] } },
  resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  test: { environment: 'jsdom', globals: true },
})
