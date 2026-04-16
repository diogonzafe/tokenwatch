import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'bin/cli.ts',
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
  ],
})
