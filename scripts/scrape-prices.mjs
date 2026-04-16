#!/usr/bin/env node
/**
 * Fetches LLM pricing data from the LiteLLM community JSON and outputs a prices.json.
 * Run by the sync-prices GitHub Action.
 *
 * No external dependencies — uses only Node.js built-ins + global fetch (Node 18+).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'prices.json')

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

const NON_CHAT_TOKENS = [
  'embed',
  'search',
  'instruct',
  'tts',
  'whisper',
  'dall-e',
  'rerank',
  'moderation',
]

function isNonChatModel(name) {
  return NON_CHAT_TOKENS.some((tok) => name.includes(tok)) || name.startsWith('ft:')
}

function detectProvider(rawKey, entry) {
  const provider = entry.litellm_provider ?? ''
  const modelName = rawKey.includes('/') ? rawKey.split('/').slice(1).join('/') : rawKey

  if (provider === 'openai' || provider === 'openai_text_completion') return 'openai'
  if (provider === 'anthropic') return 'anthropic'
  if ((provider === 'gemini' || provider.startsWith('vertex_ai')) && modelName.startsWith('gemini-'))
    return 'gemini'
  if (provider === 'deepseek' || modelName.startsWith('deepseek-')) return 'deepseek'

  // name-prefix fallback
  if (
    modelName.startsWith('gpt-') ||
    modelName.startsWith('o1-') ||
    modelName.startsWith('o3-') ||
    modelName.startsWith('o4-')
  )
    return 'openai'
  if (modelName.startsWith('claude-')) return 'anthropic'
  if (modelName.startsWith('gemini-')) return 'gemini'

  return null
}

function round5(n) {
  return Math.round(n * 100000) / 100000
}

async function main() {
  // Step 1: read existing prices.json as baseline
  let existingModels = {}
  try {
    const raw = readFileSync(OUT_PATH, 'utf8')
    existingModels = JSON.parse(raw).models ?? {}
  } catch {
    // file missing or malformed — start fresh
  }

  // Step 2: fetch LiteLLM JSON
  let litellmData
  try {
    const res = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      console.error(`✗ LiteLLM fetch failed: HTTP ${res.status}`)
      process.exit(0)
    }
    litellmData = await res.json()
  } catch (e) {
    console.error(`✗ LiteLLM fetch error: ${e.message}`)
    process.exit(0)
  }

  // Step 3: iterate and filter
  const counts = { openai: 0, anthropic: 0, gemini: 0, deepseek: 0 }
  const merged = { ...existingModels }

  for (const [rawKey, entry] of Object.entries(litellmData)) {
    if (rawKey === '__default') continue

    const modelName = (
      rawKey.includes('/') ? rawKey.split('/').slice(1).join('/') : rawKey
    ).toLowerCase().trim()

    if (isNonChatModel(modelName)) continue

    const inputPerToken = entry.input_cost_per_token
    const outputPerToken = entry.output_cost_per_token
    if (!inputPerToken || !outputPerToken) continue

    const provider = detectProvider(rawKey, entry)
    if (!provider) continue

    const modelEntry = {
      input: round5(inputPerToken * 1_000_000),
      output: round5(outputPerToken * 1_000_000),
    }

    const maxInputTokens = entry.max_input_tokens ?? entry.max_tokens ?? null
    if (maxInputTokens) modelEntry.maxInputTokens = maxInputTokens

    merged[modelName] = modelEntry
    counts[provider]++
  }

  // Step 4: write output
  const output = {
    updated_at: new Date().toISOString().slice(0, 10),
    source: LITELLM_URL,
    models: merged,
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n')

  console.error(`✓ OpenAI: ${counts.openai} models`)
  console.error(`✓ Anthropic: ${counts.anthropic} models`)
  console.error(`✓ Gemini: ${counts.gemini} models`)
  console.error(`✓ DeepSeek: ${counts.deepseek} models`)
  console.error(`\nWrote ${OUT_PATH} with ${Object.keys(merged).length} models`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
