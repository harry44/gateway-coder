import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { AnthropicMessage, ToolPreview, Usage, ImageBlock } from '../../../shared/types'

export interface LiveTool {
  kind: 'tool'
  id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'approval' | 'done' | 'rejected'
  ok?: boolean
  output?: string
  preview?: ToolPreview
}
export type LiveItem =
  | { kind: 'user'; text: string; images?: ImageBlock[] }
  | { kind: 'assistant'; text: string }
  | LiveTool

interface LiveState {
  items: LiveItem[]
  assistantOpen: boolean
}
type Action =
  | { t: 'reset'; text: string; images?: ImageBlock[] }
  | { t: 'text'; delta: string }
  | { t: 'toolUse'; id: string; name: string; input: Record<string, unknown> }
  | { t: 'approval'; id: string; preview: ToolPreview }
  | { t: 'result'; id: string; ok: boolean; output: string }
  | { t: 'clear' }

function reducer(state: LiveState, a: Action): LiveState {
  switch (a.t) {
    case 'reset':
      return { items: [{ kind: 'user', text: a.text, images: a.images }], assistantOpen: false }
    case 'clear':
      return { items: [], assistantOpen: false }
    case 'text': {
      const items = state.items.slice()
      const last = items[items.length - 1]
      if (state.assistantOpen && last && last.kind === 'assistant') {
        items[items.length - 1] = { kind: 'assistant', text: last.text + a.delta }
      } else {
        items.push({ kind: 'assistant', text: a.delta })
      }
      return { items, assistantOpen: true }
    }
    case 'toolUse':
      return {
        items: [...state.items, { kind: 'tool', id: a.id, name: a.name, input: a.input, status: 'running' }],
        assistantOpen: false
      }
    case 'approval':
      return {
        items: state.items.map((it) =>
          it.kind === 'tool' && it.id === a.id ? { ...it, status: 'approval', preview: a.preview } : it
        ),
        assistantOpen: false
      }
    case 'result':
      return {
        items: state.items.map((it) =>
          it.kind === 'tool' && it.id === a.id
            ? { ...it, status: a.ok ? 'done' : 'rejected', ok: a.ok, output: a.output }
            : it
        ),
        assistantOpen: false
      }
    default:
      return state
  }
}

export interface DonePayload {
  stopReason: string
  usage?: Usage
  messages: AnthropicMessage[]
}

interface UseTurnArgs {
  onDone: (payload: DonePayload) => void
  onError: (message: string, messages?: AnthropicMessage[]) => void
}

export function useTurn({ onDone, onError }: UseTurnArgs) {
  const [state, dispatch] = useReducer(reducer, { items: [], assistantOpen: false })
  const [running, setRunning] = useState(false)
  const requestIdRef = useRef<string>('')
  const doneRef = useRef(onDone)
  const errRef = useRef(onError)
  doneRef.current = onDone
  errRef.current = onError

  useEffect(() => {
    const match = (p: { requestId: string }): boolean => p.requestId === requestIdRef.current
    const unsubs = [
      window.api.on('agent:text', (p) => match(p) && dispatch({ t: 'text', delta: p.delta })),
      window.api.on('agent:tool_use', (p) => match(p) && dispatch({ t: 'toolUse', id: p.id, name: p.name, input: p.input })),
      window.api.on('agent:approval_request', (p) => match(p) && dispatch({ t: 'approval', id: p.id, preview: p.preview })),
      window.api.on('agent:tool_result', (p) => match(p) && dispatch({ t: 'result', id: p.id, ok: p.ok, output: p.output })),
      window.api.on('agent:done', (p) => {
        if (!match(p)) return
        setRunning(false)
        doneRef.current({ stopReason: p.stopReason, usage: p.usage, messages: p.messages })
      }),
      window.api.on('agent:error', (p) => {
        if (!match(p)) return
        setRunning(false)
        errRef.current(p.error, p.messages)
      })
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  const start = useCallback(
    (args: { model: string; workspace: string | null; messages: AnthropicMessage[]; userText: string; userImages?: ImageBlock[] }) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      requestIdRef.current = requestId
      dispatch({ t: 'reset', text: args.userText, images: args.userImages })
      setRunning(true)
      window.api.runAgent({
        requestId,
        model: args.model,
        workspace: args.workspace,
        messages: args.messages
      })
    },
    []
  )

  const approve = useCallback((toolId: string, approved: boolean, approvalType?: 'once' | 'always') => {
    window.api.approve(requestIdRef.current, toolId, approved, approvalType)
  }, [])

  const abort = useCallback(() => {
    if (requestIdRef.current) window.api.abort(requestIdRef.current)
  }, [])

  const clear = useCallback(() => dispatch({ t: 'clear' }), [])

  return { liveItems: state.items, running, start, approve, abort, clear }
}
