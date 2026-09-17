// Parse a Claude Code gateway settings file (~/.claude/gw.json) to import the
// base URL and key. The file shape is:
//   { "env": { "ANTHROPIC_BASE_URL": "...", "ANTHROPIC_AUTH_TOKEN": "sk-...", ... } }

export interface GwImport {
  baseUrl?: string
  key?: string
}

export function parseGwJson(text: string): GwImport {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('gw.json is not valid JSON')
  }
  const env = (obj as { env?: Record<string, unknown> })?.env
  if (!env || typeof env !== 'object') {
    throw new Error('gw.json has no "env" block')
  }
  const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : undefined
  const key = typeof env.ANTHROPIC_AUTH_TOKEN === 'string' ? env.ANTHROPIC_AUTH_TOKEN : undefined
  return { baseUrl, key }
}
