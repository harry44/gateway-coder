import { describe, it, expect } from 'vitest'
import { parseGwJson } from '../src/shared/gwjson'

describe('parseGwJson', () => {
  it('extracts base URL and key from the env block', () => {
    const text = JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: 'https://litellm.myrent.it',
        ANTHROPIC_AUTH_TOKEN: 'sk-abc123',
        ANTHROPIC_MODEL: 'DeepSeek · V4 Pro'
      }
    })
    expect(parseGwJson(text)).toEqual({
      baseUrl: 'https://litellm.myrent.it',
      key: 'sk-abc123'
    })
  })

  it('returns undefined fields when absent', () => {
    expect(parseGwJson(JSON.stringify({ env: {} }))).toEqual({ baseUrl: undefined, key: undefined })
  })

  it('throws on invalid JSON', () => {
    expect(() => parseGwJson('{ not json')).toThrow(/valid JSON/)
  })

  it('throws when there is no env block', () => {
    expect(() => parseGwJson(JSON.stringify({ foo: 1 }))).toThrow(/env/)
  })
})
