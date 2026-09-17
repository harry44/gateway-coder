import { useState } from 'react'
import type { ToolPreview } from '../../../shared/types'

export interface ToolCardProps {
  name: string
  input: Record<string, unknown>
  status: 'running' | 'approval' | 'done' | 'rejected' | 'committed'
  ok?: boolean | null
  output?: string | null
  preview?: ToolPreview
  onApprove?: (approved: boolean, approvalType?: 'once' | 'always') => void
}

const TOOL_ICON: Record<string, string> = {
  list_dir: '📁',
  read_file: '📄',
  glob: '🔎',
  grep: '🔍',
  write_file: '✏️',
  edit_file: '✂️',
  run_command: '▶️'
}

function summarize(name: string, input: Record<string, unknown>): string {
  if (name === 'run_command') return String(input.command ?? '')
  if (name === 'grep') return String(input.pattern ?? '') + (input.path ? ` in ${input.path}` : '')
  if (name === 'glob') return String(input.pattern ?? '')
  return String(input.path ?? '')
}

function DiffView({ body }: { body: string }): JSX.Element {
  return (
    <pre className="diff">
      {body.split('\n').map((line, i) => {
        let cls = ''
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'add'
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'del'
        else if (line.startsWith('@@')) cls = 'hunk'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

export default function ToolCard(props: ToolCardProps): JSX.Element {
  const { name, input, status, ok, output, preview, onApprove } = props
  const [open, setOpen] = useState(status === 'approval')
  const [acted, setActed] = useState(false)

  const statusLabel =
    status === 'running'
      ? 'running…'
      : status === 'approval'
        ? 'needs approval'
        : status === 'rejected' || ok === false
          ? 'error'
          : 'done'

  const dotClass =
    status === 'running' || status === 'approval'
      ? 'pending'
      : status === 'rejected' || ok === false
        ? 'err'
        : 'ok'

  return (
    <div className={`tool-card ${status}`}>
      <div className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className="tool-icon">{TOOL_ICON[name] ?? '🛠'}</span>
        <span className="tool-name">{name}</span>
        <span className="tool-summary" title={summarize(name, input)}>
          {summarize(name, input)}
        </span>
        <span className={`tool-status ${dotClass}`}>{statusLabel}</span>
      </div>

      {status === 'approval' && preview && (
        <div className="tool-approval">
          <div className="approval-title">{preview.title}</div>
          {preview.kind === 'diff' ? (
            <DiffView body={preview.body} />
          ) : (
            <pre className={preview.kind === 'command' ? 'cmd' : ''}>{preview.body}</pre>
          )}
          {acted ? (
            <div className="approval-working">Working…</div>
          ) : (
            <div className="approval-actions">
              <button
                className="btn reject"
                onClick={() => {
                  setActed(true)
                  onApprove?.(false)
                }}
                type="button"
              >
                Reject
              </button>
              <button
                className="btn approve"
                onClick={() => {
                  setActed(true)
                  onApprove?.(true, 'once')
                }}
                type="button"
              >
                Allow once
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setActed(true)
                  onApprove?.(true, 'always')
                }}
                type="button"
              >
                Always allow
              </button>
            </div>
          )}
        </div>
      )}

      {open && status !== 'approval' && output != null && (
        <pre className="tool-output">{output}</pre>
      )}
    </div>
  )
}
