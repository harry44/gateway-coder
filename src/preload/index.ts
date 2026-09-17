import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AnthropicMessage,
  AppSettings,
  Conversation,
  ConversationMeta,
  SettingsView
} from '../shared/types'

const AGENT_CHANNELS = [
  'agent:text',
  'agent:assistant',
  'agent:tool_use',
  'agent:approval_request',
  'agent:tool_result',
  'agent:done',
  'agent:error'
] as const

export interface RunAgentArgs {
  requestId: string
  model: string
  workspace: string | null
  messages: AnthropicMessage[]
}

const api = {
  // Settings
  getSettings: (): Promise<SettingsView> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings>): Promise<SettingsView> =>
    ipcRenderer.invoke('settings:save', patch),
  setKey: (key: string): Promise<SettingsView> => ipcRenderer.invoke('settings:setKey', key),
  importGw: (): Promise<{ ok: boolean; message?: string; imported?: unknown; settings?: SettingsView }> =>
    ipcRenderer.invoke('settings:importGw'),
  testGateway: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('gateway:test'),

  // Workspace
  pickWorkspace: (): Promise<string | null> => ipcRenderer.invoke('workspace:pick'),
  openExternal: (target: string): Promise<boolean> => ipcRenderer.invoke('workspace:openExternal', target),

  // Conversations
  listConversations: (): Promise<ConversationMeta[]> => ipcRenderer.invoke('convo:list'),
  getConversation: (id: string): Promise<Conversation | null> => ipcRenderer.invoke('convo:get', id),
  saveConversation: (convo: Conversation): Promise<Conversation> =>
    ipcRenderer.invoke('convo:save', convo),
  deleteConversation: (id: string): Promise<boolean> => ipcRenderer.invoke('convo:delete', id),

  // Agent
  runAgent: (args: RunAgentArgs): Promise<boolean> => ipcRenderer.invoke('agent:run', args),
  approve: (requestId: string, toolId: string, approved: boolean, approvalType?: 'once' | 'always'): void =>
    ipcRenderer.send('agent:approve', { requestId, toolId, approved, approvalType }),
  abort: (requestId: string): void => ipcRenderer.send('agent:abort', requestId),

  readText: (absPath: string): Promise<string | null> => ipcRenderer.invoke('file:readText', absPath),

  /** Subscribe to an agent stream channel. Returns an unsubscribe function. */
  on: (channel: (typeof AGENT_CHANNELS)[number], cb: (payload: any) => void): (() => void) => {
    if (!AGENT_CHANNELS.includes(channel)) return () => {}
    const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type GatewayApi = typeof api
