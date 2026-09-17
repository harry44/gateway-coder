import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { resolveInWorkspace, toWorkspaceRel } from '../src/shared/paths'

const ws = path.resolve('/tmp/ws')

describe('resolveInWorkspace', () => {
  it('resolves a path inside the workspace', () => {
    expect(resolveInWorkspace(ws, 'a/b.txt')).toBe(path.join(ws, 'a', 'b.txt'))
  })

  it('allows the workspace root itself', () => {
    expect(resolveInWorkspace(ws, '.')).toBe(ws)
  })

  it('rejects a path escaping via ..', () => {
    expect(() => resolveInWorkspace(ws, '../evil.txt')).toThrow(/escapes/)
  })

  it('rejects an absolute path outside the workspace', () => {
    const outside = path.resolve('/somewhere/else/passwd')
    expect(() => resolveInWorkspace(ws, outside)).toThrow(/escapes/)
  })

  it('throws when no workspace is set', () => {
    expect(() => resolveInWorkspace('', 'a.txt')).toThrow(/workspace/)
  })
})

describe('toWorkspaceRel', () => {
  it('produces forward-slash relative paths', () => {
    expect(toWorkspaceRel(ws, path.join(ws, 'a', 'b.txt'))).toBe('a/b.txt')
  })
})
