import type { WebContents } from 'electron'
import { makeClient, normalizeError } from './anthropic'
import { loadSettings, getApiKey, saveSettings } from './config'
import { TOOL_SCHEMAS, MUTATING_TOOLS, executeTool, buildPreview } from './tools'
import type { AnthropicMessage, ContentBlock, ToolResultBlock } from '../shared/types'

const controllers = new Map<string, AbortController>()
type ApprovalResolver = (approved: boolean, approvalType?: 'once' | 'always') => void
const pendingApprovals = new Map<string, ApprovalResolver>()

const approvalKey = (requestId: string, toolId: string): string => `${requestId}::${toolId}`

export function resolveApproval(requestId: string, toolId: string, approved: boolean, approvalType?: 'once' | 'always'): void {
  const key = approvalKey(requestId, toolId)
  const fn = pendingApprovals.get(key)
  if (fn) {
    pendingApprovals.delete(key)
    fn(approved, approvalType)
  }
}

export function abortRequest(requestId: string): void {
  controllers.get(requestId)?.abort()
}

function buildSystemPrompt(workspace: string | null): string {
  const ws = workspace ?? '(no workspace folder open — file/command tools are unavailable)'
  return [
    'You are Gateway Coder, a focused coding assistant running as a desktop app on Windows.',
    'You help with software engineering tasks in the user\'s workspace folder.',
    `The workspace root is: ${ws}`,
    'You have tools to list, read, search, write, and edit files, and to run shell commands.',
    'All file paths are relative to the workspace root. Prefer small, targeted edits with edit_file over rewriting whole files.',
    'Read files before editing them. After changing code, consider running the project\'s build or tests to verify.',
    'Be concise. Explain what you are about to do briefly, then use tools. Do not ask for permission in text — the app prompts the user to approve mutating actions.'
  ].join('\n')
}

interface RunAgentOpts {
  wc: WebContents
  requestId: string
  model: string
  workspace: string | null
  messages: AnthropicMessage[]
}

/**
 * Run the agentic loop for one user turn. Emits stream events to the renderer and
 * returns the full updated messages array (source of truth for persistence).
 */
export async function runAgent(opts: RunAgentOpts): Promise<void> {
  const { wc, requestId, model, workspace } = opts
  const messages = opts.messages
  const settings = loadSettings()
  const send = (channel: string, payload: Record<string, unknown>): void => {
    if (!wc.isDestroyed()) wc.send(channel, { requestId, ...payload })
  }

  if (!getApiKey()) {
    send('agent:error', { error: 'No gateway key set. Open Settings and paste your sk-… key.' })
    return
  }

  const ac = new AbortController()
  controllers.set(requestId, ac)
  const client = makeClient()
  const totalUsage = { input_tokens: 0, output_tokens: 0 }

  try {
    for (let step = 0; step < settings.maxSteps; step++) {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: settings.maxTokens,
          system: buildSystemPrompt(workspace),
          tools: TOOL_SCHEMAS,
          messages: messages as never
        },
        { signal: ac.signal }
      )
      stream.on('text', (t: string) => send('agent:text', { delta: t }))
      const final = await stream.finalMessage()

      totalUsage.input_tokens += final.usage?.input_tokens ?? 0
      totalUsage.output_tokens += final.usage?.output_tokens ?? 0

      const assistantContent = final.content as unknown as ContentBlock[]
      send('agent:assistant', { content: assistantContent })
      messages.push({ role: 'assistant', content: assistantContent })

      if (final.stop_reason !== 'tool_use') {
        send('agent:done', {
          stopReason: final.stop_reason,
          usage: totalUsage,
          messages
        })
        return
      }

      const toolResults: ToolResultBlock[] = []
      for (const block of assistantContent) {
        if (block.type !== 'tool_use') continue
        if (!workspace) {
          send('agent:tool_result', { id: block.id, ok: false, output: 'No workspace folder is open.' })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'No workspace folder is open. Ask the user to open one.',
            is_error: true
          })
          continue
        }
        send('agent:tool_use', { id: block.id, name: block.name, input: block.input })

        const mutating = MUTATING_TOOLS.has(block.name)
        const toolApproval = settings.toolApprovals?.[block.name]
        const autoOk = toolApproval === 'always'
          ? true
          : toolApproval === 'allow'
            ? true
            : mutating
              ? settings.autoApprove
              : !settings.requireApprovalForReads

        let approved = autoOk
        let approvalType: 'once' | 'always' | undefined
        if (!autoOk && toolApproval !== 'allow') {
          const preview = buildPreview(block.name, block.input, { workspace })
          send('agent:approval_request', {
            id: block.id,
            name: block.name,
            input: block.input,
            preview
          })
          const result = await waitForApproval(requestId, block.id, ac.signal)
          approved = result.approved
          approvalType = result.approvalType
        }

        if (!approved) {
          send('agent:tool_result', { id: block.id, ok: false, output: 'Rejected by user.' })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'The user rejected this action. Do not retry it; consider an alternative or ask the user.',
            is_error: true
          })
          continue
        }

        // Update tool approval setting based on user's choice
        if (toolApproval === 'allow') {
          // Reset to 'ask' after one-time allow
          saveSettings({ toolApprovals: { ...settings.toolApprovals, [block.name]: 'ask' } })
        } else if (approvalType === 'once') {
          // User chose "Allow once" - set to 'allow' for next time
          saveSettings({ toolApprovals: { ...settings.toolApprovals, [block.name]: 'allow' } })
        } else if (approvalType === 'always') {
          // User chose "Always allow"
          saveSettings({ toolApprovals: { ...settings.toolApprovals, [block.name]: 'always' } })
        }

        const result = await executeTool(block.name, block.input, { workspace })
        send('agent:tool_result', { id: block.id, ok: !result.isError, output: result.content })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content || '(no output)',
          is_error: result.isError
        })
      }

      messages.push({ role: 'user', content: toolResults })
    }

    send('agent:done', { stopReason: 'max_steps', usage: totalUsage, messages })
  } catch (err) {
    if (ac.signal.aborted) {
      send('agent:done', { stopReason: 'aborted', usage: totalUsage, messages })
    } else {
      send('agent:error', { error: normalizeError(err), messages })
    }
  } finally {
    controllers.delete(requestId)
    // Clean up any dangling approval waiters for this request.
    for (const key of pendingApprovals.keys()) {
      if (key.startsWith(`${requestId}::`)) pendingApprovals.delete(key)
    }
  }
}

function waitForApproval(requestId: string, toolId: string, signal: AbortSignal): Promise<{ approved: boolean; approvalType?: 'once' | 'always' }> {
  return new Promise<{ approved: boolean; approvalType?: 'once' | 'always' }>((resolve) => {
    if (signal.aborted) return resolve({ approved: false })
    const key = approvalKey(requestId, toolId)
    pendingApprovals.set(key, (approved, approvalType) => resolve({ approved, approvalType }))
    signal.addEventListener(
      'abort',
      () => {
        if (pendingApprovals.has(key)) {
          pendingApprovals.delete(key)
          resolve({ approved: false })
        }
      },
      { once: true }
    )
  })
}
