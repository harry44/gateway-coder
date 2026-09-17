import type { ModelDef } from './types'

// Exact model strings from the gateway guide. The "·" (U+00B7 middle dot) must be
// preserved exactly — a name wrong by one character returns 403 from the gateway.
export const DEFAULT_BASE_URL = 'https://litellm.myrent.it'

export const DEFAULT_MODELS: ModelDef[] = [
  {
    label: 'DeepSeek V4 Flash',
    value: 'DeepSeek · V4 Flash',
    inputPerM: 0.1,
    outputPerM: 0.2,
    note: 'cheap everyday use'
  },
  {
    label: 'DeepSeek V4 Pro',
    value: 'DeepSeek · V4 Pro',
    inputPerM: 0.44,
    outputPerM: 0.87,
    note: 'default, good all-rounder'
  },
  {
    label: 'Z.AI GLM 5.1',
    value: 'Z.AI · GLM 5.1',
    inputPerM: 0.98,
    outputPerM: 3.08,
    note: 'writing code'
  },
  {
    label: 'Anthropic Claude Sonnet 5',
    value: 'Anthropic · Claude Sonnet 5',
    inputPerM: 3.0,
    outputPerM: 15.0,
    note: 'the hardest tasks'
  },
  {
    label: 'Google Gemini 3.1 Flash Lite',
    value: 'Google · Gemini 3.1 Flash Lite',
    inputPerM: null,
    outputPerM: null,
    note: 'fast & light'
  }
]

export const DEFAULT_SELECTED_MODEL = 'DeepSeek · V4 Pro'

/** Every gateway model name contains the middle dot; a plain "." or "-" is wrong. */
export function isValidModelName(value: string): boolean {
  return typeof value === 'string' && value.includes('·') && value.trim().length > 3
}

export function findModel(models: ModelDef[], value: string): ModelDef | undefined {
  return models.find((m) => m.value === value)
}
