import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { scopeSystems } from './scripts/scope-css'

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

// base './' keeps asset URLs relative, so the same build works on
// neatteam1943.github.io/<repo>/ and inside the preview artifact.
export default defineConfig({
  base: './',
  plugins: [react()],
  css: { postcss: { plugins: [scopeSystems()] } },
  resolve: {
    alias: [
      { find: '@neatsystem/kit', replacement: src('kit/index.ts') },
      { find: '@', replacement: src('') },
    ],
    // A sub-system checkout may have its own node_modules; there must still be
    // exactly one React / router in the page, NeatSystem's.
    dedupe: ['react', 'react-dom', 'react-router-dom', 'lucide-react', '@supabase/supabase-js'],
  },
  // sub-systems run their own tests (npm run test:systems)
  test: { environment: 'jsdom', globals: true, exclude: [...configDefaults.exclude, 'systems/**'] },
})
