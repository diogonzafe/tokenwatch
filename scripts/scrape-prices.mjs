#!/usr/bin/env node
/**
 * Scrapes LLM pricing pages and outputs a prices.json to stdout.
 * Run by the sync-prices GitHub Action.
 *
 * Requires: @playwright/test installed in the environment.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'prices.json')

/** Parse "$X.XX" or "X.XX" → float, scaling from per-token to per-million if needed */
function parsePricePer1M(text) {
  const num = parseFloat(text.replace(/[^0-9.]/g, ''))
  return isNaN(num) ? null : num
}

async function scrapeOpenAI(page) {
  await page.goto('https://openai.com/api/pricing', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  const models = {}
  // OpenAI pricing table rows: model name | input price | output price
  const rows = await page.$$eval('table tbody tr, [class*="pricing"] tr', (trs) =>
    trs.map((tr) => {
      const cells = [...tr.querySelectorAll('td, th')].map((td) => td.textContent?.trim() ?? '')
      return cells
    }),
  )

  const knownModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano']
  for (const row of rows) {
    const name = row[0]?.toLowerCase().replace(/\s+/g, '-') ?? ''
    const match = knownModels.find((m) => name.includes(m))
    if (match && row.length >= 3) {
      const input = parsePricePer1M(row[1] ?? '')
      const output = parsePricePer1M(row[2] ?? '')
      if (input !== null && output !== null) {
        models[match] = { input, output }
      }
    }
  }
  return models
}

async function scrapeAnthropic(page) {
  await page.goto('https://www.anthropic.com/pricing', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  const models = {}
  const knownModels = {
    'claude-opus-4': 'claude-opus-4-6',
    'claude-sonnet-4': 'claude-sonnet-4-6',
    'claude-haiku-4': 'claude-haiku-4-5',
  }

  const rows = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')),
  )

  for (const row of rows) {
    const name = row[0]?.toLowerCase() ?? ''
    for (const [key, modelId] of Object.entries(knownModels)) {
      if (name.includes(key) && row.length >= 3) {
        const input = parsePricePer1M(row[1] ?? '')
        const output = parsePricePer1M(row[2] ?? '')
        if (input !== null && output !== null) {
          models[modelId] = { input, output }
        }
      }
    }
  }
  return models
}

async function scrapeGemini(page) {
  await page.goto('https://ai.google.dev/pricing', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  const models = {}
  const knownModels = {
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-2.5-flash': 'gemini-2.5-flash',
  }

  const rows = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim() ?? '')),
  )

  for (const row of rows) {
    const name = row[0]?.toLowerCase() ?? ''
    for (const [key, modelId] of Object.entries(knownModels)) {
      if (name.includes(key) && row.length >= 3) {
        const input = parsePricePer1M(row[1] ?? '')
        const output = parsePricePer1M(row[2] ?? '')
        if (input !== null && output !== null) {
          models[modelId] = { input, output }
        }
      }
    }
  }
  return models
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const results = { openai: {}, anthropic: {}, gemini: {} }
  const errors = []

  try {
    results.openai = await scrapeOpenAI(page)
    console.error(`✓ OpenAI: ${Object.keys(results.openai).length} models`)
  } catch (e) {
    errors.push(`OpenAI: ${e.message}`)
    console.error(`✗ OpenAI scrape failed: ${e.message}`)
  }

  try {
    results.anthropic = await scrapeAnthropic(page)
    console.error(`✓ Anthropic: ${Object.keys(results.anthropic).length} models`)
  } catch (e) {
    errors.push(`Anthropic: ${e.message}`)
    console.error(`✗ Anthropic scrape failed: ${e.message}`)
  }

  try {
    results.gemini = await scrapeGemini(page)
    console.error(`✓ Gemini: ${Object.keys(results.gemini).length} models`)
  } catch (e) {
    errors.push(`Gemini: ${e.message}`)
    console.error(`✗ Gemini scrape failed: ${e.message}`)
  }

  await browser.close()

  // Read existing prices.json as base (preserves models not scraped, e.g. DeepSeek)
  const existing = JSON.parse(
    (await import('node:fs')).readFileSync(OUT_PATH, 'utf8'),
  )

  const merged = {
    ...existing.models,
    ...results.openai,
    ...results.anthropic,
    ...results.gemini,
  }

  const output = {
    updated_at: new Date().toISOString().slice(0, 10),
    source: 'https://raw.githubusercontent.com/diogonzafe/tokenwatch/main/prices.json',
    models: merged,
  }

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n')
  console.error(`\nWrote ${OUT_PATH} with ${Object.keys(merged).length} models`)

  if (errors.length > 0) {
    console.error(`\nWarnings (partial scrape):\n${errors.join('\n')}`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
