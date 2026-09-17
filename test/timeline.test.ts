import { describe, it, expect } from 'vitest'
import { messagesToTimeline, deriveTitle } from '../src/shared/timeline'
import type { AnthropicMessage } from '../src/shared/types'

const conversation: AnthropicMessage[] = [
  { role: 'user', content: 'List the files' },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me look.' },
      { type: 'tool_use', id: 'tool_1', name: 'list_dir', input: { path: '.' } }
    ]
  },
  {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: 'a.txt\nb.txt' }]
  },
  { role: 'assistant', content: [{ type: 'text', text: 'There are two files.' }] }
]

describe('messagesToTimeline', () => {
  it('flattens messages and attaches tool results', () => {
    const t = messagesToTimeline(conversation)
    expect(t).toEqual([
      { kind: 'user', text: 'List the files' },
      { kind: 'assistant', text: 'Let me look.' },
      {
        kind: 'tool',
        id: 'tool_1',
        name: 'list_dir',
        input: { path: '.' },
        resultOk: true,
        resultOutput: 'a.txt\nb.txt'
      },
      { kind: 'assistant', text: 'There are two files.' }
    ])
  })

  it('marks errored tool results', () => {
    const t = messagesToTimeline([
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'read_file', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'boom', is_error: true }] }
    ])
    const tool = t.find((i) => i.kind === 'tool') as any
    expect(tool.resultOk).toBe(false)
    expect(tool.resultOutput).toBe('boom')
  })

  it('skips empty text blocks', () => {
    const t = messagesToTimeline([{ role: 'assistant', content: [{ type: 'text', text: '   ' }] }])
    expect(t).toEqual([])
  })
})

describe('deriveTitle', () => {
  it('uses the first user message, truncated', () => {
    expect(deriveTitle(conversation)).toBe('List the files')
  })
  it('handles array user content', () => {
    const msgs: AnthropicMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Fix the bug in app.ts please' }] }
    ]
    expect(deriveTitle(msgs)).toBe('Fix the bug in app.ts please')
  })
  it('falls back when there is no user text', () => {
    expect(deriveTitle([])).toBe('New chat')
  })
})
