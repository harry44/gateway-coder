import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { promises as fs } from 'node:fs'
import type { AnthropicMessage, Conversation, SettingsView } from '../shared/types'
import {
  loadSettings,
  saveSettings,
  setApiKey,
  getApiKey,
  hasApiKey,
  importGwJson
} from './config'
import { runAgent, resolveApproval, abortRequest } from './agent'
import { makeClient, normalizeError } from './anthropic'
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation
} from './conversations'

function settingsView(): SettingsView {
  return { ...loadSettings(), hasKey: hasApiKey() }
}

export function registerIpc(): void {
  // --- Settings ---
  ipcMain.handle('settings:get', () => settingsView())
  ipcMain.handle('settings:save', (_e, patch) => {
    saveSettings(patch)
    return settingsView()
  })
  ipcMain.handle('settings:setKey', (_e, key: string) => {
    setApiKey(key)
    return settingsView()
  })
  ipcMain.handle('settings:importGw', () => {
    const imported = importGwJson()
    if (!imported) return { ok: false, message: 'No ~/.claude/gw.json found.' }
    if (imported.baseUrl) saveSettings({ baseUrl: imported.baseUrl })
    if (imported.key) setApiKey(imported.key)
    return { ok: true, imported: { baseUrl: imported.baseUrl, hasKey: !!imported.key }, settings: settingsView() }
  })

  // --- Workspace ---
  ipcMain.handle('workspace:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = await dialog.showOpenDialog(win!, {
      title: 'Open workspace folder',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })
  ipcMain.handle('workspace:openExternal', (_e, target: string) => {
    if (target) shell.openPath(target)
    return true
  })

  // --- Conversations ---
  ipcMain.handle('convo:list', () => listConversations())
  ipcMain.handle('convo:get', (_e, id: string) => getConversation(id))
  ipcMain.handle('convo:save', (_e, convo: Conversation) => saveConversation(convo))
  ipcMain.handle('convo:delete', (_e, id: string) => {
    deleteConversation(id)
    return true
  })

  // --- Agent ---
  ipcMain.handle(
    'agent:run',
    async (
      e,
      args: { requestId: string; model: string; workspace: string | null; messages: AnthropicMessage[] }
    ) => {
      await runAgent({ wc: e.sender, ...args })
      return true
    }
  )
  ipcMain.on('agent:approve', (_e, args: { requestId: string; toolId: string; approved: boolean; approvalType?: 'once' | 'always' }) => {
    resolveApproval(args.requestId, args.toolId, args.approved, args.approvalType)
  })
  ipcMain.on('agent:abort', (_e, requestId: string) => abortRequest(requestId))

  // --- Test connection (used by Settings) ---
  ipcMain.handle('gateway:test', async () => {
    if (!getApiKey()) return { ok: false, message: 'No key set.' }
    try {
      const client = makeClient()
      const { selectedModel, maxTokens } = loadSettings()
      const resp = await client.messages.create({
        model: selectedModel,
        max_tokens: Math.min(64, maxTokens),
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }]
      })
      const text = resp.content
        .map((b) => ('text' in b ? (b as { text: string }).text : ''))
        .join('')
        .trim()
      return { ok: true, message: `Gateway reachable. Model replied: "${text.slice(0, 40)}"` }
    } catch (err) {
      return { ok: false, message: normalizeError(err) }
    }
  })

  // --- Misc ---
  ipcMain.handle('file:readText', async (_e, absPath: string) => {
    try {
      return await fs.readFile(absPath, 'utf8')
    } catch {
      return null
    }
  })
}
