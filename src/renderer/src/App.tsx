import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnthropicMessage, Conversation, ConversationMeta, SettingsView, Usage, ImageBlock } from '../../shared/types'
import { messagesToTimeline, deriveTitle } from '../../shared/timeline'
import { computeCost, formatUsd, addUsage } from '../../shared/cost'
import Sidebar from './components/Sidebar'
import Composer from './components/Composer'
import Markdown from './components/Markdown'
import ToolCard from './components/ToolCard'
import SettingsModal from './components/SettingsModal'
import { useTurn, type LiveItem } from './lib/useTurn'

const genId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p

function getToolStatusLabel(it: LiveItem): string {
  if (it.kind !== 'tool') return ''
  const status = it.status
  const name = it.name
  const input = it.input as Record<string, unknown>
  if (status === 'approval') return `${name} — waiting for approval`
  if (status === 'running') {
    if (name === 'run_command') return `Running: ${String(input.command ?? '')?.slice(0, 50)}`
    if (name === 'read_file') return `Reading: ${String(input.path ?? '')}`
    if (name === 'write_file') return `Writing: ${String(input.path ?? '')}`
    if (name === 'edit_file') return `Editing: ${String(input.path ?? '')}`
    if (name === 'list_dir') return `Listing: ${String(input.path ?? '.')}`
    if (name === 'glob') return `Searching files: ${String(input.pattern ?? '')}`
    if (name === 'grep') return `Searching: ${String(input.pattern ?? '')}`
    return `Running ${name}…`
  }
  if (status === 'done') return `${name} — done`
  if (status === 'rejected') return `${name} — rejected`
  return `${name} — ${status}`
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AnthropicMessage[]>([])
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [model, setModel] = useState<string>('')
  const [convoUsage, setConvoUsage] = useState<Usage>({ input_tokens: 0, output_tokens: 0 })
  const [error, setError] = useState<string | null>(null)
  const [modelToast, setModelToast] = useState<string | null>(null)

  const createdAtRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshConversations = async (): Promise<void> => {
    setConversations(await window.api.listConversations())
  }

  const persist = async (msgs: AnthropicMessage[], usage: Usage): Promise<void> => {
    const id = activeId ?? genId()
    const now = Date.now()
    if (createdAtRef.current == null) createdAtRef.current = now
    const convo: Conversation = {
      id,
      title: deriveTitle(msgs),
      model,
      workspace,
      createdAt: createdAtRef.current,
      updatedAt: now,
      messages: msgs,
      usage,
      costUsd: settings ? computeCost(settings.models, model, usage) : null
    }
    await window.api.saveConversation(convo)
    if (!activeId) setActiveId(id)
    await refreshConversations()
  }

  const turn = useTurn({
    onDone: async (p) => {
      console.log('Agent done, messages:', p.messages?.map(m => ({ role: m.role, contentType: Array.isArray(m.content) ? m.content.map(c => c.type) : 'text' })))
      setMessages(p.messages)
      const total = addUsage(convoUsage, p.usage)
      setConvoUsage(total)
      await persist(p.messages, total)
      turn.clear()
    },
    onError: async (message, msgs) => {
      console.log('Agent error, messages:', msgs?.map(m => ({ role: m.role, contentType: Array.isArray(m.content) ? m.content.map(c => c.type) : 'text' })))
      setError(message)
      if (msgs) {
        setMessages(msgs)
        await persist(msgs, convoUsage)
      }
      turn.clear()
    }
  })

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSettings(s)
      setModel(s.selectedModel)
      if (!s.hasKey) setShowSettings(true)
    })
    refreshConversations()
  }, [])

  const timeline = useMemo(() => messagesToTimeline(messages), [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [timeline, turn.liveItems])

  const newChat = (): void => {
    setActiveId(null)
    setMessages([])
    setConvoUsage({ input_tokens: 0, output_tokens: 0 })
    createdAtRef.current = null
    setError(null)
    turn.clear()
  }

  const selectConversation = async (id: string): Promise<void> => {
    const c = await window.api.getConversation(id)
    if (!c) return
    setActiveId(id)
    setMessages(c.messages)
    setModel(c.model)
    setWorkspace(c.workspace)
    setConvoUsage(c.usage ?? { input_tokens: 0, output_tokens: 0 })
    createdAtRef.current = c.createdAt
    setError(null)
    turn.clear()
  }

  const deleteConversation = async (id: string): Promise<void> => {
    await window.api.deleteConversation(id)
    if (id === activeId) newChat()
    await refreshConversations()
  }

  const pickWorkspace = async (): Promise<void> => {
    const p = await window.api.pickWorkspace()
    if (p) setWorkspace(p)
  }

  const changeModel = async (value: string): Promise<void> => {
    setModel(value)
    const next = await window.api.saveSettings({ selectedModel: value })
    setSettings(next)
    const label = next.models.find((m) => m.value === value)?.label ?? value
    setModelToast(`Model: ${label}`)
    setTimeout(() => setModelToast(null), 2000)
  }

const send = useCallback((text: string, images?: { dataUrl: string; mediaType: string; base64: string }[], files?: { name: string; type: string; content: string; size: number }[]): void => {
    setError(null)
    setMessages((currentMessages) => {
      const content: AnthropicMessage['content'] = []
      if (text.trim()) {
        content.push({ type: 'text', text })
      }
      const userImages: ImageBlock[] = []
      if (images && images.length > 0) {
        for (const img of images) {
          const imageBlock: ImageBlock = {
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType as ImageBlock['source']['media_type'],
              data: img.base64
            }
          }
          content.push(imageBlock)
          userImages.push(imageBlock)
        }
      }
      if (files && files.length > 0) {
        for (const file of files) {
          content.push({
            type: 'text',
            text: `[File: ${file.name}]\n${file.content}`
          })
        }
      }
      const outgoing: AnthropicMessage[] = [...currentMessages, { role: 'user', content }]
      console.log('Sending messages:', outgoing.map(m => ({ role: m.role, contentType: Array.isArray(m.content) ? m.content.map(c => c.type) : 'text' })))
      turn.start({ model, workspace, messages: outgoing, userText: text, userImages })
      return currentMessages
    })
  }, [model, workspace, turn])

  const canChat = !!settings?.hasKey && !!workspace
  const cost = settings ? computeCost(settings.models, model, convoUsage) : null

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onNew={newChat}
        onSelect={selectConversation}
        onDelete={deleteConversation}
      />

      <main className="main">
        <header className="topbar">
          <div className="ws">
            <button className="btn ghost" onClick={pickWorkspace} type="button">
              {workspace ? `📂 ${baseName(workspace)}` : '📂 Open folder'}
            </button>
            {workspace && (
              <span className="ws-path" title={workspace}>
                {workspace}
              </span>
            )}
          </div>
          <div className="topbar-right">
            <select value={model} onChange={(e) => changeModel(e.target.value)} className="model-select">
              {settings?.models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="cost" title="Cumulative for this conversation">
              {formatUsd(cost)} · {convoUsage.input_tokens + convoUsage.output_tokens} tok
            </span>
            <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)} type="button">
              ⚙
            </button>
          </div>
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat">
            {timeline.length === 0 && turn.liveItems.length === 0 && (
              <div className="welcome">
                <h1>Gateway Coder</h1>
                <p>
                  {!settings?.hasKey
                    ? 'Set your gateway key in Settings (⚙) to begin.'
                    : !workspace
                      ? 'Open a workspace folder to let the agent read, edit, and run commands in it.'
                      : 'Ask a question or describe a change. Edits and commands are shown for your approval.'}
                </p>
              </div>
            )}

            {timeline.map((it, i) =>
              it.kind === 'tool' ? (
                <ToolCard
                  key={`c${i}`}
                  name={it.name}
                  input={it.input}
                  status="committed"
                  ok={it.resultOk}
                  output={it.resultOutput}
                />
              ) : (
                <Bubble key={`c${i}`} role={it.kind} text={it.text} images={it.kind === 'user' ? it.images : undefined} />
              )
            )}

            {turn.liveItems.map((it: LiveItem, i) =>
              it.kind === 'tool' ? (
                <ToolCard
                  key={`l${i}`}
                  name={it.name}
                  input={it.input}
                  status={it.status}
                  ok={it.ok}
                  output={it.output}
                  preview={it.preview}
                  onApprove={(ok, approvalType) => turn.approve(it.id, ok, approvalType)}
                />
              ) : (
                <Bubble key={`l${i}`} role={it.kind} text={it.text} images={it.kind === 'user' && it.images ? it.images.map(img => `data:${img.source.media_type};base64,${img.source.data}`) : undefined} />
              )
            )}

            {turn.running && turn.liveItems.every((it) => it.kind !== 'assistant' || !it.text) && (
              <div className="thinking">Thinking…</div>
            )}

            {turn.running && (
              <div className="agent-status">
                {turn.liveItems
                  .filter((it) => it.kind === 'tool')
                  .map((it) => (
                    <div key={it.id} className={`agent-status-item ${it.status}`}>
                      <span className="status-spinner" />
                      <span className="status-label">{getToolStatusLabel(it)}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        {modelToast && (
          <div className="model-toast">{modelToast}</div>
        )}

        <Composer disabled={!canChat} running={turn.running} onSend={send} onStop={turn.abort} />
      </main>

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onApply={(next) => {
            setSettings(next)
            if (!next.models.some((m) => m.value === model)) setModel(next.selectedModel)
          }}
        />
      )}
    </div>
  )
}

function Bubble({ role, text, images }: { role: 'user' | 'assistant'; text: string; images?: string[] }): JSX.Element {
  return (
    <div className={`bubble ${role}`}>
      <div className="bubble-role">{role === 'user' ? 'You' : 'Assistant'}</div>
      {role === 'assistant' ? (
        <Markdown text={text} />
      ) : (
        <>
          {images && images.length > 0 && (
            <div className="bubble-images">
              {images.map((src, i) => (
                <img key={i} src={src} alt={`Attached image ${i + 1}`} className="bubble-image" />
              ))}
            </div>
          )}
          {text && <div className="user-text">{text}</div>}
        </>
      )}
    </div>
  )
}
