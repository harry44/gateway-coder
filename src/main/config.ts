import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { AppSettings } from '../shared/types'
import { DEFAULT_BASE_URL, DEFAULT_MODELS, DEFAULT_SELECTED_MODEL } from '../shared/models'
import { parseGwJson, type GwImport } from '../shared/gwjson'

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')
const keyPath = (): string => join(app.getPath('userData'), 'apikey.bin')

const DEFAULTS: AppSettings = {
  baseUrl: DEFAULT_BASE_URL,
  models: DEFAULT_MODELS,
  selectedModel: DEFAULT_SELECTED_MODEL,
  maxTokens: 4096,
  maxSteps: 25,
  autoApprove: false,
  requireApprovalForReads: false,
  toolApprovals: {}
}

export function loadSettings(): AppSettings {
  try {
    if (existsSync(settingsPath())) {
      const raw = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<AppSettings>
      return {
        ...DEFAULTS,
        ...raw,
        models: raw.models && raw.models.length ? raw.models : DEFAULTS.models,
        toolApprovals: raw.toolApprovals ?? DEFAULTS.toolApprovals
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }
  return { ...DEFAULTS }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...loadSettings(), ...patch }
  writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

const PLAIN_PREFIX = 'PLAIN:'

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) return
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(keyPath(), safeStorage.encryptString(trimmed))
  } else {
    // Fallback if OS encryption is unavailable (rare on Windows). Still local-only.
    writeFileSync(keyPath(), Buffer.from(PLAIN_PREFIX + trimmed, 'utf8'))
  }
}

export function getApiKey(): string {
  try {
    if (!existsSync(keyPath())) return ''
    const buf = readFileSync(keyPath())
    if (buf.subarray(0, PLAIN_PREFIX.length).toString('utf8') === PLAIN_PREFIX) {
      return buf.subarray(PLAIN_PREFIX.length).toString('utf8')
    }
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
  } catch (err) {
    console.error('Failed to read API key:', err)
  }
  return ''
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

/** Read ~/.claude/gw.json if present and extract base URL + key. */
export function importGwJson(): GwImport | null {
  const p = join(homedir(), '.claude', 'gw.json')
  if (!existsSync(p)) return null
  return parseGwJson(readFileSync(p, 'utf8'))
}
