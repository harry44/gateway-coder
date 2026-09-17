// Types shared across main, preload, and renderer.

export interface ModelDef {
  /** Human label shown in the UI, e.g. "DeepSeek V4 Pro". */
  label: string
  /** Exact string sent to the gateway, e.g. "DeepSeek · V4 Pro". */
  value: string
  /** USD per 1M input tokens, or null if unknown. */
  inputPerM: number | null
  /** USD per 1M output tokens, or null if unknown. */
  outputPerM: number | null
  /** Short note, e.g. "cheap everyday use". */
  note?: string
}

export interface Usage {
  input_tokens: number
  output_tokens: number
}

// --- Anthropic message shapes (the subset we use) ---

export interface TextBlock {
  type: 'text'
  text: string
}
export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
    data: string
  }
}
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}
export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}
export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface Conversation {
  id: string
  title: string
  model: string
  workspace: string | null
  createdAt: number
  updatedAt: number
  messages: AnthropicMessage[]
  usage?: Usage
  costUsd?: number | null
}

export interface ConversationMeta {
  id: string
  title: string
  model: string
  workspace: string | null
  createdAt: number
  updatedAt: number
}

// --- Settings ---

export interface AppSettings {
  baseUrl: string
  models: ModelDef[]
  selectedModel: string
  maxTokens: number
  maxSteps: number
  /** Auto-approve mutating tools (write/edit/run) without prompting. */
  autoApprove: boolean
  /** Require approval even for read-only tools. */
  requireApprovalForReads: boolean
  /** Per-tool auto-approval preferences. */
  toolApprovals: Record<string, 'ask' | 'allow' | 'always'>
}

export interface SettingsView extends AppSettings {
  hasKey: boolean
}

// --- Display timeline (derived from messages for rendering) ---

export type TimelineItem =
  | { kind: 'user'; text: string; images?: string[] }
  | { kind: 'assistant'; text: string }
  | {
      kind: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      resultOk: boolean | null
      resultOutput: string | null
    }

// --- Agent stream events (main -> renderer) ---

export interface ToolPreview {
  kind: 'command' | 'diff' | 'write' | 'generic'
  title: string
  body: string
}
