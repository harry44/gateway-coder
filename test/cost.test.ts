import { describe, it, expect } from 'vitest'
import { computeCost, formatUsd, addUsage } from '../src/shared/cost'
import { DEFAULT_MODELS } from '../src/shared/models'

describe('computeCost', () => {
  it('computes cost for a known model at 1M tokens each', () => {
    const c = computeCost(DEFAULT_MODELS, 'DeepSeek · V4 Pro', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000
    })
    expect(c).toBeCloseTo(0.44 + 0.87, 6)
  })

  it('returns null when pricing is unknown', () => {
    expect(
      computeCost(DEFAULT_MODELS, 'Google · Gemini 3.1 Flash Lite', {
        input_tokens: 100,
        output_tokens: 100
      })
    ).toBeNull()
  })

  it('returns null when the model is not found', () => {
    expect(computeCost(DEFAULT_MODELS, 'Nope', { input_tokens: 10, output_tokens: 10 })).toBeNull()
  })

  it('returns null when usage is missing', () => {
    expect(computeCost(DEFAULT_MODELS, 'DeepSeek · V4 Pro', undefined)).toBeNull()
  })
})

describe('formatUsd', () => {
  it('formats edge cases', () => {
    expect(formatUsd(null)).toBe('—')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.004)).toBe('<$0.01')
    expect(formatUsd(0.123)).toBe('$0.123')
    expect(formatUsd(2.5)).toBe('$2.50')
  })
})

describe('addUsage', () => {
  it('sums usage, tolerating undefined', () => {
    expect(addUsage({ input_tokens: 5, output_tokens: 3 }, undefined)).toEqual({
      input_tokens: 5,
      output_tokens: 3
    })
    expect(addUsage({ input_tokens: 5, output_tokens: 3 }, { input_tokens: 2, output_tokens: 4 })).toEqual({
      input_tokens: 7,
      output_tokens: 7
    })
  })
})
