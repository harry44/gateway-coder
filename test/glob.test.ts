import { describe, it, expect } from 'vitest'
import { matchGlob } from '../src/shared/glob'

describe('matchGlob', () => {
  it('matches * within a segment only', () => {
    expect(matchGlob('src/*.ts', 'src/app.ts')).toBe(true)
    expect(matchGlob('src/*.ts', 'src/sub/app.ts')).toBe(false)
  })

  it('matches ** across segments', () => {
    expect(matchGlob('src/**/*.ts', 'src/a/b/app.ts')).toBe(true)
    expect(matchGlob('**/*.test.ts', 'test/cost.test.ts')).toBe(true)
  })

  it('matches ? as a single char', () => {
    expect(matchGlob('a?.txt', 'ab.txt')).toBe(true)
    expect(matchGlob('a?.txt', 'abc.txt')).toBe(false)
  })

  it('normalizes backslashes', () => {
    expect(matchGlob('src/**/*.ts', 'src\\a\\app.ts')).toBe(true)
  })

  it('escapes regex specials in the pattern', () => {
    expect(matchGlob('a.(b)+.js', 'a.(b)+.js')).toBe(true)
    expect(matchGlob('a.(b)+.js', 'axxbx.js')).toBe(false)
  })
})
