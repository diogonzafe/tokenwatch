import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'bin/cli.ts',
    adapters: 'src/adapters/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'node20',
  external: [
    'openai',
    '@anthropic-ai/sdk',
    '@google/generative-ai',
    'better-sqlite3',
    'pg',
    'mysql2',
    'mongodb',
  ],
})
