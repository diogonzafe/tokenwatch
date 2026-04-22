import { defineConfig } from 'tsup'

const sharedExternal = [
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  'better-sqlite3',
  'pg',
  'mysql2',
  'mongodb',
  '@langchain/core',
]

export default defineConfig([
  // Library entries — dual ESM + CJS
  {
    entry: {
      index: 'src/index.ts',
      adapters: 'src/adapters/index.ts',
      langchain: 'src/langchain/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    target: 'node20',
    external: sharedExternal,
  },
  // CLI — ESM only (uses import.meta.url)
  {
    entry: { cli: 'bin/cli.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    target: 'node20',
    external: sharedExternal,
  },
])
