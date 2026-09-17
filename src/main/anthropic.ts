import Anthropic from '@anthropic-ai/sdk'
import { getApiKey, loadSettings } from './config'

/**
 * Build an Anthropic client pointed at the gateway. The gateway expects the key
 * as `Authorization: Bearer <sk-…>`, which is what the SDK's `authToken` sends
 * (mirroring Claude Code's ANTHROPIC_AUTH_TOKEN).
 */
export function makeClient(): Anthropic {
  const key = getApiKey()
  const { baseUrl } = loadSettings()
  return new Anthropic({
    baseURL: baseUrl,
    authToken: key,
    // The gateway authenticates; no direct browser use. Keep retries low so a bad
    // key surfaces quickly instead of hanging.
    maxRetries: 1
  })
}

/** Turn SDK/gateway errors into short, actionable messages (per the gateway guide). */
export function normalizeError(err: unknown): string {
  const anyErr = err as { status?: number; message?: string; error?: { error?: { message?: string } } }
  const status = anyErr?.status
  const detail = anyErr?.error?.error?.message || anyErr?.message || String(err)
  if (status === 401) return `Auth error (401): the gateway key is wrong or has stray quotes/spaces. Re-enter it in Settings.`
  if (status === 403) return `Not allowed (403): the model name is wrong (check the "·" is intact) or not enabled on your key. ${detail}`
  if (status === 429) return `Rate limited / budget exhausted (429): your spend cap may be reached — ask the administrator. ${detail}`
  if (status === 404) return `Not found (404): check the Base URL in Settings. ${detail}`
  return detail
}
