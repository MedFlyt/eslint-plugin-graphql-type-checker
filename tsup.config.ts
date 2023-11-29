import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/rules.ts'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  minify: true,
  external: ['typescript', 'eslint', '@typescript-eslint/*'],
})
