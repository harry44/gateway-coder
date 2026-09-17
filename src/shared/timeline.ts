import type { AnthropicMessage, ContentBlock, TimelineItem } from './types'

/**
 * Convert raw Anthropic messages (the persisted source of truth) into a flat list
 * of display items: user bubbles, assistant text bubbles, and tool cards whose
 * results are filled in from the following tool_result blocks. Pure & testable.
 */
export function messagesToTimeline(messages: AnthropicMessage[]): TimelineItem[] {
  const items: TimelineItem[] = []
  const toolById = new Map<string, Extract<TimelineItem, { kind: 'tool' }>>()

  for (const msg of messages) {
    const content = msg.content
    if (typeof content === 'string') {
      if (content.trim().length) {
        items.push({ kind: msg.role === 'user' ? 'user' : 'assistant', text: content })
      }
      continue
    }
    const blocks = content as ContentBlock[]
    const userText = blocks.find((b) => b.type === 'text')?.text ?? ''
    const userImages = blocks.filter((b) => b.type === 'image').map((b) => `data:${b.source.media_type};base64,${b.source.data}`)
    if (msg.role === 'user' && (userText.trim().length || userImages.length > 0)) {
      items.push({ kind: 'user', text: userText, images: userImages.length > 0 ? userImages : undefined })
    } else if (msg.role === 'assistant' && userText.trim().length) {
      items.push({ kind: 'assistant', text: userText })
    }
    for (const block of blocks) {
      if (block.type === 'tool_use') {
        const item: Extract<TimelineItem, { kind: 'tool' }> = {
          kind: 'tool',
          id: block.id,
          name: block.name,
          input: block.input,
          resultOk: null,
          resultOutput: null
        }
        items.push(item)
        toolById.set(block.id, item)
      } else if (block.type === 'tool_result') {
        const item = toolById.get(block.tool_use_id)
        if (item) {
          item.resultOk = !block.is_error
          item.resultOutput = block.content
        }
      }
    }
  }
  return items
}

/** Derive a short conversation title from the first user message. */
export function deriveTitle(messages: AnthropicMessage[]): string {
  for (const m of messages) {
    if (m.role !== 'user') continue
    const text =
      typeof m.content === 'string'
        ? m.content
        : (m.content.find((b) => b.type === 'text') as { text?: string } | undefined)?.text
    if (text && text.trim()) {
      const t = text.trim().replace(/\s+/g, ' ')
      return t.length > 48 ? t.slice(0, 48) + '…' : t
    }
  }
  return 'New chat'
}
