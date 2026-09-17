import { describe, it, expect } from 'vitest'
import { isValidModelName, findModel, DEFAULT_MODELS } from '../src/shared/models'

describe('isValidModelName', () => {
  it('accepts names with the middle dot', () => {
    expect(isValidModelName('DeepSeek · V4 Pro')).toBe(true)
    expect(isValidModelName('Anthropic · Claude Sonnet 5')).toBe(true)
  })
  it('rejects names missing the middle dot', () => {
    expect(isValidModelName('DeepSeek . V4 Pro')).toBe(false)
    expect(isValidModelName('DeepSeek - V4 Pro')).toBe(false)
    expect(isValidModelName('')).toBe(false)
  })
})

describe('default models', () => {
  it('every default model name contains the middle dot', () => {
    for (const m of DEFAULT_MODELS) {
      expect(m.value.includes('·'), m.value).toBe(true)
    }
  })
  it('findModel locates by exact value', () => {
    expect(findModel(DEFAULT_MODELS, 'Z.AI · GLM 5.1')?.label).toBe('Z.AI GLM 5.1')
    expect(findModel(DEFAULT_MODELS, 'missing')).toBeUndefined()
  })
})
